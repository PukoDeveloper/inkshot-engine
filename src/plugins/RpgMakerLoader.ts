import type { TilemapData, TilesetDef, TilemapLayerDef } from '../types/tilemap.js';
import type { TileCollisionShape } from '../types/physics.js';

// ---------------------------------------------------------------------------
// RPG Maker MV/MZ JSON types
// ---------------------------------------------------------------------------

/**
 * Root structure of an RPG Maker MV/MZ map file (`MapXXX.json`).
 *
 * Relevant fields for tile rendering:
 * - `tilesetId`  — references an entry in `Tilesets.json`
 * - `width` / `height` — map size in tiles
 * - `data` — flat array of size `width * height * 6` (see layer layout below)
 */
export interface RpgMakerMap {
  /** ID that selects the tileset from `Tilesets.json`. */
  tilesetId: number;
  /** Map width measured in tiles. */
  width: number;
  /** Map height measured in tiles. */
  height: number;
  /**
   * Flat tile-ID array.  Layout: `data[z * width * height + y * width + x]`.
   *
   * | z | Contents                        |
   * |---|---------------------------------|
   * | 0 | Lower layer (ground/A-tiles)    |
   * | 1 | Lower layer 2                   |
   * | 2 | Upper layer (objects/B-E tiles) |
   * | 3 | Upper layer 2                   |
   * | 4 | Shadow flags (ignored)          |
   * | 5 | Region IDs  (ignored)           |
   */
  data: number[];
  /** Event objects on the map (not used by this loader). */
  events?: unknown[];
}

/**
 * A single tileset entry from RPG Maker's `Tilesets.json` array.
 *
 * `Tilesets.json` is a top-level array where index 0 is always `null` and
 * subsequent entries are tileset definitions keyed by their `id` field.
 */
export interface RpgMakerTileset {
  /** Unique tileset ID (matches `RpgMakerMap.tilesetId`). */
  id: number;
  /** Human-readable name shown in the editor. */
  name: string;
  /**
   * Per-tile passability / behaviour flags (8192 entries).
   *
   * Bit layout for passability (bits 0-3):
   * | Bit | Direction | Set = passable |
   * |-----|-----------|----------------|
   * |   0 | Down      | player can exit downward  |
   * |   1 | Left      | player can exit left      |
   * |   2 | Right     | player can exit right     |
   * |   3 | Up        | player can exit upward    |
   *
   * A tile with `flags & 0x0F === 0` is fully impassable (solid wall).
   * A tile with `flags & 0x0F === 0x0F` is passable from all directions.
   */
  flags: number[];
  /**
   * Tileset mode:
   * - `0` World-type (TileA1-A4 autotiles displayed in field/dungeon mode)
   * - `1` Field-type
   * - `2` Area-type
   */
  mode: 0 | 1 | 2;
  /**
   * Nine image filenames (without extension) for each tileset slot:
   *
   * | Index | Slot  | Filename example | Size (px)  |
   * |-------|-------|------------------|------------|
   * |   0   | TileA1 | `TileA1`        | 768 × 576  |
   * |   1   | TileA2 | `TileA2`        | 768 × 576  |
   * |   2   | TileA3 | `TileA3`        | 768 × 576  |
   * |   3   | TileA4 | `TileA4`        | 768 × 576  |
   * |   4   | TileA5 | `TileA5`        | 384 × 768  |
   * |   5   | TileB  | `TileB`         | 768 × 768  |
   * |   6   | TileC  | `TileC`         | 768 × 768  |
   * |   7   | TileD  | `TileD`         | 768 × 768  |
   * |   8   | TileE  | `TileE`         | 768 × 768  |
   *
   * An empty string means the slot is unused for this tileset.
   */
  tilesetNames: [string, string, string, string, string, string, string, string, string];
}

// ---------------------------------------------------------------------------
// RPG Maker tile ID constants
// ---------------------------------------------------------------------------

/**
 * Base GID (global tile ID) for each tileset slot, matching RPG Maker MV/MZ
 * source constants (`Tilemap.TILE_ID_*`).
 */
const SLOT_BASE = {
  B:   0,
  C:   256,
  D:   512,
  E:   768,
  A5:  1536,
  A1:  2048,
  A2:  2816,
  A3:  4352,
  A4:  5888,
} as const;

/** Number of GIDs consumed by each slot in RPG Maker's encoding. */
const SLOT_RANGE = {
  B:   256,
  C:   256,
  D:   256,
  E:   256,
  A5:  128,
  A1:  768,  // 16 autotile types × 48 variations
  A2:  1536, // 32 autotile types × 48 variations
  A3:  1536,
  A4:  1536,
} as const;

/** Tile pixel size used by RPG Maker MV/MZ. */
const TILE_SIZE = 48;

/**
 * Number of tile columns in each slot's source image.
 *
 * | Slot | Image size (px) | Tile columns |
 * |------|-----------------|--------------|
 * | B/C/D/E | 768 × 768  | 16           |
 * | A5      | 384 × 768  |  8           |
 * | A1-A4   | 768 × 576  | 16           |
 */
const SLOT_COLUMNS = {
  B:  16,
  C:  16,
  D:  16,
  E:  16,
  A5:  8,
  A1: 16,
  A2: 16,
  A3: 16,
  A4: 16,
} as const;

// ---------------------------------------------------------------------------
// Autotile GID remapping
// ---------------------------------------------------------------------------

/**
 * For RPG Maker's autotile slots (A1–A4), each tile ID encodes both an
 * *autotile type* (which of the N pattern sets) and a *variation index*
 * (which of the 48 neighbour-bitmask results).
 *
 * The engine's TilemapManager slices textures as a simple grid; it cannot
 * natively composite the quarter-tile sources that RPG Maker uses.  To
 * produce a visible (though non-blended) result, this loader remaps every
 * autotile GID to the *representative source tile* in the tileset image —
 * specifically the top-left tile of the 2×3 source block for that autotile
 * type.  All 48 variations of the same type render the same source tile.
 *
 * Full autotile blending would require a custom render pipeline and is not
 * implemented here.
 *
 * @param gid     Original RPG Maker tile ID.
 * @param base    Slot base (`SLOT_BASE.A1` etc.)
 * @param cols    Image column count (`SLOT_COLUMNS.A1` etc.)
 * @returns Remapped tile ID within the same firstgid-relative space.
 */
function remapAutotileGid(gid: number, base: number, cols: number): number {
  const local       = gid - base;
  const autotileType = (local / 48) | 0;                   // 0-based autotile type index
  const blockRow    = (autotileType / (cols / 2)) | 0;      // row of 2×3 source block
  const blockCol    =  autotileType % (cols / 2);           // col of 2×3 source block
  // Top-left tile of the source block
  const srcRow = blockRow * 3;
  const srcCol = blockCol * 2;
  return base + srcRow * cols + srcCol;
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------

/** RPG Maker passability bit mask (all 4 directions). */
const PASSABLE_MASK = 0x0F;

/**
 * Build a `tileShapes` map from an RPG Maker flags array.
 *
 * Only tiles explicitly present in the provided `gidSet` are inspected.
 * A tile whose `flags & 0x0F === 0` (impassable from all sides) is mapped
 * to `'solid'`.  Partially-passable tiles are also mapped to `'solid'` as a
 * conservative fallback.
 *
 * @param flags  RPG Maker tileset `flags` array (8192 entries).
 * @param gidSet Set of all GIDs that actually appear in the layer data.
 */
function buildTileShapes(
  flags: number[],
  gidSet: Set<number>,
): Record<number, TileCollisionShape | string> {
  const shapes: Record<number, TileCollisionShape | string> = {};
  for (const gid of gidSet) {
    if (gid === 0) continue;
    const flag = flags[gid] ?? PASSABLE_MASK;
    if ((flag & PASSABLE_MASK) !== PASSABLE_MASK) {
      // Any direction is blocked → treat as solid
      shapes[gid] = 'solid';
    }
  }
  return shapes;
}

// ---------------------------------------------------------------------------
// Loader options
// ---------------------------------------------------------------------------

/**
 * Options for {@link loadRpgMakerMap}.
 */
export interface RpgMakerLoaderOptions {
  /**
   * Maps each RPG Maker tileset image name (from `tilesetNames`, without
   * extension) to the asset key that was pre-loaded via `assets/load`.
   *
   * @example
   * ```ts
   * textureKeyMap: {
   *   TileA1: 'rpg/TileA1',
   *   TileA2: 'rpg/TileA2',
   *   TileB:  'rpg/TileB',
   *   // …
   * }
   * ```
   */
  textureKeyMap: Record<string, string>;

  /**
   * Number of tiles per chunk edge for the resulting `TilemapData`.
   * Defaults to `16`.
   */
  chunkSize?: number;

  /**
   * Layer names for the four map layers (z = 0–3).
   * Defaults to `['lower', 'lower2', 'upper', 'upper2']`.
   */
  layerNames?: [string, string, string, string];

  /**
   * Which of the four map layers (0–3) should be registered as physics
   * colliders.  The `flags` array from the tileset is used to derive
   * per-tile collision shapes automatically.
   *
   * Defaults to `[0, 1]` (both lower layers).
   */
  colliderLayers?: number[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Result returned by {@link loadRpgMakerMap}.
 */
export interface RpgMakerLoaderOutput {
  /** The converted map data, ready to pass to `tilemap/load`. */
  tilemapData: TilemapData;
}

// ---------------------------------------------------------------------------
// resolveRpgMakerTileset
// ---------------------------------------------------------------------------

/**
 * Find the tileset entry that matches `tilesetId` in the `Tilesets.json`
 * array.
 *
 * In RPG Maker MV/MZ, `Tilesets.json` is a top-level array where index 0 is
 * always `null` and entries are keyed by their `id` field.  This helper
 * performs the lookup safely.
 *
 * @param tilesets  Parsed `Tilesets.json` array (include the leading `null`).
 * @param tilesetId The `tilesetId` value from the map JSON.
 * @returns The matching {@link RpgMakerTileset} entry.
 * @throws  If no entry with the given `id` is found.
 *
 * @example
 * ```ts
 * const tilesetsJson = await fetch('/data/Tilesets.json').then(r => r.json());
 * const mapJson      = await fetch('/data/Map001.json').then(r => r.json());
 *
 * const tileset = resolveRpgMakerTileset(tilesetsJson, mapJson.tilesetId);
 * const { tilemapData } = loadRpgMakerMap(mapJson, tileset, { textureKeyMap });
 * ```
 */
export function resolveRpgMakerTileset(
  tilesets: Array<RpgMakerTileset | null>,
  tilesetId: number,
): RpgMakerTileset {
  const entry = tilesets.find((t) => t !== null && t.id === tilesetId);
  if (!entry) {
    throw new Error(
      `[RpgMakerLoader] No tileset with id "${tilesetId}" found in Tilesets.json.`,
    );
  }
  return entry;
}

// ---------------------------------------------------------------------------
// loadRpgMakerMap
// ---------------------------------------------------------------------------

/**
 * Convert an RPG Maker MV/MZ map file and its resolved tileset into a
 * {@link TilemapData} object suitable for `tilemap/load`.
 *
 * ### Workflow
 * ```
 * MapXXX.json                Tilesets.json
 *   │  tilesetId ──────────► array lookup
 *   │                          │  tilesetNames[0..8]
 *   ▼                          ▼
 * loadRpgMakerMap(map, tileset, opts)  ──►  TilemapData
 * ```
 *
 * ### Usage
 * ```ts
 * import { resolveRpgMakerTileset, loadRpgMakerMap } from '@inkshot/engine';
 *
 * // 1. Fetch the JSON files (already parsed)
 * const mapJson      = await fetch('/data/Map001.json').then(r => r.json());
 * const tilesetsJson = await fetch('/data/Tilesets.json').then(r => r.json());
 *
 * // 2. Pre-load all referenced images via ResourceManager
 * await core.events.emit('assets/load', {
 *   assets: [
 *     { key: 'rpg/TileA1', src: '/img/tilesets/TileA1.png' },
 *     { key: 'rpg/TileB',  src: '/img/tilesets/TileB.png'  },
 *     // …
 *   ],
 * });
 *
 * // 3. Resolve the tileset and convert the map
 * const tileset = resolveRpgMakerTileset(tilesetsJson, mapJson.tilesetId);
 * const { tilemapData } = loadRpgMakerMap(mapJson, tileset, {
 *   textureKeyMap: {
 *     TileA1: 'rpg/TileA1',
 *     TileA2: 'rpg/TileA2',
 *     TileA3: 'rpg/TileA3',
 *     TileA4: 'rpg/TileA4',
 *     TileA5: 'rpg/TileA5',
 *     TileB:  'rpg/TileB',
 *     TileC:  'rpg/TileC',
 *     TileD:  'rpg/TileD',
 *     TileE:  'rpg/TileE',
 *   },
 * });
 *
 * // 4. Load into the engine
 * await core.events.emit('tilemap/load', { mapData: tilemapData });
 * ```
 *
 * ### Autotile limitation
 * RPG Maker's A1–A4 autotile slots use quarter-tile compositing that the
 * engine's `TilemapManager` does not natively support.  Each autotile GID is
 * remapped to the representative *source tile* in the tileset image (the
 * top-left tile of the autotile type's 2×3 source block).  All 48 neighbour
 * variations of the same autotile type render identically as a result.
 * For proper autotile blending, implement a custom render pass.
 *
 * @param map      Parsed `MapXXX.json`.
 * @param tileset  Resolved tileset entry from `Tilesets.json`
 *                 (use {@link resolveRpgMakerTileset}).
 * @param opts     Conversion options.
 */
export function loadRpgMakerMap(
  map: RpgMakerMap,
  tileset: RpgMakerTileset,
  opts: RpgMakerLoaderOptions,
): RpgMakerLoaderOutput {
  const { width, height } = map;
  const cellCount = width * height;

  const layerNames = opts.layerNames ?? ['lower', 'lower2', 'upper', 'upper2'];
  const colliderLayers = opts.colliderLayers ?? [0, 1];

  // ── 1. Build the four rendering layers from map.data ──────────────────────
  // map.data layout: data[z * cellCount + y * width + x]
  // We extract z = 0..3 and remap autotile GIDs in each.

  const rawLayers: number[][] = [
    map.data.slice(0, cellCount),
    map.data.slice(cellCount, cellCount * 2),
    map.data.slice(cellCount * 2, cellCount * 3),
    map.data.slice(cellCount * 3, cellCount * 4),
  ];

  // Remap autotile GIDs (A1–A4) to representative source tiles.
  // Collect all GIDs that appear after remapping for collision shape building.
  const allGids = new Set<number>();

  const remappedLayers = rawLayers.map((raw) => {
    return raw.map((gid) => {
      if (gid === 0) return 0;

      let remapped: number;

      if (gid >= SLOT_BASE.A1 && gid < SLOT_BASE.A1 + SLOT_RANGE.A1) {
        remapped = remapAutotileGid(gid, SLOT_BASE.A1, SLOT_COLUMNS.A1);
      } else if (gid >= SLOT_BASE.A2 && gid < SLOT_BASE.A2 + SLOT_RANGE.A2) {
        remapped = remapAutotileGid(gid, SLOT_BASE.A2, SLOT_COLUMNS.A2);
      } else if (gid >= SLOT_BASE.A3 && gid < SLOT_BASE.A3 + SLOT_RANGE.A3) {
        remapped = remapAutotileGid(gid, SLOT_BASE.A3, SLOT_COLUMNS.A3);
      } else if (gid >= SLOT_BASE.A4 && gid < SLOT_BASE.A4 + SLOT_RANGE.A4) {
        remapped = remapAutotileGid(gid, SLOT_BASE.A4, SLOT_COLUMNS.A4);
      } else {
        remapped = gid;
      }

      allGids.add(remapped);
      return remapped;
    });
  });

  // ── 2. Build TilesetDef entries for each non-empty slot ───────────────────
  //
  // tilesetNames indices:
  //   0 = TileA1, 1 = TileA2, 2 = TileA3, 3 = TileA4, 4 = TileA5,
  //   5 = TileB,  6 = TileC,  7 = TileD,  8 = TileE
  //
  // Slot order in tilesetNames vs. GID space:
  //   B(5)=0, C(6)=256, D(7)=512, E(8)=768, A5(4)=1536,
  //   A1(0)=2048, A2(1)=2816, A3(2)=4352, A4(3)=5888

  type SlotKey = keyof typeof SLOT_BASE;
  const SLOT_ORDER: ReadonlyArray<{ key: SlotKey; nameIdx: number }> = [
    { key: 'B',  nameIdx: 5 },
    { key: 'C',  nameIdx: 6 },
    { key: 'D',  nameIdx: 7 },
    { key: 'E',  nameIdx: 8 },
    { key: 'A5', nameIdx: 4 },
    { key: 'A1', nameIdx: 0 },
    { key: 'A2', nameIdx: 1 },
    { key: 'A3', nameIdx: 2 },
    { key: 'A4', nameIdx: 3 },
  ] as const;

  const tilesets: TilesetDef[] = [];

  for (const { key, nameIdx } of SLOT_ORDER) {
    const imageName = tileset.tilesetNames[nameIdx];
    if (!imageName) continue; // unused slot

    const textureKey = opts.textureKeyMap[imageName];
    if (!textureKey) continue; // not provided — skip silently

    tilesets.push({
      firstgid:  SLOT_BASE[key],
      name:      imageName,
      textureKey,
      tileWidth:  TILE_SIZE,
      tileHeight: TILE_SIZE,
      columns:   SLOT_COLUMNS[key],
    });
  }

  if (tilesets.length === 0) {
    throw new Error(
      '[RpgMakerLoader] No tilesets could be resolved. ' +
      'Ensure textureKeyMap contains entries for the tileset image names ' +
      `(e.g. "${tileset.tilesetNames.filter(Boolean).join('", "')}" ).`,
    );
  }

  // Sort tilesets by firstgid ascending (required by TilemapManager).
  tilesets.sort((a, b) => a.firstgid - b.firstgid);

  // ── 3. Build collision tileShapes from RPG Maker flags ─────────────────────
  const tileShapes = buildTileShapes(tileset.flags, allGids);

  // ── 4. Assemble TilemapLayerDef entries ────────────────────────────────────
  const layers: TilemapLayerDef[] = remappedLayers.map((data, z) => {
    const isCollider = colliderLayers.includes(z);
    return {
      name: layerNames[z] ?? `layer${z}`,
      data,
      ...(isCollider ? { collider: true, tileShapes } : {}),
    };
  });

  // ── 5. Assemble TilemapData ────────────────────────────────────────────────
  const tilemapData: TilemapData = {
    tileWidth:  TILE_SIZE,
    tileHeight: TILE_SIZE,
    mapWidth:   width,
    mapHeight:  height,
    tilesets,
    layers,
    ...(opts.chunkSize !== undefined ? { chunkSize: opts.chunkSize } : {}),
  };

  return { tilemapData };
}
