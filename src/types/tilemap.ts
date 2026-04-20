import type { Filter } from 'pixi.js';

// ---------------------------------------------------------------------------
// Tileset
// ---------------------------------------------------------------------------

/**
 * Definition of a tileset atlas used by a {@link TilemapData}.
 *
 * A tileset is a single sprite-sheet image sliced into equal-sized tiles.
 * Tiles are indexed starting from `firstgid`.  This layout is intentionally
 * compatible with the Tiled map editor JSON export format so that Tiled maps
 * can be adapted with minimal mapping.
 */
export interface TilesetDef {
  /**
   * First global tile ID (GID) assigned to this tileset.
   *
   * Tile IDs in layer data that fall in the range
   * `[firstgid, firstgid + tileCount)` belong to this tileset.
   *
   * Tiled convention: the first tileset in a map has `firstgid: 1`.
   * GID `0` is always reserved for "empty" (no tile).
   */
  firstgid: number;

  /** Human-readable display name (informational only). */
  name: string;

  /**
   * Asset key that was previously loaded via `assets/load`.
   * Used with `Assets.get(textureKey)` to retrieve the Pixi `Texture`.
   */
  textureKey: string;

  /** Width of each individual tile in pixels. */
  tileWidth: number;

  /** Height of each individual tile in pixels. */
  tileHeight: number;

  /**
   * Number of tile columns in the atlas.
   * If omitted, computed automatically from the texture width, `tileWidth`,
   * `spacing`, and `margin`.
   */
  columns?: number;

  /**
   * Pixel gap between adjacent tiles in the atlas.
   * Defaults to `0`.
   */
  spacing?: number;

  /**
   * Pixel border around the entire atlas image.
   * Defaults to `0`.
   */
  margin?: number;
}

// ---------------------------------------------------------------------------
// Animated tiles
// ---------------------------------------------------------------------------

/** A single frame in a tile animation sequence. */
export interface TileAnimationFrame {
  /** Global tile ID to display for this frame. */
  tileId: number;
  /** Duration (milliseconds) for which this frame is shown. */
  duration: number;
}

/**
 * Animation definition for a specific global tile ID.
 *
 * When a tile with this ID is placed in a layer, it cycles through `frames`
 * in order, looping indefinitely.
 *
 * Keyed by global tile ID in {@link TilemapData.animatedTiles}.
 */
export interface AnimatedTileDef {
  /** Ordered list of frames. Must contain at least one entry. */
  frames: TileAnimationFrame[];
}

// ---------------------------------------------------------------------------
// Auto-tiling (auto-connect)
// ---------------------------------------------------------------------------

/**
 * Auto-tile connection mode.
 *
 * - `'4bit'` — checks the **4 cardinal** neighbours (N / E / S / W).
 *   Produces bitmask values `0–15` (2⁴).
 * - `'8bit'` — checks all **8** neighbours (N / NE / E / SE / S / SW / W / NW).
 *   Produces bitmask values `0–255` (2⁸).
 */
export type AutotileMode = '4bit' | '8bit';

/**
 * Bit positions used by the auto-tile bitmask.
 *
 * ### 4-bit layout
 * | Bit | Direction |
 * |-----|-----------|
 * |   0 | North     |
 * |   1 | East      |
 * |   2 | South     |
 * |   3 | West      |
 *
 * ### 8-bit layout (superset of 4-bit)
 * | Bit | Direction    |
 * |-----|--------------|
 * |   0 | North        |
 * |   1 | East         |
 * |   2 | South        |
 * |   3 | West         |
 * |   4 | North-East   |
 * |   5 | South-East   |
 * |   6 | South-West   |
 * |   7 | North-West   |
 */
export const AutotileBit = {
  N: 1,
  E: 2,
  S: 4,
  W: 8,
  NE: 16,
  SE: 32,
  SW: 64,
  NW: 128,
} as const;

/**
 * Defines how tiles in a group auto-connect to their neighbours when placed
 * via `tilemap/set-tile` with `autoConnect: true`.
 *
 * ### How it works
 * 1. The engine checks whether each of the cell's neighbours contains a tile
 *    whose ID appears in `memberTileIds`.
 * 2. A bitmask is assembled from the matching neighbours.
 * 3. The resolved tile ID is looked up in `tileMap[bitmask]`.
 * 4. The same recalculation is applied to all affected neighbours.
 *
 * @example 4-bit grass group
 * ```ts
 * {
 *   memberTileIds: [10, 11, 12, 13, 14, 15],
 *   mode: '4bit',
 *   tileMap: {
 *     0:  10,  // isolated
 *     3:  11,  // N + E corner
 *     15: 12,  // fully connected
 *     // ...
 *   }
 * }
 * ```
 */
export interface AutotileGroupDef {
  /**
   * All global tile IDs that belong to this group.
   *
   * A neighbour cell is counted as "matching" only when its tile ID is in
   * this list.  The placed tile itself does **not** need to be a member; any
   * tile ID triggers the lookup as long as its neighbours are members.
   */
  memberTileIds: number[];

  /** Whether to use 4-bit (4 neighbours) or 8-bit (8 neighbours) bitmask. */
  mode: AutotileMode;

  /**
   * Maps bitmask value → global tile ID to render.
   *
   * For a `'4bit'` mode group, keys range from `0` to `15`.
   * For an `'8bit'` mode group, keys range from `0` to `255`.
   *
   * If a bitmask has no mapping entry, the placed tile ID is kept as-is.
   */
  tileMap: Record<number, number>;
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

/**
 * A single tile layer inside a {@link TilemapData}.
 *
 * Layers are rendered bottom-to-top (index `0` is drawn first).
 */
export interface TilemapLayerDef {
  /** Display / debug name for the layer. */
  name: string;

  /**
   * Flat, **row-major** tile ID array.
   *
   * Cell index formula: `row * mapWidth + col`.
   * Tile ID `0` means "empty cell" — no sprite is rendered.
   */
  data: number[];

  /** Whether this layer is visible. Defaults to `true`. */
  visible?: boolean;

  /** Opacity `0`–`1` applied to the whole layer container. Defaults to `1`. */
  opacity?: number;

  /**
   * Z-index offset added on top of the default layer ordering.
   *
   * Layers are ordered by their array index by default (bottom = index 0).
   * Use `zOffset` to override that ordering for specific layers (e.g. placing
   * a foreground decoration layer between two character layers).
   */
  zOffset?: number;

  /**
   * When `true`, the layer's solid tile data is automatically synchronised
   * to the `CollisionManager` via `collision/tilemap:set`.
   */
  collider?: boolean;

  /**
   * Global tile IDs in this layer that are treated as **solid** (impassable).
   * Required when `collider` is `true`; ignored otherwise.
   */
  solidTileIds?: number[];

  /**
   * One or more Pixi `Filter` objects applied to this layer's `Container`.
   *
   * Filters are applied immediately when the layer is created during
   * `tilemap/load`, and can be updated at runtime via
   * `tilemap/layer:set-filter`.
   *
   * @example Apply a colour tint to a single layer
   * ```ts
   * import { ColorMatrixFilter } from 'pixi.js';
   *
   * const tint = new ColorMatrixFilter();
   * tint.tint(0xff0000); // red overlay
   *
   * await core.events.emit('tilemap/load', {
   *   mapData: {
   *     layers: [{ name: 'lava', data: [...], filters: tint }],
   *     // ...
   *   },
   * });
   * ```
   */
  filters?: Filter | Filter[];
}

// ---------------------------------------------------------------------------
// Map data
// ---------------------------------------------------------------------------

/**
 * Complete description of a tile map.
 *
 * Pass this object to `tilemap/load` to render the map and start all
 * associated systems (animated tiles, auto-tiling, collision syncing).
 *
 * @example
 * ```ts
 * await core.events.emit('tilemap/load', {
 *   mapData: {
 *     tileWidth: 16, tileHeight: 16,
 *     mapWidth: 100, mapHeight: 100,
 *     tilesets: [{ firstgid: 1, name: 'world', textureKey: 'tileset', tileWidth: 16, tileHeight: 16 }],
 *     layers: [{ name: 'ground', data: [...flatArray] }],
 *   },
 * });
 * ```
 */
export interface TilemapData {
  /** Width of a single tile in pixels (for all tilesets, unless overridden per-tileset). */
  tileWidth: number;

  /** Height of a single tile in pixels. */
  tileHeight: number;

  /** Map width measured in tiles. */
  mapWidth: number;

  /** Map height measured in tiles. */
  mapHeight: number;

  /** Ordered list of tilesets referenced by tile IDs in layer data. */
  tilesets: TilesetDef[];

  /** Ordered list of layers (index `0` is rendered first / bottom). */
  layers: TilemapLayerDef[];

  /**
   * Animated tile definitions.
   *
   * Keys are **global tile IDs** that should cycle through frames instead of
   * being displayed as a static sprite.
   *
   * @example
   * ```ts
   * animatedTiles: {
   *   5: { frames: [{ tileId: 5, duration: 200 }, { tileId: 6, duration: 200 }] },
   * }
   * ```
   */
  animatedTiles?: Record<number, AnimatedTileDef>;

  /**
   * Auto-tile group definitions.
   *
   * When a tile is placed via `tilemap/set-tile` with `autoConnect: true`,
   * the engine looks for a matching group and recalculates bitmasks for the
   * placed cell and all its neighbours.
   */
  autotileGroups?: AutotileGroupDef[];

  /**
   * Number of tiles along each axis of a render chunk.
   *
   * A chunk is a `Container` that holds `chunkSize × chunkSize` sprites.
   * Only chunks that intersect the camera viewport are rendered (Pixi culling).
   *
   * Defaults to `16` (256 sprites per chunk).
   * - Smaller values → finer culling granularity but more containers.
   * - Larger values → fewer containers but coarser culling.
   */
  chunkSize?: number;
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/** Params for `tilemap/load`. */
export interface TilemapLoadParams {
  /** Full map data to load and render. */
  mapData: TilemapData;
}

/** Output for `tilemap/load`. */
export interface TilemapLoadOutput {
  /** Number of layers that were loaded. */
  layerCount: number;
  /** Total number of non-empty tile cells across all layers. */
  tileCount: number;
}

/** Params for `tilemap/unload`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TilemapUnloadParams {}

/** Params for `tilemap/set-tile`. */
export interface TilemapSetTileParams {
  /** Zero-based layer index (`0` = first/bottom layer). */
  layerIndex: number;
  /** Column index (x-axis tile coordinate). */
  col: number;
  /** Row index (y-axis tile coordinate). */
  row: number;
  /**
   * Global tile ID to place.
   * Use `0` to clear the cell (no sprite rendered).
   */
  tileId: number;
  /**
   * When `true`, recalculate auto-tiling bitmasks for this cell and its
   * neighbours using the matching {@link AutotileGroupDef}.
   *
   * Has no effect when no auto-tile group covers the placed tile ID.
   */
  autoConnect?: boolean;
}

/** Params for `tilemap/get-tile`. */
export interface TilemapGetTileParams {
  /** Zero-based layer index. */
  layerIndex: number;
  /** Column index. */
  col: number;
  /** Row index. */
  row: number;
}

/** Output for `tilemap/get-tile`. */
export interface TilemapGetTileOutput {
  /**
   * Global tile ID at the requested cell.
   * Returns `0` when the cell is empty or coordinates are out of bounds.
   */
  tileId: number;
}

/** Notification params emitted with `tilemap/loaded` after a successful load. */
export interface TilemapLoadedParams {
  mapData: TilemapData;
}

/** Notification params emitted with `tilemap/unloaded` after the map is removed. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TilemapUnloadedParams {}

/** Params for `tilemap/layer:set-filter`. */
export interface TilemapLayerSetFilterParams {
  /** Zero-based layer index to update. */
  layerIndex: number;
  /**
   * One or more Pixi `Filter` objects to apply to the layer.
   * Pass `null` or an empty array to remove all filters from the layer.
   */
  filters: Filter | Filter[] | null;
}
