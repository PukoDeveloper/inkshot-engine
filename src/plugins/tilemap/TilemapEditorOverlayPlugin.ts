import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { RendererPreRenderParams, CameraStateOutput } from '../../types/rendering.js';
import type { TilemapData, TilemapLoadedParams } from '../../types/tilemap.js';
import type { InputPointerMoveParams } from '../../types/input.js';

// ---------------------------------------------------------------------------
// Visual constants — adjust these to change the overlay appearance.
// ---------------------------------------------------------------------------

/** Colour of the grid lines (white). */
const GRID_COLOR = 0xffffff;

/** Opacity of the grid lines (0–1). */
const GRID_ALPHA = 0.2;

/** Stroke width of the grid lines in world-space pixels. */
const GRID_WIDTH = 1;

/** Colour of the hovered-cell highlight fill. */
const HOVER_COLOR = 0xffffff;

/** Fill opacity of the hovered-cell highlight (0–1). */
const HOVER_ALPHA = 0.25;

// ---------------------------------------------------------------------------
// TilemapEditorOverlayPlugin
// ---------------------------------------------------------------------------

/**
 * Companion visual plugin for {@link TilemapEditorPlugin}.
 *
 * Renders two things directly on top of the tilemap in **world-space** so the
 * overlay moves with the camera automatically:
 *
 * 1. **Grid lines** — a full-map grid visible whenever the editor is open.
 * 2. **Hover highlight** — a semi-transparent rectangle that follows the
 *    pointer and marks the tile cell currently under the cursor.
 *
 * The overlay requires no additional wiring — it subscribes to existing
 * `tilemap/*`, `mapeditor/*`, `input/*`, and `renderer/*` events.
 *
 * ### Usage
 * Register this plugin alongside {@link TilemapManager}, {@link InputManager},
 * and {@link TilemapEditorPlugin}:
 *
 * ```ts
 * const { core } = await createEngine({
 *   plugins: [
 *     new TilemapManager(),
 *     new InputManager(),
 *     new TilemapEditorPlugin(),
 *     new TilemapEditorOverlayPlugin(),
 *   ],
 * });
 *
 * // Open the editor — the grid and hover highlight appear immediately.
 * core.events.emitSync('mapeditor/open', {});
 * ```
 *
 * ### Appearance customisation
 * The visual constants (`GRID_COLOR`, `GRID_ALPHA`, etc.) at the top of the
 * source file can be adjusted to suit your project's art style.
 */
export class TilemapEditorOverlayPlugin implements EnginePlugin {
  readonly namespace = 'mapeditor-overlay';
  readonly dependencies = ['tilemap', 'input', 'mapeditor'] as const;

  private _core: Core | null = null;
  private _gfx: Graphics | null = null;
  private _worldLayer: Container | null = null;
  private _mapData: TilemapData | null = null;
  private _editorOpen = false;
  private _hoverTile: { col: number; row: number } | null = null;

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    // Obtain the world layer — it exists as soon as Renderer is initialised.
    const { output } = core.events.emitSync<{ name: string }, { layer: Container }>(
      'renderer/layer',
      { name: 'world' },
    );
    this._worldLayer = output.layer;

    // Create the Pixi Graphics object. It is attached to / detached from the
    // world layer on map load / unload so it is always on top of all tile layers
    // (which are added to the world layer first, during tilemap/load).
    this._gfx = new Graphics();

    // ── Tilemap lifecycle ──────────────────────────────────────────────────

    core.events.on(this.namespace, 'tilemap/loaded', (p: TilemapLoadedParams) => {
      this._mapData = p.mapData;
      // Attach after all tile layer containers have been added — the Graphics
      // is therefore the last child, naturally appearing on top.
      if (this._gfx && this._worldLayer) {
        this._worldLayer.addChild(
          this._gfx as unknown as Parameters<typeof this._worldLayer.addChild>[0],
        );
      }
    });

    core.events.on(this.namespace, 'tilemap/unloaded', () => {
      this._mapData = null;
      this._hoverTile = null;
      if (this._gfx && this._worldLayer) {
        this._worldLayer.removeChild(
          this._gfx as unknown as Parameters<typeof this._worldLayer.removeChild>[0],
        );
      }
      this._gfx?.clear();
    });

    // ── Editor open / close ────────────────────────────────────────────────

    core.events.on(this.namespace, 'mapeditor/opened', () => {
      this._editorOpen = true;
    });

    core.events.on(this.namespace, 'mapeditor/closed', () => {
      this._editorOpen = false;
      this._hoverTile = null;
    });

    // ── Pointer tracking ───────────────────────────────────────────────────

    core.events.on(this.namespace, 'input/pointer:move', (p: InputPointerMoveParams) => {
      if (!this._editorOpen || !this._mapData) {
        this._hoverTile = null;
        return;
      }
      this._hoverTile = this._canvasToTile(p.x, p.y);
    });

    // ── Redraw every render frame ──────────────────────────────────────────

    core.events.on(this.namespace, 'renderer/pre-render', (_p: RendererPreRenderParams) => {
      this._draw();
    });
  }

  destroy(core: Core): void {
    if (this._gfx) {
      this._gfx.destroy();
      this._gfx = null;
    }
    this._mapData = null;
    this._worldLayer = null;
    this._core = null;
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Private — draw
  // ---------------------------------------------------------------------------

  private _draw(): void {
    if (!this._gfx) return;
    this._gfx.clear();

    if (!this._editorOpen || !this._mapData) return;

    const { tileWidth, tileHeight, mapWidth, mapHeight } = this._mapData;
    const totalW = mapWidth * tileWidth;
    const totalH = mapHeight * tileHeight;

    // ── Grid lines ────────────────────────────────────────────────────────
    // Accumulate all vertical then horizontal line segments as a single path
    // and stroke them in one call to minimise Graphics state changes.

    for (let c = 0; c <= mapWidth; c++) {
      const x = c * tileWidth;
      this._gfx.moveTo(x, 0).lineTo(x, totalH);
    }

    for (let r = 0; r <= mapHeight; r++) {
      const y = r * tileHeight;
      this._gfx.moveTo(0, y).lineTo(totalW, y);
    }

    this._gfx.stroke({ color: GRID_COLOR, alpha: GRID_ALPHA, width: GRID_WIDTH });

    // ── Hover highlight ───────────────────────────────────────────────────

    if (this._hoverTile) {
      const { col, row } = this._hoverTile;
      this._gfx
        .rect(col * tileWidth, row * tileHeight, tileWidth, tileHeight)
        .fill({ color: HOVER_COLOR, alpha: HOVER_ALPHA });
    }
  }

  // ---------------------------------------------------------------------------
  // Private — coordinate conversion
  // ---------------------------------------------------------------------------

  /**
   * Convert canvas (viewport) coordinates to tile-grid coordinates.
   *
   * When a camera is available the conversion accounts for camera position and
   * zoom.  Falls back to treating canvas coords as world coords otherwise.
   *
   * Returns `null` when the coordinates land outside the map bounds.
   */
  private _canvasToTile(canvasX: number, canvasY: number): { col: number; row: number } | null {
    if (!this._mapData) return null;

    let worldX = canvasX;
    let worldY = canvasY;

    const camResult = this._core?.events.emitSync<unknown, CameraStateOutput>(
      'camera/state',
      {},
    );

    const camOutput = camResult?.output as CameraStateOutput | undefined;
    if (
      camOutput &&
      typeof camOutput.x === 'number' &&
      typeof camOutput.zoom === 'number' &&
      camOutput.zoom > 0 &&
      typeof camOutput.viewportWidth === 'number' &&
      typeof camOutput.viewportHeight === 'number' &&
      camOutput.viewportWidth > 0 &&
      camOutput.viewportHeight > 0
    ) {
      worldX = (canvasX - camOutput.viewportWidth / 2) / camOutput.zoom + camOutput.x;
      worldY = (canvasY - camOutput.viewportHeight / 2) / camOutput.zoom + camOutput.y;
    }

    const col = Math.floor(worldX / this._mapData.tileWidth);
    const row = Math.floor(worldY / this._mapData.tileHeight);

    if (
      col < 0 ||
      col >= this._mapData.mapWidth ||
      row < 0 ||
      row >= this._mapData.mapHeight
    ) {
      return null;
    }

    return { col, row };
  }
}
