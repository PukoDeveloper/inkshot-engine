import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type { RendererPreRenderParams } from '../types/rendering.js';
import type {
  MinimapConfig,
  MinimapConfigOutput,
  MinimapIcon,
  MinimapIconAddOutput,
  MinimapIconAddParams,
  MinimapIconRemoveParams,
  MinimapIconUpdateParams,
  MinimapIconsOutput,
  MinimapInitParams,
} from '../types/minimap.js';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _nextIconId = 0;
function generateIconId(): string {
  return `icon_${++_nextIconId}`;
}

// ---------------------------------------------------------------------------
// MinimapPlugin
// ---------------------------------------------------------------------------

/**
 * Plugin that renders a low-resolution **minimap** in a corner of the screen.
 *
 * The minimap shows the explored world as a rectangle scaled to the
 * configured `width × height` area, with icon markers for game objects
 * (player, enemies, events, etc.).
 *
 * ### Quick start
 * ```ts
 * import { createEngine, MinimapPlugin } from 'inkshot-engine';
 *
 * const minimap = new MinimapPlugin();
 * const { core } = await createEngine({ plugins: [minimap] });
 *
 * // Initialise after the tilemap is loaded so worldWidth/Height are known.
 * core.events.emitSync('minimap/init', {
 *   config: { x: 10, y: 10, width: 200, height: 150, worldWidth: 3200, worldHeight: 2400 },
 * });
 *
 * // Add the player icon.
 * core.events.emitSync('minimap/icon:add', {
 *   id: 'player', x: player.position.x, y: player.position.y, color: 0x00ff88, radius: 4,
 * });
 *
 * // Update the icon position every tick.
 * core.events.on('game', 'core/update', () => {
 *   core.events.emitSync('minimap/icon:update', {
 *     id: 'player', x: player.position.x, y: player.position.y,
 *   });
 * });
 * ```
 *
 * ### EventBus API
 *
 * | Event                  | Params / Output                                         |
 * |------------------------|---------------------------------------------------------|
 * | `minimap/init`         | `MinimapInitParams`                                     |
 * | `minimap/icon:add`     | `MinimapIconAddParams → MinimapIconAddOutput`           |
 * | `minimap/icon:remove`  | `MinimapIconRemoveParams`                               |
 * | `minimap/icon:update`  | `MinimapIconUpdateParams`                               |
 * | `minimap/icons`        | `{} → MinimapIconsOutput`                               |
 * | `minimap/config`       | `{} → MinimapConfigOutput`                              |
 */
export class MinimapPlugin implements EnginePlugin {
  readonly namespace = 'minimap';

  private _config: MinimapConfig | null = null;
  private readonly _icons: Map<string, MinimapIcon> = new Map();

  private _gfx: Graphics | null = null;
  private _container: Container | null = null;

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // ── EventBus API ─────────────────────────────────────────────────────
    core.events.on('minimap', 'minimap/init', (p: MinimapInitParams) => {
      this._config = { ...p.config };
      this._setupLayer(core);
    });

    core.events.on(
      'minimap',
      'minimap/icon:add',
      (p: MinimapIconAddParams, output: MinimapIconAddOutput) => {
        const id = p.id ?? generateIconId();
        this._icons.set(id, {
          id,
          x: p.x,
          y: p.y,
          color: p.color ?? 0xffffff,
          radius: p.radius ?? 3,
          label: p.label,
        });
        output.id = id;
      },
    );

    core.events.on('minimap', 'minimap/icon:remove', (p: MinimapIconRemoveParams) => {
      this._icons.delete(p.id);
    });

    core.events.on('minimap', 'minimap/icon:update', (p: MinimapIconUpdateParams) => {
      const icon = this._icons.get(p.id);
      if (!icon) return;
      if (p.x !== undefined) icon.x = p.x;
      if (p.y !== undefined) icon.y = p.y;
      if (p.color !== undefined) icon.color = p.color;
      if (p.radius !== undefined) icon.radius = p.radius;
      if (p.label !== undefined) icon.label = p.label;
    });

    core.events.on(
      'minimap',
      'minimap/icons',
      (_p: Record<string, never>, output: MinimapIconsOutput) => {
        output.icons = Array.from(this._icons.values()).map((i) => ({ ...i }));
      },
    );

    core.events.on(
      'minimap',
      'minimap/config',
      (_p: Record<string, never>, output: MinimapConfigOutput) => {
        output.config = this._config ? { ...this._config } : null;
      },
    );

    // ── Redraw every render frame ─────────────────────────────────────────
    core.events.on('minimap', 'renderer/pre-render', (_p: RendererPreRenderParams) => {
      this._draw();
    });
  }

  destroy(core: Core): void {
    if (this._gfx) {
      this._gfx.destroy();
      this._gfx = null;
    }
    this._icons.clear();
    this._config = null;
    core.events.removeNamespace('minimap');
  }

  // ---------------------------------------------------------------------------
  // Direct accessors (pull API)
  // ---------------------------------------------------------------------------

  getIcons(): MinimapIcon[] {
    return Array.from(this._icons.values()).map((i) => ({ ...i }));
  }

  getConfig(): MinimapConfig | null {
    return this._config ? { ...this._config } : null;
  }

  // ---------------------------------------------------------------------------
  // Private — setup
  // ---------------------------------------------------------------------------

  private _setupLayer(core: Core): void {
    if (this._gfx) {
      this._gfx.destroy();
      this._gfx = null;
    }

    const { output: layerResult } = core.events.emitSync<{ name: string }, { layer: Container }>(
      'renderer/layer',
      { name: 'ui' },
    );
    this._container = layerResult.layer ?? null;

    if (this._container) {
      this._gfx = new Graphics();
      this._container.addChild(this._gfx as unknown as Parameters<typeof this._container.addChild>[0]);
    }
  }

  // ---------------------------------------------------------------------------
  // Private — rendering
  // ---------------------------------------------------------------------------

  private _draw(): void {
    if (!this._gfx || !this._config) return;

    const cfg = this._config;
    const gfx = this._gfx;
    gfx.clear();

    // Background panel.
    gfx
      .rect(cfg.x, cfg.y, cfg.width, cfg.height)
      .fill({ color: cfg.backgroundColor ?? 0x111111, alpha: cfg.backgroundAlpha ?? 0.75 });

    // Border.
    if (cfg.borderColor !== undefined) {
      gfx
        .rect(cfg.x, cfg.y, cfg.width, cfg.height)
        .stroke({ color: cfg.borderColor, width: 1 });
    }

    // Scale world → minimap.
    const scaleX = cfg.width / cfg.worldWidth;
    const scaleY = cfg.height / cfg.worldHeight;

    // Icons.
    for (const icon of this._icons.values()) {
      const mx = cfg.x + icon.x * scaleX;
      const my = cfg.y + icon.y * scaleY;
      gfx.circle(mx, my, icon.radius ?? 3).fill({ color: icon.color ?? 0xffffff });
    }
  }
}
