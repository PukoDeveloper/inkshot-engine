import type { Core } from '../core/Core.js';
import type { ScriptDef } from './script.js';

// ---------------------------------------------------------------------------
// Core data structures
// ---------------------------------------------------------------------------

/**
 * Runtime representation of a single actor instance.
 *
 * One *type* (described by {@link ActorDef}) can be spawned many times; each
 * spawn creates an independent `ActorInstance` with its own state store.
 */
export interface ActorInstance {
  /** Unique identifier for this spawned actor, e.g. `'merchant-1'`. */
  readonly id: string;
  /** Reference to the {@link ActorDef} that was used to create this instance. */
  readonly actorType: string;
  /**
   * Mutable key-value store shared by **all** scripts belonging to this actor.
   *
   * Scripts receive a reference to this object through their `vars` seed
   * (under the key `'$actor'`), so any writes are immediately visible to any
   * concurrently running script on the same actor.
   */
  readonly state: Record<string, unknown>;
  /**
   * Optional ID of an {@link Entity} that this actor is associated with.
   * The ActorManager does not enforce anything about this value; it is simply
   * forwarded to events so that other plugins can join the two records.
   */
  readonly entityId?: string;
}

// ---------------------------------------------------------------------------
// Trigger definition
// ---------------------------------------------------------------------------

/**
 * Context object passed to a {@link TriggerDef.condition} guard function.
 */
export interface TriggerConditionCtx {
  /** The actor instance that owns this trigger. */
  readonly actorInstance: ActorInstance;
  /**
   * Shorthand for `actorInstance.state`.
   * Provided for ergonomics inside inline arrow functions.
   */
  readonly actorState: Record<string, unknown>;
  /** The raw payload of the event that fired the trigger. */
  readonly eventPayload: unknown;
  /** The engine core (access to the event bus, etc.). */
  readonly core: Core;
}

/**
 * A single row in an actor's **trigger table**.
 *
 * Each trigger specifies:
 * 1. Which event to listen for (`event`).
 * 2. An optional guard condition (`condition`).
 * 3. Which script to run (`script`).
 * 4. Whether that script should run **concurrently** alongside any
 *    already-running scripts on this actor, or **block** them (`mode`).
 */
export interface TriggerDef {
  /**
   * Unique identifier within the owning {@link ActorDef}, e.g.
   * `'on-player-interact'`.
   */
  readonly id: string;

  /**
   * EventBus event name that activates this trigger,
   * e.g. `'player/interact'` or `'actor/spawned'`.
   */
  readonly event: string;

  /**
   * Optional guard function.
   *
   * Return `false` (or a falsy value) to skip this trigger even though the
   * event fired.  Useful for filtering events by target ID, actor state, etc.
   *
   * @example
   * ```ts
   * condition: (ctx) =>
   *   ctx.actorState.isAvailable === true &&
   *   (ctx.eventPayload as { targetId: string }).targetId === ctx.actorInstance.id,
   * ```
   */
  readonly condition?: (ctx: TriggerConditionCtx) => boolean;

  /** ID of the {@link ScriptDef} (defined in the owning {@link ActorDef}) to execute. */
  readonly script: string;

  /**
   * Execution mode:
   *
   * - **`'concurrent'`** — Launch the script in an independent instance lane
   *   (`${actorInstanceId}:${triggerId}`).  Does not affect any existing
   *   running scripts on this actor.  Typical uses: particle effects, ambient
   *   sounds, looping background behaviour.
   *
   * - **`'blocking'`** — Run the script on the actor's *primary* instance lane
   *   (`${actorInstanceId}`).  Any current primary-lane script is preempted
   *   (subject to `priority`).  After this script ends, `onEnd` controls what
   *   happens next.  Typical uses: dialogue, cutscenes, combat sequences.
   */
  readonly mode: 'concurrent' | 'blocking';

  /**
   * ScriptManager priority for this script run.
   *
   * Only applies to `'blocking'` mode.  A blocking script will only preempt
   * the current primary-lane script if its priority is ≥ the existing one.
   * Defaults to `10` for blocking triggers (so they preempt the default `0`
   * priority routinely used by auto-started scripts such as patrol loops).
   */
  readonly priority?: number;

  /**
   * What to do after a **blocking** script ends.
   *
   * - `'restore'`   — Re-run the script that was preempted (from the
   *                    beginning), e.g. resuming an NPC patrol after dialogue.
   * - `'nothing'`   — Do nothing (default).
   * - `'<scriptId>'`— Run the named script instead.
   */
  readonly onEnd?: 'restore' | 'nothing' | string;

  /**
   * Optional function that extracts extra seed variables from the triggering
   * event's payload.
   *
   * The returned object is **merged** into the script's initial `vars` (after
   * the actor state seed), so it can override the default seed if needed.
   *
   * @example
   * ```ts
   * varsFromEvent: (payload) => ({
   *   playerId: (payload as { playerId: string }).playerId,
   * }),
   * ```
   */
  readonly varsFromEvent?: (eventPayload: unknown) => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Actor definition
// ---------------------------------------------------------------------------

/**
 * Blueprint for an actor type.
 *
 * Register an `ActorDef` with `actor/define`; then spawn as many instances
 * as you need with `actor/spawn`.
 *
 * @example
 * ```ts
 * const merchantDef: ActorDef = {
 *   id: 'merchant',
 *   initialState: { isAvailable: true, gold: 500 },
 *   scripts: [
 *     { id: 'merchant-patrol', nodes: [ … ] },
 *     { id: 'merchant-dialogue', nodes: [ … ] },
 *   ],
 *   triggers: [
 *     { id: 'auto-patrol',    event: 'actor/spawned',     script: 'merchant-patrol',    mode: 'concurrent' },
 *     { id: 'player-interact', event: 'player/interact',  script: 'merchant-dialogue',  mode: 'blocking', onEnd: 'restore' },
 *   ],
 * };
 * ```
 */
export interface ActorDef {
  /** Unique identifier for this actor type, e.g. `'merchant'`, `'guard'`. */
  readonly id: string;
  /**
   * All scripts this actor may run.  They are automatically forwarded to
   * `ScriptManager` (`script/define`) when the def is registered.
   */
  readonly scripts: readonly ScriptDef[];
  /** Ordered list of triggers (evaluated in declaration order). */
  readonly triggers: readonly TriggerDef[];
  /**
   * Initial values for the actor's shared state store.
   * Deep-copied for each new instance so instances are fully independent.
   */
  readonly initialState?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// EventBus params / output
// ---------------------------------------------------------------------------

/** Parameters for `actor/define`. */
export interface ActorDefineParams {
  /** The actor type to register. */
  readonly def: ActorDef;
}

/** Parameters for `actor/spawn`. */
export interface ActorSpawnParams {
  /** Must match a previously registered {@link ActorDef.id}. */
  readonly actorType: string;
  /**
   * Explicit instance ID.  Auto-generated (`actor_<n>`) when omitted.
   * Must be unique across all live instances.
   */
  readonly instanceId?: string;
  /** Optional entity ID to associate with this actor. */
  readonly entityId?: string;
  /**
   * Extra key-value pairs merged into the actor's initial state.
   * These override `ActorDef.initialState` values for keys that collide.
   */
  readonly initialState?: Record<string, unknown>;
}

/** Output for `actor/spawn`. */
export interface ActorSpawnOutput {
  /** The newly created actor instance. */
  instance: ActorInstance;
}

/** Parameters for `actor/despawn`. */
export interface ActorDespawnParams {
  /** ID of the instance to remove. */
  readonly instanceId: string;
}

/** Parameters for `actor/state:set`. */
export interface ActorStateSetParams {
  /** Target instance ID. */
  readonly instanceId: string;
  /** State key to write. */
  readonly key: string;
  /** New value. */
  readonly value: unknown;
}

/** Parameters for `actor/state:get`. */
export interface ActorStateGetParams {
  /** Target instance ID. */
  readonly instanceId: string;
}

/** Output for `actor/state:get`. */
export interface ActorStateGetOutput {
  /**
   * Snapshot of the actor's shared state, or `null` if the instance does not
   * exist.
   */
  state: Record<string, unknown> | null;
}

/** Parameters for `actor/trigger`. */
export interface ActorTriggerParams {
  /** Target instance ID. */
  readonly instanceId: string;
  /** ID of the trigger to fire (must exist in the actor's definition). */
  readonly triggerId: string;
  /**
   * Extra variables merged on top of the trigger's normal var seed.
   * Useful for programmatically injecting context when manually firing a trigger.
   */
  readonly vars?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Notification events emitted BY ActorManager
// ---------------------------------------------------------------------------

/** Emitted after an actor instance is fully initialised and its triggers are bound. */
export interface ActorSpawnedParams {
  /** The newly spawned actor instance. */
  readonly instance: ActorInstance;
}

/** Emitted after an actor instance is removed and its triggers are unbound. */
export interface ActorDespawnedParams {
  /** The instance that was despawned. */
  readonly instance: ActorInstance;
}

/** Emitted when an actor begins running a script due to a trigger. */
export interface ActorScriptStartedParams {
  /** ID of the actor instance. */
  readonly instanceId: string;
  /** Trigger that caused the script to start. */
  readonly triggerId: string;
  /** ID of the script that started. */
  readonly scriptId: string;
  /** Execution mode of the trigger. */
  readonly mode: 'concurrent' | 'blocking';
}

/** Emitted when an actor's trigger-started script ends. */
export interface ActorScriptEndedParams {
  /** ID of the actor instance. */
  readonly instanceId: string;
  /** Trigger that originally caused the script to start. */
  readonly triggerId: string;
  /** ID of the script that ended. */
  readonly scriptId: string;
  /** Execution mode of the trigger. */
  readonly mode: 'concurrent' | 'blocking';
}

/** Emitted when an actor's shared state is mutated via `actor/state:set`. */
export interface ActorStateChangedParams {
  /** ID of the actor instance whose state changed. */
  readonly instanceId: string;
  /** The key that was written. */
  readonly key: string;
  /** The new value. */
  readonly value: unknown;
  /** The previous value (may be `undefined` if the key was not set before). */
  readonly previous: unknown;
}

/** Parameters for `actor/state:patch`. */
export interface ActorStatePatchParams {
  /** Target instance ID. */
  readonly instanceId: string;
  /**
   * An object whose keys are state keys to update and whose values are the
   * new values to assign.  All keys are written atomically before any
   * notification is emitted.
   */
  readonly patch: Record<string, unknown>;
}

/**
 * Emitted after all keys in a `actor/state:patch` call have been written.
 *
 * Unlike `actor/state:changed` (which fires once per key), this event fires
 * exactly **once** per patch, regardless of how many keys were updated.
 */
export interface ActorStatePatchedParams {
  /** ID of the actor instance whose state was patched. */
  readonly instanceId: string;
  /** The patch object that was applied (shallow copy). */
  readonly patch: Record<string, unknown>;
  /** Previous values for every key that was in the patch, keyed by key name. */
  readonly previous: Record<string, unknown>;
}

/** Output for `actor/list`. */
export interface ActorListOutput {
  /**
   * Snapshot of all currently live actor instances.
   *
   * The array contains live references — mutate with care.
   * Prefer `actor/state:set` / `actor/state:patch` to modify state.
   */
  instances: ActorInstance[];
}
