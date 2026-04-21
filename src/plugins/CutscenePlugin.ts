import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type { CoreUpdateParams } from '../types/rendering.js';
import type {
  CutsceneDef,
  CutsceneDefineParams,
  CutsceneEndedParams,
  CutscenePlayParams,
  CutsceneStartedParams,
  CutsceneState,
  CutsceneStateOutput,
  CutsceneStatus,
  CutsceneStep,
  CutsceneStepEndedParams,
  CutsceneStepStartedParams,
} from '../types/cutscene.js';

// ---------------------------------------------------------------------------
// Internal runtime state
// ---------------------------------------------------------------------------

interface ActiveCutscene {
  def: CutsceneDef;
  stepIndex: number;
  /** Time elapsed in the current step (ms). */
  elapsed: number;
  /** Whether a `script` step is currently awaited. */
  waitingForScript: boolean;
  /** Whether a `camera-move` / `camera-zoom` tween step is in progress. */
  waitingForTween: boolean;
  /** Remaining duration of an in-progress tween or wait step (ms). */
  stepRemaining: number;
  /** Whether the cutscene has been flagged for skipping. */
  skip: boolean;
  /** Parallel sub-step runners (used by the `parallel` step kind). */
  parallelRunners: ParallelRunner[] | null;
}

interface ParallelRunner {
  steps: CutsceneStep[];
  index: number;
  elapsed: number;
  stepRemaining: number;
  waitingForScript: boolean;
  done: boolean;
}

// ---------------------------------------------------------------------------
// CutscenePlugin
// ---------------------------------------------------------------------------

/**
 * Plugin that drives **scripted cutscenes** using a step-based timeline.
 *
 * A cutscene is a named sequence of {@link CutsceneStep} objects.  Each step
 * is executed in order; some steps complete instantly while others wait for
 * a timer (`wait`), a script (`script`), or a camera tween
 * (`camera-move` / `camera-zoom`).
 *
 * Cutscenes can optionally be **skipped** by the player (set
 * `CutsceneDef.skippable = true` and emit `cutscene/skip`).
 *
 * The `parallel` step kind lets you run multiple sub-sequences
 * simultaneously and wait for all of them to finish.
 *
 * ### Quick start
 * ```ts
 * import { createEngine, CutscenePlugin } from 'inkshot-engine';
 *
 * const cutscene = new CutscenePlugin();
 * const { core } = await createEngine({ plugins: [cutscene] });
 *
 * core.events.emitSync('cutscene/define', {
 *   cutscene: {
 *     id: 'intro',
 *     skippable: true,
 *     steps: [
 *       { kind: 'lock-input' },
 *       { kind: 'camera-move', x: 500, y: 300, duration: 1000 },
 *       { kind: 'wait', duration: 2000 },
 *       { kind: 'camera-follow', entityId: 'player' },
 *       { kind: 'unlock-input' },
 *     ],
 *   },
 * });
 *
 * core.events.emitSync('cutscene/play', { id: 'intro' });
 * ```
 *
 * ### EventBus API
 *
 * | Event                    | Params / Output                                         |
 * |--------------------------|---------------------------------------------------------|
 * | `cutscene/define`        | `CutsceneDefineParams`                                  |
 * | `cutscene/play`          | `CutscenePlayParams`                                    |
 * | `cutscene/skip`          | `{}`                                                    |
 * | `cutscene/stop`          | `{}`                                                    |
 * | `cutscene/state`         | `{} → CutsceneStateOutput`                              |
 * | `cutscene/started`       | `CutsceneStartedParams` (notification)                  |
 * | `cutscene/ended`         | `CutsceneEndedParams` (notification)                    |
 * | `cutscene/step:started`  | `CutsceneStepStartedParams` (notification)              |
 * | `cutscene/step:ended`    | `CutsceneStepEndedParams` (notification)                |
 */
export class CutscenePlugin implements EnginePlugin {
  readonly namespace = 'cutscene';

  private readonly _definitions: Map<string, CutsceneDef> = new Map();
  private _active: ActiveCutscene | null = null;

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // ── Event handlers ────────────────────────────────────────────────────
    core.events.on('cutscene', 'cutscene/define', (p: CutsceneDefineParams) => {
      this._definitions.set(p.cutscene.id, p.cutscene);
    });

    core.events.on('cutscene', 'cutscene/play', (p: CutscenePlayParams) => {
      if (this._active) {
        console.warn(
          `[CutscenePlugin] A cutscene ("${this._active.def.id}") is already playing. ` +
          `Call cutscene/stop first.`,
        );
        return;
      }
      const def = this._definitions.get(p.id);
      if (!def) {
        console.warn(`[CutscenePlugin] Unknown cutscene: "${p.id}".`);
        return;
      }
      this._startCutscene(def, core);
    });

    core.events.on('cutscene', 'cutscene/skip', () => {
      if (this._active && this._active.def.skippable !== false) {
        this._active.skip = true;
      }
    });

    core.events.on('cutscene', 'cutscene/stop', () => {
      if (this._active) {
        this._endCutscene(core, true);
      }
    });

    core.events.on(
      'cutscene',
      'cutscene/state',
      (_p: Record<string, never>, output: CutsceneStateOutput) => {
        const state = this._getState();
        output.status = state.status;
        output.cutsceneId = state.cutsceneId;
        output.stepIndex = state.stepIndex;
      },
    );

    // ── Advance active cutscene every fixed tick ───────────────────────────
    core.events.on('cutscene', 'core/update', (p: CoreUpdateParams) => {
      if (this._active) {
        this._advance(this._active, p.dt, core);
      }
    });
  }

  destroy(core: Core): void {
    this._active = null;
    core.events.removeNamespace('cutscene');
  }

  // ---------------------------------------------------------------------------
  // Direct accessors (pull API)
  // ---------------------------------------------------------------------------

  getState(): CutsceneState {
    return this._getState();
  }

  isPlaying(): boolean {
    return this._active !== null;
  }

  // ---------------------------------------------------------------------------
  // Private — cutscene lifecycle
  // ---------------------------------------------------------------------------

  private _startCutscene(def: CutsceneDef, core: Core): void {
    this._active = {
      def,
      stepIndex: -1,
      elapsed: 0,
      waitingForScript: false,
      waitingForTween: false,
      stepRemaining: 0,
      skip: false,
      parallelRunners: null,
    };
    core.events.emitSync('cutscene/started', { id: def.id } as CutsceneStartedParams);
    this._nextStep(this._active, core);
  }

  private _endCutscene(core: Core, skipped: boolean): void {
    if (!this._active) return;
    const id = this._active.def.id;
    this._active = null;
    core.events.emitSync('cutscene/ended', { id, skipped } as CutsceneEndedParams);
  }

  private _nextStep(active: ActiveCutscene, core: Core): void {
    active.stepIndex += 1;
    active.elapsed = 0;
    active.waitingForScript = false;
    active.waitingForTween = false;
    active.stepRemaining = 0;
    active.parallelRunners = null;

    const { def, stepIndex } = active;

    // All steps exhausted → cutscene done.
    if (stepIndex >= def.steps.length) {
      this._endCutscene(core, false);
      return;
    }

    const step = def.steps[stepIndex]!;
    core.events.emitSync('cutscene/step:started', {
      cutsceneId: def.id,
      stepIndex,
      step,
    } as CutsceneStepStartedParams);

    this._executeStep(active, step, core);
  }

  private _executeStep(active: ActiveCutscene, step: CutsceneStep, core: Core): void {
    switch (step.kind) {
      case 'wait':
        active.stepRemaining = step.duration;
        return;

      case 'camera-move': {
        const dur = step.duration ?? 500;
        if (dur <= 0) {
          core.events.emitSync('camera/move', { x: step.x, y: step.y });
          this._completeStep(active, core);
        } else {
          // Start a camera tween via TweenManager (best-effort; move immediately
          // if TweenManager is absent).
          core.events.emitSync('tween/to', {
            target: '_camera_',
            props: { x: step.x, y: step.y },
            duration: dur,
            onUpdate: (vals: { x: number; y: number }) => {
              core.events.emitSync('camera/move', { x: vals.x, y: vals.y });
            },
            id: `cutscene_cam_move_${active.def.id}`,
          });
          active.stepRemaining = dur;
          active.waitingForTween = true;
        }
        return;
      }

      case 'camera-zoom': {
        const dur = step.duration ?? 500;
        if (dur <= 0) {
          core.events.emitSync('camera/zoom', { zoom: step.zoom });
          this._completeStep(active, core);
        } else {
          active.stepRemaining = dur;
          active.waitingForTween = true;
        }
        return;
      }

      case 'camera-shake':
        core.events.emitSync('camera/shake', {
          intensity: step.intensity,
          duration: step.duration,
          decay: step.decay,
        });
        this._completeStep(active, core);
        return;

      case 'camera-follow': {
        if (step.entityId === null) {
          core.events.emitSync('camera/follow', { target: null });
        } else {
          // Retrieve the entity's position object and pass it as a follow target.
          const { output: entityOut } = core.events.emitSync<
            { tags: string[] },
            { entities?: { id: string; position: { x: number; y: number } }[] }
          >('entity/query', { tags: [] });
          const found = (entityOut.entities ?? []).find(
            (e) => e.id === step.entityId,
          );
          core.events.emitSync('camera/follow', { target: found?.position ?? null });
        }
        this._completeStep(active, core);
        return;
      }

      case 'emit':
        core.events.emitSync(step.event, step.params ?? {});
        this._completeStep(active, core);
        return;

      case 'script': {
        const scriptOut: { instanceId?: string } = {};
        core.events.emitSync('script/run', { scriptId: step.scriptId, context: step.context ?? {} }, scriptOut);
        active.waitingForScript = true;

        // Listen for the script to end, then advance.
        const instanceId = scriptOut.instanceId;
        if (instanceId) {
          core.events.once('cutscene', 'script/ended', (p: { instanceId: string }) => {
            if (p.instanceId === instanceId && this._active === active) {
              active.waitingForScript = false;
              this._completeStep(active, core);
            }
          });
        } else {
          // Script system absent — advance immediately.
          active.waitingForScript = false;
          this._completeStep(active, core);
        }
        return;
      }

      case 'lock-input':
        core.events.emitSync('input/lock', {});
        this._completeStep(active, core);
        return;

      case 'unlock-input':
        core.events.emitSync('input/unlock', {});
        this._completeStep(active, core);
        return;

      case 'parallel': {
        active.parallelRunners = step.steps.map((s) => ({
          steps: [s],
          index: -1,
          elapsed: 0,
          stepRemaining: 0,
          waitingForScript: false,
          done: false,
        }));
        for (const runner of active.parallelRunners) {
          this._advanceRunner(runner, 0, active, core);
        }
        return;
      }
    }
  }

  private _completeStep(active: ActiveCutscene, core: Core): void {
    core.events.emitSync('cutscene/step:ended', {
      cutsceneId: active.def.id,
      stepIndex: active.stepIndex,
    } as CutsceneStepEndedParams);
    this._nextStep(active, core);
  }

  // ---------------------------------------------------------------------------
  // Private — update loop
  // ---------------------------------------------------------------------------

  private _advance(active: ActiveCutscene, dt: number, core: Core): void {
    // Skip requested — jump to end.
    if (active.skip) {
      this._endCutscene(core, true);
      return;
    }

    // ── Parallel runner ──────────────────────────────────────────────────
    if (active.parallelRunners) {
      let allDone = true;
      for (const runner of active.parallelRunners) {
        if (!runner.done) {
          this._advanceRunner(runner, dt, active, core);
          if (!runner.done) allDone = false;
        }
      }
      if (allDone) {
        active.parallelRunners = null;
        this._completeStep(active, core);
      }
      return;
    }

    // ── Waiting for script ───────────────────────────────────────────────
    if (active.waitingForScript) return;

    // ── Timed step (wait / camera tween) ────────────────────────────────
    if (active.stepRemaining > 0) {
      active.stepRemaining -= dt;
      if (active.stepRemaining <= 0) {
        active.stepRemaining = 0;
        this._completeStep(active, core);
      }
    }
  }

  private _advanceRunner(
    runner: ParallelRunner,
    dt: number,
    active: ActiveCutscene,
    core: Core,
  ): void {
    if (runner.done) return;

    if (runner.stepRemaining > 0) {
      runner.stepRemaining -= dt;
      if (runner.stepRemaining <= 0) {
        runner.stepRemaining = 0;
        runner.done = true;
      }
      return;
    }

    if (runner.waitingForScript) return;

    runner.index += 1;
    if (runner.index >= runner.steps.length) {
      runner.done = true;
      return;
    }

    const step = runner.steps[runner.index]!;
    // For parallel sub-steps, only 'wait' and instant steps are supported.
    if (step.kind === 'wait') {
      runner.stepRemaining = step.duration;
    } else {
      // Instant step — execute and immediately mark done.
      this._executeStep(active, step, core);
      runner.done = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — helpers
  // ---------------------------------------------------------------------------

  private _getState(): CutsceneState {
    if (!this._active) {
      return { status: 'idle', cutsceneId: null, stepIndex: null };
    }
    const status: CutsceneStatus = this._active.skip ? 'skipping' : 'playing';
    return {
      status,
      cutsceneId: this._active.def.id,
      stepIndex: this._active.stepIndex,
    };
  }
}
