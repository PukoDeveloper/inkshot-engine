// ---------------------------------------------------------------------------
// StatsSystem types
// ---------------------------------------------------------------------------

/**
 * A flat map of numeric stat values for one actor/enemy.
 *
 * Built-in convention (games may add any extra keys):
 * `hp`, `hpMax`, `mp`, `mpMax`, `atk`, `def`, `agi`, `luk`
 */
export type StatMap = Record<string, number>;

/**
 * Defines the *base* stat profile for an actor type (used by
 * {@link ExperienceSystem} to recalculate stats on level-up).
 */
export interface StatProfileDef {
  /** Unique id that matches the actor/enemy id. */
  readonly id: string;
  /**
   * Base stat values at level 1 (before any equipment or buff modifiers).
   * Additional per-level growth is defined by the ExperienceSystem curve.
   */
  readonly base: StatMap;
}

// ---------------------------------------------------------------------------
// Buff / Debuff
// ---------------------------------------------------------------------------

/** How a single modifier value is applied to the stat it targets. */
export type ModifierMode = 'add' | 'multiply';

/**
 * A single stat modifier contributed by one equipment piece or buff effect.
 */
export interface StatModifier {
  /** The stat key this modifier affects (e.g. `'atk'`). */
  readonly stat: string;
  /** The numeric value to add or multiply. */
  readonly value: number;
  /** How to apply the value. `'add'` by default. */
  readonly mode?: ModifierMode;
}

/**
 * A status effect (buff or debuff) definition.
 *
 * Status effects are applied per-actor and may expire automatically after
 * `duration` milliseconds (managed by `TimerManager`).
 */
export interface StatusEffectDef {
  /** Unique identifier, e.g. `'poison'`, `'haste'`. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Stat modifiers granted while this effect is active. */
  readonly modifiers: readonly StatModifier[];
  /**
   * Optional duration in milliseconds.  When omitted the effect is permanent
   * until removed manually via `stats/status:remove`.
   */
  readonly duration?: number;
  /**
   * Optional damage-over-time (or heal-over-time) applied every `tickMs` ms.
   * Positive values = damage; negative = healing.
   */
  readonly tickDamage?: number;
  /** Tick interval in ms for `tickDamage`.  Defaults to `1000`. */
  readonly tickMs?: number;
}

// ---------------------------------------------------------------------------
// EventBus params / output
// ---------------------------------------------------------------------------

/** Parameters for `stats/profile:define`. */
export interface StatsProfileDefineParams {
  readonly profile: StatProfileDef;
}

/** Parameters for `stats/modifier:add`. */
export interface StatsModifierAddParams {
  /** Actor / enemy instance ID. */
  readonly actorId: string;
  /** Unique source key for this modifier group (e.g. `'sword'`, `'ring'`). */
  readonly source: string;
  /** List of modifiers provided by this source. */
  readonly modifiers: readonly StatModifier[];
}

/** Parameters for `stats/modifier:remove`. */
export interface StatsModifierRemoveParams {
  readonly actorId: string;
  /** Source key to remove (all modifiers from that source are removed). */
  readonly source: string;
}

/** Parameters for `stats/compute`. */
export interface StatsComputeParams {
  readonly actorId: string;
}

/** Output for `stats/compute`. */
export interface StatsComputeOutput {
  /** Fully computed (base + modifiers + status effects) stat map. */
  stats: StatMap;
}

/** Parameters for `stats/base:set`. */
export interface StatsBaseSetParams {
  readonly actorId: string;
  /** Partial stat map to merge into the actor's base stats. */
  readonly patch: StatMap;
}

/** Output for `stats/base:get`. */
export interface StatsBaseGetOutput {
  /** Current base stat map (before modifiers). */
  base: StatMap;
}

/** Parameters for `stats/base:get`. */
export interface StatsBaseGetParams {
  readonly actorId: string;
}

/** Parameters for `stats/status:apply`. */
export interface StatsStatusApplyParams {
  readonly actorId: string;
  readonly effectId: string;
}

/** Parameters for `stats/status:remove`. */
export interface StatsStatusRemoveParams {
  readonly actorId: string;
  readonly effectId: string;
}

/** Parameters for `stats/status:list`. */
export interface StatsStatusListParams {
  readonly actorId: string;
}

/** Output for `stats/status:list`. */
export interface StatsStatusListOutput {
  /** IDs of all active status effects on the actor. */
  effectIds: string[];
}

// ---------------------------------------------------------------------------
// Notification events emitted BY StatsSystem
// ---------------------------------------------------------------------------

/** Emitted whenever an actor's computed stats change. */
export interface StatsChangedParams {
  readonly actorId: string;
  readonly stats: StatMap;
}

/** Emitted when a status effect is applied. */
export interface StatsStatusAppliedParams {
  readonly actorId: string;
  readonly effectId: string;
  readonly effect: StatusEffectDef;
}

/** Emitted when a status effect expires or is manually removed. */
export interface StatsStatusExpiredParams {
  readonly actorId: string;
  readonly effectId: string;
}
