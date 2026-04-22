import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { RendererPreRenderParams } from '../../types/rendering.js';
import type {
  FogConfig,
  FogGetTileOutput,
  FogGetTileParams,
  FogInitParams,
  FogRevealParams,
  FogStateOutput,
  FogTileRevealedParams,
  FogTileState,
  FogUpdateParams,
} from '../../types/fog.js';

// ---------------------------------------------------------------------------
// Internal tile state encoding
// ---------------------------------------------------------------------------

const FOG_UNEXPLORED = 0;
const FOG_EXPLORED = 1;
const FOG_VISIBLE = 2;

// ---------------------------------------------------------------------------
// FogOfWarPlugin
// ---------------------------------------------------------------------------

/**
 * Plugin that provides a **fog-of-war** system based on a per-tile visibility grid.
 *
 * Each tile starts as `'unexplored'`.  When `fog/update` is called with an
 * observer position and radius, tiles within the radius become `'visible'`.
 * On the next `fog/update` call, previously visible tiles revert to
 * `'explored'` (dimly shown) unless they are still in range.
 *
 * The plugin renders the fog as a Pixi `Graphics` overlay on the `'world'`
 * layer:
 *  - Unexplored tiles → fully opaque dark squares.
 *  - Explored tiles   → semi-transparent dark squares.
 *  - Visible tiles    → no overlay (fully transparent).
 *
 * ### Quick start
 * ```ts
 * import { createEngine, FogOfWarPlugin } from 'inkshot-engine';
 *
 * const fog = new FogOfWarPlugin();
 * const { core } = await createEngine({ plugins: [fog] });
 *
 * core.events.emitSync('fog/init', {
 *   config: { mapWidth: 50, mapHeight: 40, tileWidth: 16, tileHeight: 16 },
 * });
 *
 * // Called every tick with the player's world position.
 * core.events.emitSync('fog/update', { x: player.x, y: player.y, radius: 6 });
 * ```
 *
 * ### EventBus API
 *
 * | Event              | Params / Output                                       |
 * |--------------------|-------------------------------------------------------|
 * | `fog/init`         | `FogInitParams`                                       |
 * | `fog/update`       | `FogUpdateParams`                                     |
 * | `fog/reveal`       | `FogRevealParams`                                     |
 * | `fog/get-tile`     | `FogGetTileParams → FogGetTileOutput`                 |
 * | `fog/clear`        | `{}`                                                  |
 * | `fog/state`        | `{} → FogStateOutput`                                 |
 * | `fog/tile:revealed`| `FogTileRevealedParams` (notification)                |
 */
export class FogOfWarPlugin implements EnginePlugin {
  readonly namespace = 'fog';
  readonly editorMeta = {
    displayName: 'Fog of War Plugin',
    icon: 'fog',
    description: 'Renders a fog-of-war overlay with explored and visible tile states.',
    commands: [
      'fog/init', 'fog/update', 'fog/reveal', 'fog/clear',
      'fog/get-tile', 'fog/state',
    ] as const,
  };

  private _config: FogConfig | null = null;
  /** Flat row-major array: 0=unexplored, 1=explored, 2=visible. */
  private _grid: Uint8Array | null = null;

  private _gfx: Graphics | null = null;
  private _layer: Container | null = null;

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // ── EventBus API ─────────────────────────────────────────────────────
    core.events.on('fog', 'fog/init', (p: FogInitParams) => {
      this._initGrid(p.config, core);
    });

    core.events.on('fog', 'fog/update', (p: FogUpdateParams) => {
      if (!this._config || !this._grid) return;
      this._updateVisibility(p.x, p.y, p.radius, core);
    });

    core.events.on('fog', 'fog/reveal', (p: FogRevealParams) => {
      if (!this._config || !this._grid) return;
      const targetState = p.state ?? 'explored';
      const stateCode = _stateToCode(targetState);
      const { mapWidth, mapHeight } = this._config;
      const maxRow = Math.min(p.row + p.height, mapHeight);
      const maxCol = Math.min(p.col + p.width, mapWidth);
      for (let r = Math.max(0, p.row); r < maxRow; r++) {
        for (let c = Math.max(0, p.col); c < maxCol; c++) {
          const idx = r * mapWidth + c;
          const prev = this._grid![idx]!;
          if (stateCode > prev) {
            if (prev === FOG_UNEXPLORED) {
              core.events.emitSync('fog/tile:revealed', { col: c, row: r } as FogTileRevealedParams);
            }
            this._grid![idx] = stateCode;
          }
        }
      }
    });

    core.events.on(
      'fog',
      'fog/get-tile',
      (p: FogGetTileParams, output: FogGetTileOutput) => {
        output.state = this._getTileState(p.col, p.row);
      },
    );

    core.events.on('fog', 'fog/clear', () => {
      if (this._grid) this._grid.fill(FOG_UNEXPLORED);
    });

    core.events.on('fog', 'fog/state', (_p: Record<string, never>, output: FogStateOutput) => {
      output.config = this._config ? { ...this._config } : null;
      if (this._grid) {
        let explored = 0;
        let visible = 0;
        for (const v of this._grid) {
          if (v === FOG_EXPLORED) explored++;
          else if (v === FOG_VISIBLE) visible++;
        }
        output.total = this._grid.length;
        output.explored = explored;
        output.visible = visible;
      } else {
        output.total = 0;
        output.explored = 0;
        output.visible = 0;
      }
    });

    // ── Redraw fog every render frame ────────────────────────────────────
    core.events.on('fog', 'renderer/pre-render', (_p: RendererPreRenderParams) => {
      this._draw();
    });
  }

  destroy(core: Core): void {
    if (this._gfx) {
      this._gfx.destroy();
      this._gfx = null;
    }
    this._grid = null;
    this._config = null;
    core.events.removeNamespace('fog');
  }

  // ---------------------------------------------------------------------------
  // Direct accessors (pull API)
  // ---------------------------------------------------------------------------

  getTileState(col: number, row: number): FogTileState {
    return this._getTileState(col, row);
  }

  // ---------------------------------------------------------------------------
  // Private — grid initialisation
  // ---------------------------------------------------------------------------

  private _initGrid(config: FogConfig, core: Core): void {
    this._config = { ...config };
    this._grid = new Uint8Array(config.mapWidth * config.mapHeight).fill(FOG_UNEXPLORED);

    // Tear down and recreate the graphics layer.
    if (this._gfx) {
      this._gfx.destroy();
      this._gfx = null;
    }

    const { output: layerResult } = core.events.emitSync<{ name: string; zIndex: number }, { layer: Container }>(
      'renderer/layer:create',
      { name: 'fog', zIndex: 75 },
    );
    this._layer = layerResult.layer ?? null;

    if (this._layer) {
      this._gfx = new Graphics();
      this._layer.addChild(this._gfx as unknown as Parameters<typeof this._layer.addChild>[0]);
    }
  }

  // ---------------------------------------------------------------------------
  // Private — visibility update
  // ---------------------------------------------------------------------------

  private _updateVisibility(worldX: number, worldY: number, radiusTiles: number, core: Core): void {
    const cfg = this._config!;
    const grid = this._grid!;

    // Revert previously visible tiles to explored.
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === FOG_VISIBLE) grid[i] = FOG_EXPLORED;
    }

    // Compute the observer's tile position.
    const centerCol = Math.floor(worldX / cfg.tileWidth);
    const centerRow = Math.floor(worldY / cfg.tileHeight);
    const r = Math.ceil(radiusTiles);

    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        // Circular mask.
        if (dc * dc + dr * dr > radiusTiles * radiusTiles) continue;

        const col = centerCol + dc;
        const row = centerRow + dr;

        if (col < 0 || col >= cfg.mapWidth || row < 0 || row >= cfg.mapHeight) continue;

        const idx = row * cfg.mapWidth + col;
        const prev = grid[idx]!;

        if (prev === FOG_UNEXPLORED) {
          core.events.emitSync('fog/tile:revealed', { col, row } as FogTileRevealedParams);
        }
        grid[idx] = FOG_VISIBLE;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — rendering
  // ---------------------------------------------------------------------------

  private _draw(): void {
    if (!this._gfx || !this._config || !this._grid) return;

    const cfg = this._config;
    const gfx = this._gfx;
    const unexploredAlpha = cfg.unexploredAlpha ?? 1.0;
    const exploredAlpha = cfg.exploredAlpha ?? 0.5;
    const unexploredColor = cfg.unexploredColor ?? 0x000000;
    const exploredColor = cfg.exploredColor ?? 0x000000;

    gfx.clear();

    for (let row = 0; row < cfg.mapHeight; row++) {
      for (let col = 0; col < cfg.mapWidth; col++) {
        const state = this._grid[row * cfg.mapWidth + col]!;

        if (state === FOG_VISIBLE) continue; // no overlay for visible tiles

        const x = col * cfg.tileWidth;
        const y = row * cfg.tileHeight;

        if (state === FOG_UNEXPLORED) {
          gfx.rect(x, y, cfg.tileWidth, cfg.tileHeight)
            .fill({ color: unexploredColor, alpha: unexploredAlpha });
        } else {
          // FOG_EXPLORED
          gfx.rect(x, y, cfg.tileWidth, cfg.tileHeight)
            .fill({ color: exploredColor, alpha: exploredAlpha });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — helpers
  // ---------------------------------------------------------------------------

  private _getTileState(col: number, row: number): FogTileState {
    if (!this._config || !this._grid) return 'unexplored';
    const { mapWidth, mapHeight } = this._config;
    if (col < 0 || col >= mapWidth || row < 0 || row >= mapHeight) return 'unexplored';
    return _codeToState(this._grid[row * mapWidth + col]!);
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function _stateToCode(state: FogTileState): number {
  if (state === 'explored') return FOG_EXPLORED;
  if (state === 'visible') return FOG_VISIBLE;
  return FOG_UNEXPLORED;
}

function _codeToState(code: number): FogTileState {
  if (code === FOG_EXPLORED) return 'explored';
  if (code === FOG_VISIBLE) return 'visible';
  return 'unexplored';
}
