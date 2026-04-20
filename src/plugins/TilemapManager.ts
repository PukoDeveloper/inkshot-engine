import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Filter } from 'pixi.js';
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type { CoreUpdateParams } from '../types/rendering.js';
import type {
  AnimatedTileDef,
  AutotileGroupDef,
  AutotileMode,
  TilemapData,
  TilemapGetTileOutput,
  TilemapGetTileParams,
  TilemapLayerDef,
  TilemapLayerSetFilterParams,
  TilemapLoadOutput,
  TilemapLoadParams,
  TilesetDef,
} from '../types/tilemap.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default number of tiles per chunk edge (16 × 16 = 256 sprites/chunk). */
const DEFAULT_CHUNK_SIZE = 16;

/** Tile ID that means "empty cell" — no sprite rendered. */
const EMPTY_TILE = 0;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Pre-processed tileset ready for texture lookup. */
interface TilesetRuntime {
  def: TilesetDef;
  /** Pre-sliced sub-textures keyed by **local** (within-tileset) tile index. */
  textures: Map<number, Texture>;
}

/** Clock state for a single animated tile type. */
interface AnimatedTileRuntime {
  def: AnimatedTileDef;
  currentFrame: number;
  /** Accumulated time (ms) towards the next frame advance. */
  elapsed: number;
}

/** A rendered chunk of tiles for one layer. */
interface ChunkState {
  container: Container;
  /**
   * Flat sprite array: index = `localRow * chunkSize + localCol`.
   * `null` entries represent empty cells.
   */
  sprites: (Sprite | null)[];
}

/** Back-reference to a sprite that currently displays an animated tile. */
interface AnimatedSpriteRef {
  sprite: Sprite;
}

// ---------------------------------------------------------------------------
// TilemapManager
// ---------------------------------------------------------------------------

/**
 * High-performance tilemap renderer for large tile-based worlds.
 *
 * ### Features
 * - **Chunk-based rendering** — the map is divided into `chunkSize × chunkSize`
 *   tile blocks.  Each chunk is a Pixi `Container` with `cullable = true`, so
 *   the renderer automatically skips chunks outside the viewport.  Only the
 *   visible area creates GPU draw calls, making maps of 10 000 × 10 000+ tiles
 *   practical.
 * - **Multiple layers** — any number of tile layers stacked in Z order.
 *   Layers can have individual opacity and visibility settings.
 * - **Animated tiles** — tile IDs listed in `TilemapData.animatedTiles`
 *   cycle through frame sequences driven by the fixed-step `core/update` event.
 *   Only the individual sprites are updated on frame change; chunks are never
 *   fully rebuilt just for animation.
 * - **Auto-tiling (auto-connect)** — when `tilemap/set-tile` is called with
 *   `autoConnect: true`, the engine looks up the matching
 *   {@link AutotileGroupDef}, computes a 4-bit or 8-bit neighbour bitmask, and
 *   selects the correct tile variant automatically for the placed cell and all
 *   affected neighbours.
 * - **Collision sync** — layers marked with `collider: true` automatically
 *   push their tile data to `CollisionManager` via `collision/tilemap:set`.
 *
 * ### EventBus API
 * | Event                       | Params / Output                                     |
 * |-----------------------------|-----------------------------------------------------|
 * | `tilemap/load`              | `TilemapLoadParams → TilemapLoadOutput`             |
 * | `tilemap/unload`            | `TilemapUnloadParams`                               |
 * | `tilemap/set-tile`          | `TilemapSetTileParams`                              |
 * | `tilemap/get-tile`          | `TilemapGetTileParams → TilemapGetTileOutput`       |
 * | `tilemap/layer:set-filter`  | `TilemapLayerSetFilterParams`                       |
 * | `tilemap/loaded`            | `TilemapLoadedParams` (notification)                |
 * | `tilemap/unloaded`          | (notification)                                      |
 *
 * ### Direct API
 * ```ts
 * tilemapManager.getTile(layerIndex, col, row);
 * tilemapManager.setTile(layerIndex, col, row, tileId, { autoConnect: true });
 * ```
 *
 * @example Minimal setup
 * ```ts
 * const { core } = await createEngine({ plugins: [new TilemapManager()] });
 *
 * // Load atlas texture first via ResourceManager:
 * await core.events.emit('assets/load', { url: 'tileset.png', key: 'tileset' });
 *
 * // Load the tilemap:
 * await core.events.emit('tilemap/load', {
 *   mapData: {
 *     tileWidth: 16, tileHeight: 16,
 *     mapWidth: 200, mapHeight: 200,
 *     tilesets: [{ firstgid: 1, name: 'world', textureKey: 'tileset', tileWidth: 16, tileHeight: 16 }],
 *     layers: [{ name: 'ground', data: flatTileArray, collider: true, tileShapes: { 1: 'solid' } }],
 *     animatedTiles: { 3: { frames: [{ tileId: 3, duration: 150 }, { tileId: 4, duration: 150 }] } },
 *   },
 * });
 * ```
 */
export class TilemapManager implements EnginePlugin {
  readonly namespace = 'tilemap';

  private _core: Core | null = null;
  private _worldLayer: Container | null = null;

  // ── Current map state ──────────────────────────────────────────────────────

  private _data: TilemapData | null = null;
  private _chunkSize = DEFAULT_CHUNK_SIZE;

  /**
   * Tileset runtimes, sorted by `firstgid` **descending** so that the first
   * element whose `firstgid ≤ gid` is always the correct tileset.
   */
  private _tilesets: TilesetRuntime[] = [];

  /** One container per layer, appended to the world layer. */
  private _layerContainers: Container[] = [];

  /**
   * Chunk containers keyed by `"L{layerIdx}:{chunkX}:{chunkY}"`.
   * Chunks are built lazily; this map always reflects what is on screen.
   */
  private _chunks: Map<string, ChunkState> = new Map();

  // ── Animated tile state ───────────────────────────────────────────────────

  /** Per-tile-ID clock and frame pointer. */
  private _animatedTiles: Map<number, AnimatedTileRuntime> = new Map();

  /**
   * All sprites currently displaying a given animated tile ID.
   * Updated when chunks are (re)built.
   */
  private _animatedSpriteRefs: Map<number, AnimatedSpriteRef[]> = new Map();

  // ── Auto-tile state ───────────────────────────────────────────────────────

  /** Fast membership lookup: tile ID → its auto-tile group definition. */
  private _autotileMembership: Map<number, AutotileGroupDef> = new Map();

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    const { output } = core.events.emitSync('renderer/layer', { name: 'world' }) as {
      output: { layer: Container };
    };
    this._worldLayer = output.layer;

    core.events.on(this.namespace, 'tilemap/load', this._onLoad);
    core.events.on(this.namespace, 'tilemap/unload', this._onUnload);
    core.events.on(this.namespace, 'tilemap/set-tile', this._onSetTile);
    core.events.on(this.namespace, 'tilemap/get-tile', this._onGetTile);
    core.events.on(this.namespace, 'tilemap/layer:set-filter', this._onLayerSetFilter);
    core.events.on(this.namespace, 'core/update', this._onUpdate);
  }

  destroy(core: Core): void {
    this._doUnload();
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Direct (non-event) API — useful for game code that holds a reference
  // ---------------------------------------------------------------------------

  /**
   * Return the global tile ID at `(layerIndex, col, row)`.
   * Returns `0` when the cell is empty or out of bounds.
   */
  getTile(layerIndex: number, col: number, row: number): number {
    if (!this._data) return EMPTY_TILE;
    const layer = this._data.layers[layerIndex];
    if (!layer) return EMPTY_TILE;
    const idx = row * this._data.mapWidth + col;
    return layer.data[idx] ?? EMPTY_TILE;
  }

  /**
   * Place a tile at `(layerIndex, col, row)`.
   *
   * @param autoConnect  When `true`, recalculate auto-tile bitmasks for the
   *                     placed cell and its neighbours.
   */
  setTile(
    layerIndex: number,
    col: number,
    row: number,
    tileId: number,
    options: { autoConnect?: boolean } = {},
  ): void {
    if (!this._data) return;
    const layer = this._data.layers[layerIndex];
    if (!layer) return;
    const idx = row * this._data.mapWidth + col;
    if (idx < 0 || idx >= layer.data.length) return;

    if (options.autoConnect && this._autotileMembership.size > 0) {
      this._applyAutoTile(layerIndex, col, row, tileId);
    } else {
      this._setTileRaw(layerIndex, col, row, tileId);
    }

    if (layer.collider) {
      this._syncCollision(layer, this._data);
    }
  }

  /**
   * Apply Pixi `Filter`(s) to a layer's `Container` at runtime.
   *
   * Pass `null` or an empty array to remove all filters from the layer.
   *
   * @param layerIndex  Zero-based layer index.
   * @param filters     Filter(s) to apply, or `null` / `[]` to clear.
   */
  setLayerFilter(layerIndex: number, filters: Filter | Filter[] | null): void {
    const container = this._layerContainers[layerIndex];
    if (!container) return;

    if (!filters || (Array.isArray(filters) && filters.length === 0)) {
      container.filters = [];
    } else {
      container.filters = Array.isArray(filters) ? filters : [filters];
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  private readonly _onLoad = async (
    params: TilemapLoadParams,
    output: TilemapLoadOutput,
  ): Promise<void> => {
    this._doUnload();

    const { mapData } = params;
    this._data = mapData;
    this._chunkSize = mapData.chunkSize ?? DEFAULT_CHUNK_SIZE;

    // Build tileset runtimes (texture slicing)
    this._tilesets = this._buildTilesets(mapData.tilesets);

    // Build auto-tile membership index
    if (mapData.autotileGroups) {
      for (const group of mapData.autotileGroups) {
        for (const id of group.memberTileIds) {
          this._autotileMembership.set(id, group);
        }
      }
    }

    // Initialise animated tile runtimes
    if (mapData.animatedTiles) {
      for (const [rawKey, def] of Object.entries(mapData.animatedTiles)) {
        const tileId = Number(rawKey);
        this._animatedTiles.set(tileId, { def, currentFrame: 0, elapsed: 0 });
        this._animatedSpriteRefs.set(tileId, []);
      }
    }

    // Build all layers and their chunks
    let totalTiles = 0;

    for (let li = 0; li < mapData.layers.length; li++) {
      const layerDef = mapData.layers[li];

      const layerContainer = new Container();
      layerContainer.label = `tilemap:layer:${layerDef.name}`;
      layerContainer.zIndex = li * 10 + (layerDef.zOffset ?? 0);
      layerContainer.visible = layerDef.visible !== false;
      layerContainer.alpha = layerDef.opacity ?? 1;

      if (layerDef.filters) {
        layerContainer.filters = Array.isArray(layerDef.filters)
          ? layerDef.filters
          : [layerDef.filters];
      }

      this._layerContainers.push(layerContainer);
      this._worldLayer!.addChild(layerContainer);

      // Build every chunk for this layer eagerly.
      // Pixi's per-container culling (cullable = true) ensures only visible
      // chunks are processed by the renderer at runtime.
      const chunksX = Math.ceil(mapData.mapWidth / this._chunkSize);
      const chunksY = Math.ceil(mapData.mapHeight / this._chunkSize);

      for (let cy = 0; cy < chunksY; cy++) {
        for (let cx = 0; cx < chunksX; cx++) {
          totalTiles += this._buildChunk(li, cx, cy);
        }
      }

      // Sync collision data for collision layers
      if (layerDef.collider) {
        this._syncCollision(layerDef, mapData);
      }
    }

    output.layerCount = mapData.layers.length;
    output.tileCount = totalTiles;

    this._core!.events.emitSync('tilemap/loaded', { mapData });
  };

  private readonly _onUnload = (): void => {
    this._doUnload();
    this._core?.events.emitSync('tilemap/unloaded', {});
  };

  private readonly _onSetTile = (params: {
    layerIndex: number;
    col: number;
    row: number;
    tileId: number;
    autoConnect?: boolean;
  }): void => {
    this.setTile(params.layerIndex, params.col, params.row, params.tileId, {
      autoConnect: params.autoConnect,
    });
  };

  private readonly _onGetTile = (
    params: TilemapGetTileParams,
    output: TilemapGetTileOutput,
  ): void => {
    output.tileId = this.getTile(params.layerIndex, params.col, params.row);
  };

  private readonly _onLayerSetFilter = (params: TilemapLayerSetFilterParams): void => {
    this.setLayerFilter(params.layerIndex, params.filters);
  };

  private readonly _onUpdate = (params: CoreUpdateParams): void => {
    if (this._animatedTiles.size === 0) return;

    for (const [tileId, runtime] of this._animatedTiles) {
      runtime.elapsed += params.dt;

      const frame = runtime.def.frames[runtime.currentFrame];
      if (!frame) continue;

      if (runtime.elapsed >= frame.duration) {
        // Consume duration and advance frame (may skip multiple if dt is large)
        runtime.elapsed -= frame.duration;
        runtime.currentFrame = (runtime.currentFrame + 1) % runtime.def.frames.length;

        // Resolve new texture
        const newFrame = runtime.def.frames[runtime.currentFrame];
        const newTexture = this._getTileTexture(newFrame.tileId);
        if (!newTexture) continue;

        // Update only the sprites that show this tile — no chunk rebuild needed
        const refs = this._animatedSpriteRefs.get(tileId);
        if (refs) {
          for (const ref of refs) {
            ref.sprite.texture = newTexture;
          }
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Core private helpers
  // ---------------------------------------------------------------------------

  /** Tear down all visual state and clear all internal maps. */
  private _doUnload(): void {
    for (const container of this._layerContainers) {
      this._worldLayer?.removeChild(container);
      container.destroy({ children: true });
    }
    this._layerContainers = [];
    this._chunks.clear();

    this._animatedTiles.clear();
    this._animatedSpriteRefs.clear();

    // Destroy pre-sliced sub-textures
    for (const ts of this._tilesets) {
      for (const tex of ts.textures.values()) {
        tex.destroy();
      }
      ts.textures.clear();
    }
    this._tilesets = [];

    this._autotileMembership.clear();
    this._data = null;
  }

  /**
   * Build `TilesetRuntime` objects from the raw `TilesetDef` array.
   *
   * Each sub-texture is sliced from the atlas using a `Rectangle` frame and
   * stored by local tile index for O(1) lookup.
   */
  private _buildTilesets(defs: TilesetDef[]): TilesetRuntime[] {
    const runtimes: TilesetRuntime[] = [];

    for (const def of defs) {
      const baseTexture = Assets.get<Texture>(def.textureKey);
      const { tileWidth, tileHeight } = def;
      const spacing = def.spacing ?? 0;
      const margin = def.margin ?? 0;
      const texW = baseTexture.width;
      const texH = baseTexture.height;

      const tilesPerRow =
        def.columns ??
        Math.floor((texW - margin * 2 + spacing) / (tileWidth + spacing));
      const tilesPerCol = Math.floor(
        (texH - margin * 2 + spacing) / (tileHeight + spacing),
      );
      const totalTiles = tilesPerRow * tilesPerCol;

      const textures = new Map<number, Texture>();

      for (let localId = 0; localId < totalTiles; localId++) {
        const tcol = localId % tilesPerRow;
        const trow = Math.floor(localId / tilesPerRow);
        const x = margin + tcol * (tileWidth + spacing);
        const y = margin + trow * (tileHeight + spacing);

        textures.set(
          localId,
          new Texture({
            source: baseTexture.source,
            frame: new Rectangle(x, y, tileWidth, tileHeight),
          }),
        );
      }

      runtimes.push({ def, textures });
    }

    // Sort descending by firstgid so the first entry with firstgid ≤ gid wins
    runtimes.sort((a, b) => b.def.firstgid - a.def.firstgid);
    return runtimes;
  }

  /**
   * (Re)build the chunk at `(chunkX, chunkY)` for the given layer.
   *
   * Any pre-existing chunk at the same coordinates is destroyed first.
   * Returns the number of non-empty tile cells placed in the chunk.
   */
  private _buildChunk(layerIndex: number, chunkX: number, chunkY: number): number {
    if (!this._data) return 0;
    const mapData = this._data;
    const layerDef = mapData.layers[layerIndex];
    const layerContainer = this._layerContainers[layerIndex];
    if (!layerDef || !layerContainer) return 0;

    const key = this._chunkKey(layerIndex, chunkX, chunkY);

    // Tear down the existing chunk (if rebuilding after set-tile)
    const existing = this._chunks.get(key);
    if (existing) {
      // Remove animated sprite refs that belonged to this chunk before
      // we destroy the sprites
      for (const [tileId, refs] of this._animatedSpriteRefs) {
        const nextRefs = refs.filter((r) => !existing.sprites.includes(r.sprite as Sprite));
        this._animatedSpriteRefs.set(tileId, nextRefs);
      }
      layerContainer.removeChild(existing.container);
      existing.container.destroy({ children: true });
      this._chunks.delete(key);
    }

    const chunkContainer = new Container();
    chunkContainer.label = `tilemap:chunk:L${layerIndex}:${chunkX}:${chunkY}`;
    chunkContainer.x = chunkX * this._chunkSize * mapData.tileWidth;
    chunkContainer.y = chunkY * this._chunkSize * mapData.tileHeight;
    chunkContainer.cullable = true;

    const totalSlots = this._chunkSize * this._chunkSize;
    const sprites: (Sprite | null)[] = new Array(totalSlots).fill(null);
    let tileCount = 0;

    for (let localRow = 0; localRow < this._chunkSize; localRow++) {
      for (let localCol = 0; localCol < this._chunkSize; localCol++) {
        const worldCol = chunkX * this._chunkSize + localCol;
        const worldRow = chunkY * this._chunkSize + localRow;

        if (worldCol >= mapData.mapWidth || worldRow >= mapData.mapHeight) continue;

        const tileId =
          layerDef.data[worldRow * mapData.mapWidth + worldCol] ?? EMPTY_TILE;
        if (tileId === EMPTY_TILE) continue;

        const texture = this._getTileTexture(tileId);
        if (!texture) continue;

        const sprite = new Sprite(texture);
        sprite.x = localCol * mapData.tileWidth;
        sprite.y = localRow * mapData.tileHeight;

        chunkContainer.addChild(sprite);
        sprites[localRow * this._chunkSize + localCol] = sprite;
        tileCount++;

        // Register sprite for direct animated-tile texture swapping
        if (this._animatedTiles.has(tileId)) {
          this._animatedSpriteRefs.get(tileId)!.push({ sprite });
        }
      }
    }

    layerContainer.addChild(chunkContainer);
    this._chunks.set(key, { container: chunkContainer, sprites });

    return tileCount;
  }

  /**
   * Write a tile ID directly into the layer data and rebuild the affected chunk.
   * Does **not** run auto-tile recalculation.
   */
  private _setTileRaw(
    layerIndex: number,
    col: number,
    row: number,
    tileId: number,
  ): void {
    if (!this._data) return;
    const layerDef = this._data.layers[layerIndex];
    layerDef.data[row * this._data.mapWidth + col] = tileId;

    const chunkX = Math.floor(col / this._chunkSize);
    const chunkY = Math.floor(row / this._chunkSize);
    this._buildChunk(layerIndex, chunkX, chunkY);
  }

  /**
   * Place `tileId` at `(col, row)` and recalculate auto-tile bitmasks for the
   * placed cell and all its neighbours that are members of the same group.
   */
  private _applyAutoTile(
    layerIndex: number,
    col: number,
    row: number,
    tileId: number,
  ): void {
    if (!this._data) return;

    const group = this._autotileMembership.get(tileId);
    if (!group) {
      // No auto-tile group for this tile — fall back to raw placement
      this._setTileRaw(layerIndex, col, row, tileId);
      return;
    }

    const memberSet = new Set(group.memberTileIds);
    const layerDef = this._data.layers[layerIndex];

    // Write the raw tile first so neighbours can see it during recalculation
    layerDef.data[row * this._data.mapWidth + col] = tileId;

    // Collect all cells to recalculate: the placed cell + its neighbours
    const neighbourCoords = this._getNeighbourCoords(col, row, group.mode);
    const cellsToUpdate = [{ col, row }, ...neighbourCoords];

    const affectedChunkKeys = new Set<string>();

    for (const cell of cellsToUpdate) {
      const existingId =
        layerDef.data[cell.row * this._data.mapWidth + cell.col] ?? EMPTY_TILE;

      // Only recalculate neighbours that belong to the same group
      if (!(cell.col === col && cell.row === row) && !memberSet.has(existingId)) {
        continue;
      }

      const bitmask = this._computeBitmask(
        cell.col,
        cell.row,
        group.mode,
        memberSet,
        layerDef.data,
      );

      const resolvedId = group.tileMap[bitmask] ?? existingId;
      layerDef.data[cell.row * this._data.mapWidth + cell.col] = resolvedId;

      affectedChunkKeys.add(
        this._chunkKey(
          layerIndex,
          Math.floor(cell.col / this._chunkSize),
          Math.floor(cell.row / this._chunkSize),
        ),
      );
    }

    // Rebuild only the chunks that contain changed cells
    for (const ck of affectedChunkKeys) {
      const [liStr, cxStr, cyStr] = ck.split(':');
      const li = Number(liStr);
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      this._buildChunk(li, cx, cy);
    }
  }

  /**
   * Return the world-space tile coordinates of all neighbours for the given
   * auto-tile mode, filtered to stay within map bounds.
   */
  private _getNeighbourCoords(
    col: number,
    row: number,
    mode: AutotileMode,
  ): { col: number; row: number }[] {
    if (!this._data) return [];

    const offsets4 = [
      { dc: 0, dr: -1 }, // N
      { dc: 1, dr: 0 },  // E
      { dc: 0, dr: 1 },  // S
      { dc: -1, dr: 0 }, // W
    ];
    const offsets8 = [
      ...offsets4,
      { dc: 1, dr: -1 },  // NE
      { dc: 1, dr: 1 },   // SE
      { dc: -1, dr: 1 },  // SW
      { dc: -1, dr: -1 }, // NW
    ];

    const offsets = mode === '8bit' ? offsets8 : offsets4;
    const { mapWidth, mapHeight } = this._data;

    return offsets
      .map((o) => ({ col: col + o.dc, row: row + o.dr }))
      .filter((c) => c.col >= 0 && c.col < mapWidth && c.row >= 0 && c.row < mapHeight);
  }

  /**
   * Compute the neighbour bitmask for a given cell.
   *
   * ### 4-bit bit layout
   * `bit0=N  bit1=E  bit2=S  bit3=W`
   *
   * ### 8-bit bit layout (superset)
   * `bit0=N  bit1=E  bit2=S  bit3=W  bit4=NE  bit5=SE  bit6=SW  bit7=NW`
   */
  private _computeBitmask(
    col: number,
    row: number,
    mode: AutotileMode,
    memberSet: Set<number>,
    layerData: number[],
  ): number {
    if (!this._data) return 0;
    const { mapWidth, mapHeight } = this._data;

    const isMember = (dc: number, dr: number): boolean => {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= mapWidth || nr < 0 || nr >= mapHeight) return false;
      return memberSet.has(layerData[nr * mapWidth + nc] ?? EMPTY_TILE);
    };

    const n = isMember(0, -1) ? 1 : 0;
    const e = isMember(1, 0) ? 2 : 0;
    const s = isMember(0, 1) ? 4 : 0;
    const w = isMember(-1, 0) ? 8 : 0;

    if (mode === '4bit') return n | e | s | w;

    const ne = isMember(1, -1) ? 16 : 0;
    const se = isMember(1, 1) ? 32 : 0;
    const sw = isMember(-1, 1) ? 64 : 0;
    const nw = isMember(-1, -1) ? 128 : 0;

    return n | e | s | w | ne | se | sw | nw;
  }

  /**
   * Resolve the Pixi `Texture` for a global tile ID by finding the correct
   * tileset and returning the pre-sliced sub-texture.
   *
   * Returns `null` for tile ID `0` (empty) or when no matching tileset exists.
   */
  private _getTileTexture(tileId: number): Texture | null {
    if (tileId === EMPTY_TILE) return null;
    // _tilesets is sorted descending by firstgid; first match wins
    for (const ts of this._tilesets) {
      if (tileId >= ts.def.firstgid) {
        return ts.textures.get(tileId - ts.def.firstgid) ?? null;
      }
    }
    return null;
  }

  /**
   * Push the current state of `layerDef.data` to the `CollisionManager` as a
   * tile shape grid.
   */
  private _syncCollision(layerDef: TilemapLayerDef, mapData: TilemapData): void {
    if (!this._core) return;

    const rows: number[][] = [];
    for (let r = 0; r < mapData.mapHeight; r++) {
      rows.push(
        layerDef.data.slice(r * mapData.mapWidth, (r + 1) * mapData.mapWidth),
      );
    }

    this._core.events.emitSync('collision/tilemap:set', {
      tileSize: mapData.tileWidth,
      layers: rows,
      tileShapes: layerDef.tileShapes ?? {},
    });
  }

  /** Stable string key for a chunk. Format: `"{layerIndex}:{chunkX}:{chunkY}"`. */
  private _chunkKey(layerIndex: number, chunkX: number, chunkY: number): string {
    return `${layerIndex}:${chunkX}:${chunkY}`;
  }
}
