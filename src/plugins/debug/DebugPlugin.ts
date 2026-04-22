import { Container, Graphics, Text } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import { CollisionLayer } from '../../types/physics.js';
import type {
  Collider,
  ColliderShape,
  PhysicsBodyAddParams,
  PhysicsBodyRemoveParams,
} from '../../types/physics.js';
import type { Entity, EntityCreatedParams, EntityDestroyedParams } from '../../types/entity.js';
import type { CoreRenderParams } from '../../types/rendering.js';
import type { TilemapData, TilemapLoadedParams } from '../../types/tilemap.js';
import type {
  DebugEventEntry,
  DebugEventLogFilterParams,
  DebugEventLogGetOutput,
  DebugOverlayToggleParams,
  DebugOverlayVisibleOutput,
  DebugPluginOptions,
} from '../../types/debug.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Z-index for the debug screen-space layer (drawn above `system` at 300). */
const DEBUG_LAYER_Z = 400;

/** Target frame duration in milliseconds (≈ 60 fps). */
const FPS_TARGET_MS = 1000 / 60;

/** Width of the on-screen debug panel in pixels. */
const PANEL_W = 300;
/** Height of the FPS chart area in pixels. */
const CHART_H = 60;
/** Y gap between panel sections. */
const SECTION_GAP = 8;

/** Stroke colours for each collision layer bit flag. */
const LAYER_COLOUR: Readonly<Record<number, number>> = {
  [CollisionLayer.BODY]: 0x22ff66,
  [CollisionLayer.HITBOX]: 0xff3333,
  [CollisionLayer.HURTBOX]: 0x3399ff,
  [CollisionLayer.SENSOR]: 0xffee00,
};

/** Stroke width (px) for collider outlines. */
const COLLIDER_STROKE_W = 1.5;

/** Maximum tile count per axis when drawing the full tile grid.
 *  Beyond this, only chunk boundaries are drawn to keep draw calls manageable.
 */
const GRID_TILE_LIMIT = 400;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the most visually distinct colour for a layer bitmask. */
function layerColour(layer: number): number {
  if (layer & CollisionLayer.SENSOR) return LAYER_COLOUR[CollisionLayer.SENSOR]!;
  if (layer & CollisionLayer.HITBOX) return LAYER_COLOUR[CollisionLayer.HITBOX]!;
  if (layer & CollisionLayer.HURTBOX) return LAYER_COLOUR[CollisionLayer.HURTBOX]!;
  return LAYER_COLOUR[CollisionLayer.BODY]!;
}

// ---------------------------------------------------------------------------
// DebugPlugin
// ---------------------------------------------------------------------------

/**
 * Development-time debug overlay plugin.
 *
 * Provides a rich set of visualisations and diagnostic panels that can be
 * toggled on/off at runtime without restarting the engine.  Designed to have
 * zero overhead when the overlay is hidden.
 *
 * ---
 *
 * ### Features
 *
 * | Feature | Description |
 * |---------|-------------|
 * | **FPS counter** | Current frames-per-second with a real-time frame-time line chart (16 ms baseline). |
 * | **Collider viz** | Draws AABB / circle / point outlines for every `physics/body:add` collider, coloured by layer (BODY = green, HITBOX = red, HURTBOX = blue, SENSOR = yellow). |
 * | **Entity Inspector** | Shows up to 10 live entities with their ID, tags, and pixel position. |
 * | **Tilemap grid** | Draws the tile grid and chunk boundaries for the active tilemap; highlights collision tiles. |
 * | **Event log** | Records up to N recent `EventBus` events; supports case-insensitive keyword filtering. |
 * | **Hotkey toggle** | Press `` ` `` or `F12` (configurable) to show / hide the overlay instantly. |
 *
 * ---
 *
 * ### EventBus API
 *
 * | Event | Params | Output | Description |
 * |-------|--------|--------|-------------|
 * | `debug/overlay:toggle` | {@link DebugOverlayToggleParams} | {@link DebugOverlayVisibleOutput} | Show, hide, or flip overlay visibility. |
 * | `debug/overlay:visible` | `{}` | {@link DebugOverlayVisibleOutput} | Query current visibility. |
 * | `debug/event-log:filter` | {@link DebugEventLogFilterParams} | — | Set keyword filter for the event log. |
 * | `debug/event-log:get` | `{}` | {@link DebugEventLogGetOutput} | Retrieve (filtered) event log entries. |
 *
 * ---
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, DebugPlugin } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     // Only add in development:
 *     ...(import.meta.env.DEV ? [new DebugPlugin({ visible: true })] : []),
 *   ],
 * });
 *
 * // Toggle via the event bus at any time:
 * core.events.emitSync('debug/overlay:toggle', {});
 *
 * // Filter the event log:
 * core.events.emitSync('debug/event-log:filter', { filter: 'physics' });
 *
 * // Read the filtered log:
 * const { output } = core.events.emitSync('debug/event-log:get', {});
 * console.log(output.entries);
 * ```
 */
export class DebugPlugin implements EnginePlugin {
  readonly namespace = 'debug';
  readonly editorMeta = {
    displayName: 'Debug Plugin',
    icon: 'debug',
    description: 'Provides in-game debug overlay, FPS counter, and event-log inspection.',
    events: [
      'debug/overlay:toggle', 'debug/overlay:visible',
      'debug/event-log:filter', 'debug/event-log:get',
    ] as const,
  };

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  private readonly _maxLogSize: number;
  private readonly _fpsHistorySize: number;
  private readonly _toggleKeys: ReadonlySet<string>;

  // ---------------------------------------------------------------------------
  // Runtime state
  // ---------------------------------------------------------------------------

  private _visible: boolean;

  /** Collider records tracked via `physics/body:add` / `physics/body:remove`. */
  private readonly _colliders = new Map<string, Collider>();

  /** Live entity references (for inspector + collider position lookup). */
  private readonly _entities = new Map<string, Entity>();

  /** Tilemap data from the most recent `tilemap/loaded` event. */
  private _tilemapData: TilemapData | null = null;

  /** Circular event log. */
  private readonly _eventLog: DebugEventEntry[] = [];

  /** Current event-log filter string (always lower-case). */
  private _eventFilter = '';

  /** Rolling frame-time samples in milliseconds. */
  private readonly _frameTimes: number[] = [];

  /** Current FPS estimate (updated each render frame). */
  private _fps = 0;

  // ---------------------------------------------------------------------------
  // Pixi display objects (all null when no renderer is available)
  // ---------------------------------------------------------------------------

  /** Graphics placed on the *world* layer for world-space overlays. */
  private _worldGfx: Graphics | null = null;

  /** Container placed on the *debug* screen-space layer. */
  private _screenContainer: Container | null = null;

  /** Graphics for FPS chart (child of _screenContainer). */
  private _fpsChart: Graphics | null = null;

  /** Text for FPS label (child of _screenContainer). */
  private _fpsLabel: Text | null = null;

  /** Text for entity inspector (child of _screenContainer). */
  private _entityText: Text | null = null;

  /** Text for event log (child of _screenContainer). */
  private _eventLogText: Text | null = null;

  /** Unregister function returned by `EventBus.addSpy`. */
  private _removeSpy: (() => void) | null = null;

  /** Bound keyboard handler stored so it can be removed on destroy. */
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(options: DebugPluginOptions = {}) {
    this._maxLogSize = options.maxEventLogSize ?? 200;
    this._fpsHistorySize = options.fpsHistorySize ?? 60;
    this._toggleKeys = new Set(options.toggleKeys ?? ['`', 'F12']);
    this._visible = options.visible ?? false;
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // -- Pixi setup (silently skips when no renderer is available) ----------
    this._setupPixi(core);

    // -- EventBus spy for event log ------------------------------------------
    // Registered after _setupPixi so that internal renderer/layer events emitted
    // during initialisation are not captured in the game event log.
    this._removeSpy = core.events.addSpy((event, params) => {
      // Skip debug/* events to avoid recursive log pollution.
      if (!event.startsWith('debug/')) {
        this._recordEvent(event, params);
      }
    });

    // -- Physics events: track colliders ------------------------------------
    core.events.on<PhysicsBodyAddParams>(this.namespace, 'physics/body:add', (p) => {
      this._colliders.set(p.entityId, {
        shape: p.shape,
        layer: p.layer,
        movementMode: p.movementMode ?? 'pixel',
      });
    });

    core.events.on<PhysicsBodyRemoveParams>(this.namespace, 'physics/body:remove', (p) => {
      this._colliders.delete(p.entityId);
    });

    // -- Entity events: track live entities ---------------------------------
    core.events.on<EntityCreatedParams>(this.namespace, 'entity/created', (p) => {
      this._entities.set(p.entity.id, p.entity);
    });

    core.events.on<EntityDestroyedParams>(this.namespace, 'entity/destroyed', (p) => {
      this._entities.delete(p.entity.id);
    });

    // -- Tilemap events: track map data for grid overlay --------------------
    core.events.on<TilemapLoadedParams>(this.namespace, 'tilemap/loaded', (p) => {
      this._tilemapData = p.mapData;
    });

    core.events.on(this.namespace, 'tilemap/unloaded', () => {
      this._tilemapData = null;
    });

    // -- Render loop ---------------------------------------------------------
    core.events.on<CoreRenderParams>(this.namespace, 'core/render', (p) => {
      this._onRender(p);
    });

    // -- Public debug events -------------------------------------------------
    core.events.on<DebugOverlayToggleParams, DebugOverlayVisibleOutput>(
      this.namespace,
      'debug/overlay:toggle',
      (p, output) => {
        this._visible = p.visible !== undefined ? p.visible : !this._visible;
        output.visible = this._visible;
        this._applyVisibility();
      },
    );

    core.events.on<Record<string, never>, DebugOverlayVisibleOutput>(
      this.namespace,
      'debug/overlay:visible',
      (_p, output) => {
        output.visible = this._visible;
      },
    );

    core.events.on<DebugEventLogFilterParams>(
      this.namespace,
      'debug/event-log:filter',
      (p) => {
        this._eventFilter = (p.filter ?? '').toLowerCase();
      },
    );

    core.events.on<Record<string, never>, DebugEventLogGetOutput>(
      this.namespace,
      'debug/event-log:get',
      (_p, output) => {
        output.entries = this._filteredLog();
      },
    );

    // -- Keyboard toggle listener -------------------------------------------
    this._setupKeyboard();
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);

    this._removeSpy?.();
    this._removeSpy = null;

    this._teardownKeyboard();
    this._teardownPixi();

    this._colliders.clear();
    this._entities.clear();
    this._eventLog.length = 0;
    this._frameTimes.length = 0;
    this._tilemapData = null;
    this._fps = 0;
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  /** Whether the debug overlay is currently visible. */
  get visible(): boolean {
    return this._visible;
  }

  /** Current FPS estimate (updated each render frame). */
  get fps(): number {
    return this._fps;
  }

  /**
   * Read-only view of the complete (unfiltered) event log.
   * Most recent entry is last.
   */
  get eventLog(): readonly DebugEventEntry[] {
    return this._eventLog;
  }

  // ---------------------------------------------------------------------------
  // Private – event log
  // ---------------------------------------------------------------------------

  private _recordEvent(name: string, params: unknown): void {
    this._eventLog.push({ name, params, timestamp: performance.now() });
    if (this._eventLog.length > this._maxLogSize) {
      this._eventLog.shift();
    }
  }

  private _filteredLog(): DebugEventEntry[] {
    if (!this._eventFilter) return [...this._eventLog];
    const f = this._eventFilter;
    return this._eventLog.filter((e) => e.name.toLowerCase().includes(f));
  }

  // ---------------------------------------------------------------------------
  // Private – Pixi setup / teardown
  // ---------------------------------------------------------------------------

  private _setupPixi(core: Core): void {
    try {
      // World-space Graphics on the world layer (scrolls with camera).
      const worldResult = core.events.emitSync<{ name: string }, { layer?: Container }>(
        'renderer/layer',
        { name: 'world' },
      );
      const worldLayer = worldResult.output.layer;
      if (worldLayer) {
        const g = new Graphics();
        g.label = 'debug:world-overlay';
        g.zIndex = 9999;
        worldLayer.addChild(g);
        this._worldGfx = g;
      }

      // Screen-space Container on a new `debug` layer (z-index 400).
      const screenResult = core.events.emitSync<
        { name: string; zIndex: number },
        { layer?: Container }
      >('renderer/layer:create', { name: 'debug', zIndex: DEBUG_LAYER_Z });
      const screenLayer = screenResult.output.layer;
      if (screenLayer) {
        const container = new Container();
        container.label = 'debug:screen-panel';
        screenLayer.addChild(container);
        this._screenContainer = container;

        // FPS chart
        const chart = new Graphics();
        chart.x = 8;
        chart.y = 8;
        this._fpsChart = chart;
        container.addChild(chart);

        // FPS label — rendered on top of chart
        const fpsLabel = new Text({
          text: 'FPS: --',
          style: { fontSize: 12, fill: 0xffffff, fontFamily: 'monospace' },
        });
        fpsLabel.x = 10;
        fpsLabel.y = 10;
        this._fpsLabel = fpsLabel;
        container.addChild(fpsLabel);

        // Entity inspector text (below chart)
        const entityText = new Text({
          text: '',
          style: { fontSize: 11, fill: 0xaaffaa, fontFamily: 'monospace' },
        });
        entityText.x = 8;
        entityText.y = 8 + CHART_H + SECTION_GAP + 16;
        this._entityText = entityText;
        container.addChild(entityText);

        // Event log text (below entity inspector)
        const logText = new Text({
          text: '',
          style: { fontSize: 10, fill: 0xffffaa, fontFamily: 'monospace' },
        });
        logText.x = 8;
        logText.y = 8 + CHART_H + SECTION_GAP + 16 + 180;
        this._eventLogText = logText;
        container.addChild(logText);
      }
    } catch {
      // Renderer not available — silently skip all visual setup.
    }

    this._applyVisibility();
  }

  private _teardownPixi(): void {
    if (this._worldGfx) {
      this._worldGfx.destroy();
      this._worldGfx = null;
    }
    if (this._screenContainer) {
      this._screenContainer.destroy({ children: true });
      this._screenContainer = null;
    }
    this._fpsChart = null;
    this._fpsLabel = null;
    this._entityText = null;
    this._eventLogText = null;
  }

  private _applyVisibility(): void {
    if (this._worldGfx) this._worldGfx.visible = this._visible;
    if (this._screenContainer) this._screenContainer.visible = this._visible;
  }

  // ---------------------------------------------------------------------------
  // Private – render loop
  // ---------------------------------------------------------------------------

  private _onRender(params: CoreRenderParams): void {
    // Always update FPS tracking regardless of overlay visibility.
    this._frameTimes.push(params.delta);
    if (this._frameTimes.length > this._fpsHistorySize) this._frameTimes.shift();

    const count = this._frameTimes.length;
    if (count > 0) {
      const sum = this._frameTimes.reduce((a, b) => a + b, 0);
      this._fps = Math.round(1000 / (sum / count));
    }

    if (!this._visible) return;

    this._drawWorldOverlay();
    this._updateFpsPanel();
    this._updateEntityInspector();
    this._updateEventLogPanel();
  }

  // ---------------------------------------------------------------------------
  // Private – world-space overlay (colliders + tilemap grid)
  // ---------------------------------------------------------------------------

  private _drawWorldOverlay(): void {
    const g = this._worldGfx;
    if (!g) return;

    g.clear();
    this._drawTilemapGrid(g);
    this._drawColliders(g);
  }

  private _drawTilemapGrid(g: Graphics): void {
    const map = this._tilemapData;
    if (!map) return;

    const { tileWidth, tileHeight, mapWidth, mapHeight, chunkSize = 16 } = map;
    const worldW = mapWidth * tileWidth;
    const worldH = mapHeight * tileHeight;

    const drawTileLines = mapWidth <= GRID_TILE_LIMIT && mapHeight <= GRID_TILE_LIMIT;

    // Individual tile grid (thin, semi-transparent)
    if (drawTileLines) {
      for (let col = 0; col <= mapWidth; col++) {
        g.moveTo(col * tileWidth, 0).lineTo(col * tileWidth, worldH);
      }
      for (let row = 0; row <= mapHeight; row++) {
        g.moveTo(0, row * tileHeight).lineTo(worldW, row * tileHeight);
      }
      g.stroke({ width: 0.5, color: 0x4444aa, alpha: 0.3 });
    }

    // Chunk boundaries (thicker, more visible)
    for (let col = 0; col <= mapWidth; col += chunkSize) {
      g.moveTo(col * tileWidth, 0).lineTo(col * tileWidth, worldH);
    }
    for (let row = 0; row <= mapHeight; row += chunkSize) {
      g.moveTo(0, row * tileHeight).lineTo(worldW, row * tileHeight);
    }
    g.stroke({ width: 1.5, color: 0x6666ff, alpha: 0.55 });

    // Highlight collision tiles
    const collisionLayer = map.layers.find((l) => l.collider);
    if (collisionLayer?.tileShapes) {
      const { tileShapes, data } = collisionLayer;
      for (let row = 0; row < mapHeight; row++) {
        for (let col = 0; col < mapWidth; col++) {
          const id = data[row * mapWidth + col];
          if (id > 0 && tileShapes[id] !== undefined) {
            g.rect(col * tileWidth, row * tileHeight, tileWidth, tileHeight);
          }
        }
      }
      g.fill({ color: 0xff3333, alpha: 0.18 });
    }
  }

  private _drawColliders(g: Graphics): void {
    for (const [entityId, collider] of this._colliders) {
      const entity = this._entities.get(entityId);
      if (!entity) continue;

      const colour = layerColour(collider.layer);
      this._drawColliderShape(g, collider.shape, entity.position.x, entity.position.y, colour);
    }
  }

  private _drawColliderShape(
    g: Graphics,
    shape: ColliderShape,
    x: number,
    y: number,
    colour: number,
  ): void {
    const ox = shape.offsetX ?? 0;
    const oy = shape.offsetY ?? 0;
    const style = { width: COLLIDER_STROKE_W, color: colour, alpha: 0.9 };

    if (shape.type === 'rect') {
      g.rect(x + ox, y + oy, shape.width, shape.height).stroke(style);
    } else if (shape.type === 'circle') {
      g.circle(x + ox, y + oy, shape.radius).stroke(style);
    } else {
      // point — draw a small cross
      const cx = x + ox;
      const cy = y + oy;
      g.moveTo(cx - 4, cy).lineTo(cx + 4, cy);
      g.moveTo(cx, cy - 4).lineTo(cx, cy + 4);
      g.stroke(style);
    }
  }

  // ---------------------------------------------------------------------------
  // Private – screen panels
  // ---------------------------------------------------------------------------

  private _updateFpsPanel(): void {
    const chart = this._fpsChart;
    const label = this._fpsLabel;
    if (!chart || !label) return;

    const samples = this._frameTimes;
    const last = samples[samples.length - 1] ?? 0;

    label.text = `FPS: ${this._fps}  (${last.toFixed(1)} ms)`;

    // Redraw chart
    chart.clear();

    const cw = PANEL_W - 16;
    const ch = CHART_H;

    // Background
    chart.rect(0, 14, cw, ch).fill({ color: 0x000000, alpha: 0.55 });

    // 16 ms baseline
    const baselineY = 14 + ch - Math.min((FPS_TARGET_MS / 50) * ch, ch);
    chart.moveTo(0, baselineY).lineTo(cw, baselineY);
    chart.stroke({ width: 1, color: 0x888888, alpha: 0.5 });

    // Frame-time line
    if (samples.length >= 2) {
      const maxMs = Math.max(50, ...samples);
      for (let i = 0; i < samples.length; i++) {
        const px = (i / (samples.length - 1)) * cw;
        const py = 14 + ch - ((samples[i]! / maxMs) * ch);
        if (i === 0) chart.moveTo(px, py);
        else chart.lineTo(px, py);
      }
      // Colour: green when ≤ 16 ms, yellow–red as it exceeds the target
      const avgMs = samples.reduce((a, b) => a + b, 0) / samples.length;
      const heat = Math.min((avgMs - FPS_TARGET_MS) / FPS_TARGET_MS, 1);
      const lineColour = heat <= 0 ? 0x22ff66 : heat < 0.5 ? 0xffee22 : 0xff3333;
      chart.stroke({ width: 1.5, color: lineColour });
    }
  }

  private _updateEntityInspector(): void {
    const text = this._entityText;
    if (!text) return;

    const lines: string[] = [`Entities: ${this._entities.size}`];
    let shown = 0;

    for (const entity of this._entities.values()) {
      if (shown >= 10) {
        lines.push(`  … (${this._entities.size - 10} more)`);
        break;
      }
      const tags = entity.tags.size > 0 ? [...entity.tags].join(', ') : '(no tags)';
      const px = entity.position.x.toFixed(0);
      const py = entity.position.y.toFixed(0);
      lines.push(`  ${entity.id}  [${tags}]  (${px}, ${py})`);
      shown++;
    }

    text.text = lines.join('\n');
  }

  private _updateEventLogPanel(): void {
    const text = this._eventLogText;
    if (!text) return;

    const entries = this._filteredLog();
    const recent = entries.slice(-20);

    const lines = recent.map((e) => {
      const secs = (e.timestamp / 1000).toFixed(2);
      return `[${secs}] ${e.name}`;
    });

    if (this._eventFilter) {
      lines.unshift(`filter: "${this._eventFilter}"`);
    }

    text.text = lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Private – keyboard toggle
  // ---------------------------------------------------------------------------

  private _setupKeyboard(): void {
    if (typeof window === 'undefined') return;

    this._keyHandler = (e: KeyboardEvent) => {
      if (this._toggleKeys.has(e.key)) {
        e.preventDefault();
        this._visible = !this._visible;
        this._applyVisibility();
      }
    };

    window.addEventListener('keydown', this._keyHandler);
  }

  private _teardownKeyboard(): void {
    if (this._keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._keyHandler);
    }
    this._keyHandler = null;
  }
}
