// ---------------------------------------------------------------------------
// Tile visibility states
// ---------------------------------------------------------------------------

/** Visibility state of a single tile cell. */
export type FogTileState = 'unexplored' | 'explored' | 'visible';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration passed to `fog/init`. */
export interface FogConfig {
  /** Number of tile columns. Should match TilemapData.mapWidth. */
  mapWidth: number;
  /** Number of tile rows. Should match TilemapData.mapHeight. */
  mapHeight: number;
  /** Tile size in pixels. */
  tileWidth: number;
  /** Tile size in pixels. */
  tileHeight: number;
  /**
   * Colour of the unexplored fog (solid dark).
   * Default `0x000000`.
   */
  unexploredColor?: number;
  /**
   * Alpha of the unexplored fog overlay.  `1` = fully opaque.
   * Default `1.0`.
   */
  unexploredAlpha?: number;
  /**
   * Colour of the explored-but-not-visible fog (seen before, now dark).
   * Default `0x000000`.
   */
  exploredColor?: number;
  /**
   * Alpha of the explored fog overlay.  Lower values let the map show through.
   * Default `0.5`.
   */
  exploredAlpha?: number;
  /**
   * Whether to persist explored/visibility state across save/load via
   * `VariableStoreManager` (`store/set`).  Default `false`.
   */
  persist?: boolean;
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/** Params for `fog/init`. */
export interface FogInitParams {
  config: FogConfig;
}

/** Params for `fog/update`. Updates visibility around a world-space position. */
export interface FogUpdateParams {
  /** World-space X of the observer. */
  x: number;
  /** World-space Y of the observer. */
  y: number;
  /** Visibility radius in **tiles**. */
  radius: number;
}

/** Params for `fog/reveal`. Force-reveal (or re-hide) a rectangular tile region. */
export interface FogRevealParams {
  /** Starting column (inclusive). */
  col: number;
  /** Starting row (inclusive). */
  row: number;
  /** Width in tiles. */
  width: number;
  /** Height in tiles. */
  height: number;
  /** Target state to set for each cell in the region. Default `'explored'`. */
  state?: FogTileState;
}

/** Params for `fog/get-tile`. */
export interface FogGetTileParams {
  col: number;
  row: number;
}

/** Output for `fog/get-tile`. */
export interface FogGetTileOutput {
  state: FogTileState;
}

/** Output for `fog/state`. */
export interface FogStateOutput {
  config: FogConfig | null;
  /** Total number of tiles. */
  total: number;
  explored: number;
  visible: number;
}

/**
 * Notification emitted as `fog/tile:revealed` when a tile transitions from
 * `unexplored` to `explored` or `visible` for the **first** time.
 */
export interface FogTileRevealedParams {
  col: number;
  row: number;
}
