// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/**
 * Configuration for the minimap display.
 */
export interface MinimapConfig {
  /** X position of the minimap on screen (pixels from left). Default `10`. */
  x: number;
  /** Y position of the minimap on screen (pixels from top). Default `10`. */
  y: number;
  /** Width of the minimap panel in pixels. Default `200`. */
  width: number;
  /** Height of the minimap panel in pixels. Default `150`. */
  height: number;
  /** World width covered by the minimap. Should match TilemapData. */
  worldWidth: number;
  /** World height covered by the minimap. */
  worldHeight: number;
  /** Background fill colour (hex). Default `0x111111`. */
  backgroundColor?: number;
  /** Background fill alpha. Default `0.75`. */
  backgroundAlpha?: number;
  /** Optional border colour. Default `0x888888`. */
  borderColor?: number;
}

/**
 * An icon marker displayed on the minimap.
 */
export interface MinimapIcon {
  /** Unique identifier. */
  id: string;
  /** World-space X position (updated at runtime). */
  x: number;
  /** World-space Y position. */
  y: number;
  /** Hex colour used to draw the icon dot. Default `0xffffff`. */
  color?: number;
  /** Dot radius in minimap pixels. Default `3`. */
  radius?: number;
  /** Optional label (not displayed by default, stored for consumers). */
  label?: string;
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/** Params for `minimap/init`. */
export interface MinimapInitParams {
  config: MinimapConfig;
}

/** Params for `minimap/icon:add`. */
export type MinimapIconAddParams = Omit<MinimapIcon, 'id'> & { id?: string };

/** Output for `minimap/icon:add`. */
export interface MinimapIconAddOutput {
  id: string;
}

/** Params for `minimap/icon:remove`. */
export interface MinimapIconRemoveParams {
  id: string;
}

/** Params for `minimap/icon:update`. */
export type MinimapIconUpdateParams = { id: string } & Partial<Omit<MinimapIcon, 'id'>>;

/** Output for `minimap/icons`. */
export interface MinimapIconsOutput {
  icons: MinimapIcon[];
}

/** Output for `minimap/config`. */
export interface MinimapConfigOutput {
  config: MinimapConfig | null;
}
