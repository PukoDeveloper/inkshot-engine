import type { Container } from 'pixi.js';
import type { Core } from '../core/Core.js';
import type { RendererPostProcessParams } from '../types/rendering.js';
import { ShaderPass } from './ShaderPass.js';

/**
 * Manages post-processing shader passes applied either to individual layers
 * or to the full screen (stage).
 *
 * Passes are ordered by `ShaderPass.order` (ascending).  The pipeline
 * rebuilds the `filters` array on the target `Container` whenever passes are
 * added, removed, or toggled.
 *
 * ### Usage via direct API
 * ```ts
 * postFx.addPass(bloomPass, 'world');       // per-layer
 * postFx.addPass(fadePass);                  // full-screen (stage)
 * postFx.removePass('bloom', 'world');
 * postFx.togglePass('fade', false);
 * ```
 *
 * ### Usage via EventBus
 * ```ts
 * core.events.emitSync('renderer/shader:add',    { pass: opts, target: 'world' });
 * core.events.emitSync('renderer/shader:remove',  { name: 'bloom', target: 'world' });
 * core.events.emitSync('renderer/shader:toggle',  { name: 'fade', enabled: false });
 * ```
 */
export class PostFxPipeline {
  private readonly _core: Core;

  /**
   * Passes keyed by target name.  `'screen'` is the full-stage target.
   * Each value is an array sorted by `order`.
   */
  private readonly _passes: Map<string, ShaderPass[]> = new Map();

  /** Cached resolver: target name → Container.  Populated lazily. */
  private readonly _targets: Map<string, Container> = new Map();

  constructor(core: Core) {
    this._core = core;

    // Subscribe to the post-process phase to update pass uniforms.
    core.events.on(
      'postFxPipeline',
      'renderer/post-process',
      this._onPostProcess,
      { priority: -100 },
    );

    // EventBus API ──────────────────────────────────────────────────────────
    core.events.on(
      'postFxPipeline',
      'renderer/shader:add',
      (params: { pass: ConstructorParameters<typeof ShaderPass>[0]; target?: string }) => {
        this.addPass(new ShaderPass(params.pass), params.target);
      },
    );

    core.events.on(
      'postFxPipeline',
      'renderer/shader:remove',
      (params: { name: string; target?: string }) => {
        this.removePass(params.name, params.target);
      },
    );

    core.events.on(
      'postFxPipeline',
      'renderer/shader:toggle',
      (params: { name: string; enabled: boolean; target?: string }) => {
        this.togglePass(params.name, params.enabled, params.target);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Register a shader pass on a target.
   *
   * @param pass    The `ShaderPass` to add.
   * @param target  Layer name, or omit / `'screen'` for the full stage.
   */
  addPass(pass: ShaderPass, target?: string): void {
    const key = target ?? 'screen';
    let list = this._passes.get(key);
    if (!list) {
      list = [];
      this._passes.set(key, list);
    }

    if (list.some(p => p.name === pass.name)) {
      throw new Error(
        `[PostFxPipeline] Pass "${pass.name}" already exists on target "${key}".`,
      );
    }

    list.push(pass);
    list.sort((a, b) => a.order - b.order);
    this._applyFilters(key);
  }

  /**
   * Remove a pass by name.
   *
   * @param name    Pass name.
   * @param target  Layer name, or omit / `'screen'` for the full stage.
   */
  removePass(name: string, target?: string): void {
    const key = target ?? 'screen';
    const list = this._passes.get(key);
    if (!list) return;

    const idx = list.findIndex(p => p.name === name);
    if (idx === -1) return;

    list.splice(idx, 1);
    this._applyFilters(key);
  }

  /**
   * Enable or disable a pass without removing it.
   *
   * @param name     Pass name.
   * @param enabled  Whether the pass should be active.
   * @param target   Layer name, or omit / `'screen'` for the full stage.
   */
  togglePass(name: string, enabled: boolean, target?: string): void {
    const key = target ?? 'screen';
    const list = this._passes.get(key);
    if (!list) return;

    const pass = list.find(p => p.name === name);
    if (pass) {
      pass.enabled = enabled;
      this._applyFilters(key);
    }
  }

  /**
   * Retrieve a pass by name.
   *
   * @param name    Pass name.
   * @param target  Layer name, or omit / `'screen'` for the full stage.
   */
  getPass(name: string, target?: string): ShaderPass | undefined {
    const key = target ?? 'screen';
    return this._passes.get(key)?.find(p => p.name === name);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  destroy(): void {
    this._passes.clear();
    this._targets.clear();
    this._core.events.removeNamespace('postFxPipeline');
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Resolve a target key to a `Container` (layer or stage). */
  private _resolveTarget(key: string): Container | null {
    if (this._targets.has(key)) return this._targets.get(key)!;

    let container: Container | null = null;
    if (key === 'screen') {
      container = this._core.app.stage;
    } else {
      // Ask Renderer for the named layer via EventBus.
      const result = this._core.events.emitSync(
        'renderer/layer',
        { name: key },
      ) as { output: { layer: Container } };
      container = result.output.layer ?? null;
    }

    if (container) {
      this._targets.set(key, container);
    }
    return container;
  }

  /** Rebuild the `filters` array on the target container. */
  private _applyFilters(key: string): void {
    const container = this._resolveTarget(key);
    if (!container) return;

    const list = this._passes.get(key);
    if (!list || list.length === 0) {
      container.filters = [];
      return;
    }

    container.filters = list
      .filter(p => p.enabled)
      .map(p => p.filter);
  }

  /** Per-frame uniform update for all enabled passes. */
  private readonly _onPostProcess = (params: RendererPostProcessParams): void => {
    for (const [, list] of this._passes) {
      for (const pass of list) {
        if (pass.enabled) {
          pass.update(params.alpha);
        }
      }
    }
  };
}
