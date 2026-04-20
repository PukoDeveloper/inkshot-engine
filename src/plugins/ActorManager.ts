import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type { ScriptEndedParams } from '../types/script.js';
import type {
  ActorDef,
  ActorInstance,
  TriggerDef,
  ActorDefineParams,
  ActorSpawnParams,
  ActorSpawnOutput,
  ActorDespawnParams,
  ActorStateSetParams,
  ActorStateGetParams,
  ActorStateGetOutput,
  ActorTriggerParams,
  ActorSpawnedParams,
  ActorDespawnedParams,
  ActorScriptStartedParams,
  ActorScriptEndedParams,
  ActorStateChangedParams,
} from '../types/actor.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Info stored when a blocking trigger preempts the primary script lane. */
interface InterruptRecord {
  /** The trigger that caused the interruption. */
  readonly triggerId: string;
  /** The trigger definition (for `onEnd` lookup). */
  readonly triggerDef: TriggerDef;
  /**
   * The script ID that was running on the primary lane *before* it was
   * preempted.  `null` when nothing was running at the time.
   */
  readonly preemptedScriptId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextId = 0;
function generateInstanceId(): string {
  return `actor_${++_nextId}`;
}

// ---------------------------------------------------------------------------
// ActorManager
// ---------------------------------------------------------------------------

/**
 * Plugin that manages **actors** — game characters whose behaviour is driven
 * by a collection of scripts and a trigger table.
 *
 * ### Concepts
 *
 * An **actor type** ({@link ActorDef}) is a blueprint that bundles:
 * - A list of {@link ScriptDef}s the actor may run.
 * - A list of {@link TriggerDef}s that describe *when* to run each script and
 *   *how* it should interact with the actor's other running scripts.
 *
 * An **actor instance** is a live copy of that blueprint with its own
 * independent state store (`ActorInstance.state`).  All scripts running on
 * the same instance share that state — it is seeded into every script run as
 * `vars['$actor']`.
 *
 * ---
 *
 * ### Trigger modes
 *
 * **`'concurrent'`** — The script is launched in an isolated instance lane
 * (`<actorInstanceId>:<triggerId>`).  It runs in parallel with the actor's
 * primary script lane and any other concurrent lanes.  Good for looping
 * background behaviour (patrol, ambient sound cues, VFX).
 *
 * **`'blocking'`** — The script is launched on the actor's *primary* instance
 * lane (`<actorInstanceId>`).  If a lower-priority script is already running
 * there it is preempted.  When the blocking script ends, `onEnd` determines
 * what happens next: `'restore'` re-launches the preempted script,
 * `'nothing'` leaves the primary lane idle, or any other string re-launches
 * the named script.
 *
 * ---
 *
 * ### Merchant example
 *
 * ```ts
 * const merchantDef: ActorDef = {
 *   id: 'merchant',
 *   initialState: { isAvailable: true, gold: 500 },
 *   scripts: [
 *     { id: 'merchant-patrol',   nodes: [ … ] },
 *     { id: 'merchant-dialogue', nodes: [ … ] },
 *   ],
 *   triggers: [
 *     {
 *       id: 'auto-patrol',
 *       event: 'actor/spawned',
 *       script: 'merchant-patrol',
 *       mode: 'concurrent',
 *     },
 *     {
 *       id: 'player-interact',
 *       event: 'player/interact',
 *       condition: (ctx) =>
 *         ctx.actorState.isAvailable === true &&
 *         (ctx.eventPayload as { targetId: string }).targetId === ctx.actorInstance.id,
 *       script: 'merchant-dialogue',
 *       mode: 'blocking',
 *       priority: 10,
 *       onEnd: 'restore',
 *       varsFromEvent: (p) => ({ playerId: (p as { playerId: string }).playerId }),
 *     },
 *   ],
 * };
 *
 * core.events.emitSync('actor/define', { def: merchantDef });
 * core.events.emitSync('actor/spawn',  { actorType: 'merchant', instanceId: 'merchant-1' });
 * ```
 *
 * ---
 *
 * ### EventBus API — commands received
 *
 * | Event             | Params / Output                          |
 * |-------------------|------------------------------------------|
 * | `actor/define`    | `ActorDefineParams`                      |
 * | `actor/spawn`     | `ActorSpawnParams → ActorSpawnOutput`    |
 * | `actor/despawn`   | `ActorDespawnParams`                     |
 * | `actor/state:set` | `ActorStateSetParams`                    |
 * | `actor/state:get` | `ActorStateGetParams → ActorStateGetOutput` |
 * | `actor/trigger`   | `ActorTriggerParams`                     |
 *
 * ### EventBus API — notifications emitted
 *
 * | Event                  | Params                       |
 * |------------------------|------------------------------|
 * | `actor/spawned`        | `ActorSpawnedParams`         |
 * | `actor/despawned`      | `ActorDespawnedParams`       |
 * | `actor/script:started` | `ActorScriptStartedParams`   |
 * | `actor/script:ended`   | `ActorScriptEndedParams`     |
 * | `actor/state:changed`  | `ActorStateChangedParams`    |
 */
export class ActorManager implements EnginePlugin {
  readonly namespace = 'actor';

  /**
   * Declare that this plugin needs ScriptManager to be initialised first.
   * The dependency is declared by namespace; the engine will ensure the
   * ScriptManager's `init` runs before ours.
   */
  readonly dependencies = ['script'] as const;

  private _core: Core | null = null;

  /** Registered actor type blueprints, keyed by `ActorDef.id`. */
  private readonly _defs = new Map<string, ActorDef>();

  /** Live actor instances, keyed by `ActorInstance.id`. */
  private readonly _instances = new Map<string, ActorInstance>();

  /**
   * Per-instance event-unbind functions.
   * Calling every function in the array removes all event listeners that were
   * registered when the instance was spawned.
   */
  private readonly _offFns = new Map<string, Array<() => void>>();

  /**
   * Per-instance interruption record for the primary script lane.
   *
   * Set when a blocking trigger preempts the current primary lane.
   * Consumed (and cleared) when the blocking script ends.
   */
  private readonly _interrupted = new Map<string, InterruptRecord>();

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    // ── actor/define ─────────────────────────────────────────────────────────
    events.on<ActorDefineParams>(this.namespace, 'actor/define', (params) => {
      this._define(params.def);
    });

    // ── actor/spawn ──────────────────────────────────────────────────────────
    events.on<ActorSpawnParams, ActorSpawnOutput>(
      this.namespace,
      'actor/spawn',
      (params, output) => {
        const instance = this._spawn(params);
        if (instance) {
          output.instance = instance;
        }
      },
    );

    // ── actor/despawn ─────────────────────────────────────────────────────────
    events.on<ActorDespawnParams>(this.namespace, 'actor/despawn', (params) => {
      this._despawn(params.instanceId);
    });

    // ── actor/state:set ───────────────────────────────────────────────────────
    events.on<ActorStateSetParams>(this.namespace, 'actor/state:set', (params) => {
      const instance = this._instances.get(params.instanceId);
      if (!instance) {
        console.warn(
          `[ActorManager] actor/state:set: instance "${params.instanceId}" not found.`,
        );
        return;
      }
      const previous = instance.state[params.key];
      instance.state[params.key] = params.value;
      core.events.emitSync<ActorStateChangedParams>('actor/state:changed', {
        instanceId: params.instanceId,
        key:        params.key,
        value:      params.value,
        previous,
      });
    });

    // ── actor/state:get ───────────────────────────────────────────────────────
    events.on<ActorStateGetParams, ActorStateGetOutput>(
      this.namespace,
      'actor/state:get',
      (params, output) => {
        const instance = this._instances.get(params.instanceId);
        output.state = instance ? { ...instance.state } : null;
      },
    );

    // ── actor/trigger (manual fire) ───────────────────────────────────────────
    events.on<ActorTriggerParams>(this.namespace, 'actor/trigger', (params) => {
      const instance = this._instances.get(params.instanceId);
      if (!instance) {
        console.warn(
          `[ActorManager] actor/trigger: instance "${params.instanceId}" not found.`,
        );
        return;
      }
      const def = this._defs.get(instance.actorType);
      if (!def) return;
      const trigger = def.triggers.find((t) => t.id === params.triggerId);
      if (!trigger) {
        console.warn(
          `[ActorManager] actor/trigger: trigger "${params.triggerId}" not found ` +
          `on actor type "${instance.actorType}".`,
        );
        return;
      }
      this._runTrigger(instance, trigger, undefined, params.vars);
    });
  }

  destroy(core: Core): void {
    // Despawn every live instance (stops scripts and removes listeners)
    for (const instanceId of [...this._instances.keys()]) {
      this._despawn(instanceId);
    }
    core.events.removeNamespace(this.namespace);
    this._defs.clear();
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** All live actor instances as an array (snapshot). */
  get instances(): ActorInstance[] {
    return [...this._instances.values()];
  }

  /** Retrieve a live actor instance by ID, or `undefined` if not found. */
  getInstance(instanceId: string): ActorInstance | undefined {
    return this._instances.get(instanceId);
  }

  // ---------------------------------------------------------------------------
  // Private – define
  // ---------------------------------------------------------------------------

  private _define(def: ActorDef): void {
    const core = this._core!;
    this._defs.set(def.id, def);
    // Forward all scripts to ScriptManager so they are available to run.
    for (const script of def.scripts) {
      core.events.emitSync('script/define', { script });
    }
  }

  // ---------------------------------------------------------------------------
  // Private – spawn / despawn
  // ---------------------------------------------------------------------------

  private _spawn(params: ActorSpawnParams): ActorInstance | null {
    const core = this._core!;
    const def = this._defs.get(params.actorType);
    if (!def) {
      console.warn(
        `[ActorManager] actor/spawn: actor type "${params.actorType}" is not defined.`,
      );
      return null;
    }

    const instanceId = params.instanceId ?? generateInstanceId();
    if (this._instances.has(instanceId)) {
      console.warn(
        `[ActorManager] actor/spawn: instance "${instanceId}" already exists.`,
      );
      return null;
    }

    // Deep-copy initial state so instances are independent.
    const state: Record<string, unknown> = {
      ...(def.initialState ?? {}),
      ...(params.initialState ?? {}),
    };

    const instance: ActorInstance = {
      id:         instanceId,
      actorType:  params.actorType,
      state,
      entityId:   params.entityId,
    };

    this._instances.set(instanceId, instance);

    // Bind event listeners for all triggers.
    const offs: Array<() => void> = [];
    for (const trigger of def.triggers) {
      // actor/spawned is a special case: fire immediately after spawn.
      // We still register a real listener for future instances but also
      // call the trigger directly right after emitting actor/spawned.
      const off = core.events.on(
        this.namespace,
        trigger.event,
        (payload: unknown) => {
          this._runTrigger(instance, trigger, payload);
        },
      );
      offs.push(off);
    }
    this._offFns.set(instanceId, offs);

    // Notify that the actor is live.  This fires any 'actor/spawned' triggers
    // registered above via the event bus.
    core.events.emitSync<ActorSpawnedParams>('actor/spawned', { instance });

    return instance;
  }

  private _despawn(instanceId: string): void {
    const core = this._core!;
    const instance = this._instances.get(instanceId);
    if (!instance) {
      console.warn(
        `[ActorManager] actor/despawn: instance "${instanceId}" not found.`,
      );
      return;
    }

    // Remove all event listeners.
    const offs = this._offFns.get(instanceId) ?? [];
    for (const off of offs) off();
    this._offFns.delete(instanceId);

    // Stop every script lane that belongs to this actor.
    // Primary lane: instanceId
    // Concurrent lanes: instanceId:<triggerId>
    core.events.emitSync('script/stop', { instanceId });
    const def = this._defs.get(instance.actorType);
    if (def) {
      for (const trigger of def.triggers) {
        if (trigger.mode === 'concurrent') {
          core.events.emitSync('script/stop', {
            instanceId: this._concurrentLaneId(instanceId, trigger.id),
          });
        }
      }
    }

    this._interrupted.delete(instanceId);
    this._instances.delete(instanceId);

    core.events.emitSync<ActorDespawnedParams>('actor/despawned', { instance });
  }

  // ---------------------------------------------------------------------------
  // Private – trigger execution
  // ---------------------------------------------------------------------------

  private _runTrigger(
    instance: ActorInstance,
    trigger: TriggerDef,
    eventPayload?: unknown,
    extraVars?: Record<string, unknown>,
  ): void {
    const core = this._core!;

    // Evaluate guard condition.
    if (trigger.condition) {
      const ctx = {
        actorInstance: instance,
        actorState:    instance.state,
        eventPayload,
        core,
      };
      if (!trigger.condition(ctx)) return;
    }

    // Build the vars seed for the script.
    const varsFromEvent = trigger.varsFromEvent?.(eventPayload) ?? {};
    const vars: Record<string, unknown> = {
      $actor:   instance.state,    // live reference — mutations are shared
      $actorId: instance.id,
      ...varsFromEvent,
      ...(extraVars ?? {}),
    };

    if (trigger.mode === 'concurrent') {
      this._runConcurrent(instance, trigger, vars);
    } else {
      this._runBlocking(instance, trigger, vars);
    }
  }

  private _runConcurrent(
    instance: ActorInstance,
    trigger: TriggerDef,
    vars: Record<string, unknown>,
  ): void {
    const core = this._core!;
    const laneId = this._concurrentLaneId(instance.id, trigger.id);

    core.events.emitSync<ActorScriptStartedParams>('actor/script:started', {
      instanceId: instance.id,
      triggerId:  trigger.id,
      scriptId:   trigger.script,
      mode:       'concurrent',
    });

    // Listen for the script ending on this lane so we can emit actor/script:ended.
    const off = core.events.once<ScriptEndedParams>(
      this.namespace,
      'script/ended',
      (endedParams) => {
        if (endedParams.instanceId !== laneId) return;
        core.events.emitSync<ActorScriptEndedParams>('actor/script:ended', {
          instanceId: instance.id,
          triggerId:  trigger.id,
          scriptId:   trigger.script,
          mode:       'concurrent',
        });
      },
    );

    core.events.emitSync('script/run', {
      id:         trigger.script,
      instanceId: laneId,
      vars,
      priority:   trigger.priority ?? 0,
    });

    // If the script run was rejected (e.g. same lane running at higher priority),
    // clean up the dangling once-listener.
    if (!this._isRunning(laneId)) {
      off();
    }
  }

  private _runBlocking(
    instance: ActorInstance,
    trigger: TriggerDef,
    vars: Record<string, unknown>,
  ): void {
    const core = this._core!;
    const laneId = instance.id;                  // primary lane
    const priority = trigger.priority ?? 10;

    // Record which script is currently on the primary lane so we can restore it.
    const currentScriptId = this._primaryLaneScriptId(laneId);

    // Store the interrupt record BEFORE launching the new script, because
    // script/ended can fire synchronously for empty scripts.
    this._interrupted.set(laneId, {
      triggerId:        trigger.id,
      triggerDef:       trigger,
      preemptedScriptId: currentScriptId,
    });

    core.events.emitSync<ActorScriptStartedParams>('actor/script:started', {
      instanceId: instance.id,
      triggerId:  trigger.id,
      scriptId:   trigger.script,
      mode:       'blocking',
    });

    // Listen for the script ending on the primary lane.
    const off = core.events.once<ScriptEndedParams>(
      this.namespace,
      'script/ended',
      (endedParams) => {
        if (endedParams.instanceId !== laneId) return;
        this._onBlockingEnded(instance, trigger);
      },
    );

    core.events.emitSync('script/run', {
      id:         trigger.script,
      instanceId: laneId,
      vars,
      priority,
    });

    // If the run was rejected (lower priority than what's already running),
    // clean up the dangling listener and the interrupt record.
    if (!this._isRunningScript(laneId, trigger.script)) {
      off();
      this._interrupted.delete(laneId);
    }
  }

  private _onBlockingEnded(instance: ActorInstance, trigger: TriggerDef): void {
    const core = this._core!;
    const laneId = instance.id;

    core.events.emitSync<ActorScriptEndedParams>('actor/script:ended', {
      instanceId: instance.id,
      triggerId:  trigger.id,
      scriptId:   trigger.script,
      mode:       'blocking',
    });

    const record = this._interrupted.get(laneId);
    this._interrupted.delete(laneId);

    if (!record) return;

    const onEnd = record.triggerDef.onEnd ?? 'nothing';

    if (onEnd === 'nothing') {
      return;
    }

    if (onEnd === 'restore') {
      const scriptToRestore = record.preemptedScriptId;
      if (scriptToRestore) {
        // Rebuild a minimal vars seed for the restored script.
        const vars: Record<string, unknown> = {
          $actor:   instance.state,
          $actorId: instance.id,
        };
        core.events.emitSync('script/run', {
          id:         scriptToRestore,
          instanceId: laneId,
          vars,
          priority:   0,
        });
      }
      return;
    }

    // onEnd is a custom script ID.
    const vars: Record<string, unknown> = {
      $actor:   instance.state,
      $actorId: instance.id,
    };
    core.events.emitSync('script/run', {
      id:         onEnd,
      instanceId: laneId,
      vars,
      priority:   0,
    });
  }

  // ---------------------------------------------------------------------------
  // Private – helpers
  // ---------------------------------------------------------------------------

  private _concurrentLaneId(instanceId: string, triggerId: string): string {
    return `${instanceId}:${triggerId}`;
  }

  /**
   * Returns the scriptId currently running on the given instanceId lane,
   * or `null` when idle.
   *
   * We read this via `script/state:get` to avoid holding a direct reference
   * to ScriptManager.
   */
  private _primaryLaneScriptId(laneId: string): string | null {
    const core = this._core!;
    type StateOutput = { instances?: Array<{ instanceId: string; scriptId: string }> };
    const result = core.events.emitSync<Record<string, never>, StateOutput>(
      'script/state:get',
      {},
    );
    const inst = result.output.instances?.find((i) => i.instanceId === laneId);
    return inst?.scriptId ?? null;
  }

  /** True when the given instanceId has any script running on it. */
  private _isRunning(laneId: string): boolean {
    return this._primaryLaneScriptId(laneId) !== null;
  }

  /** True when the given instanceId is running the given scriptId. */
  private _isRunningScript(laneId: string, scriptId: string): boolean {
    return this._primaryLaneScriptId(laneId) === scriptId;
  }
}
