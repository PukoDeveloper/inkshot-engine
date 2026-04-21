// ---------------------------------------------------------------------------
// Experience curve
// ---------------------------------------------------------------------------

/**
 * A function that returns the *total* experience required to **reach** a given
 * level from level 1.
 *
 * @example RPG Maker MV default curve (simplified)
 * ```ts
 * const curve: ExpCurveFn = (level) => Math.floor(30 * (level ** 2) + 20 * level - 50);
 * ```
 */
export type ExpCurveFn = (level: number) => number;

/**
 * Curve definition registered per character class.
 */
export interface ExpCurveDef {
  /** Unique id matching a class or character archetype. */
  readonly id: string;
  /**
   * Custom curve function.  When omitted a default quadratic RPG Maker-style
   * curve is used:
   * `exp(level) = base * level^exp + extra * level`
   */
  readonly fn?: ExpCurveFn;
  /** Base coefficient for the default curve.  Defaults to `30`. */
  readonly base?: number;
  /** Exponent for the default curve.  Defaults to `2`. */
  readonly exp?: number;
  /** Extra linear coefficient for the default curve.  Defaults to `0`. */
  readonly extra?: number;
  /** Maximum level.  Defaults to `99`. */
  readonly maxLevel?: number;
}

// ---------------------------------------------------------------------------
// EventBus params / output
// ---------------------------------------------------------------------------

/** Parameters for `exp/curve:define`. */
export interface ExpCurveDefineParams {
  readonly curve: ExpCurveDef;
}

/** Parameters for `exp/gain`. */
export interface ExpGainParams {
  readonly actorId: string;
  /** ID of the curve to use (class id). */
  readonly curveId: string;
  readonly amount: number;
}

/** Output for `exp/gain`. */
export interface ExpGainOutput {
  /** New total experience after the gain. */
  totalExp: number;
  /** Current level after the gain. */
  level: number;
  /** True when one or more level-ups occurred. */
  leveledUp: boolean;
}

/** Parameters for `exp/set`. */
export interface ExpSetParams {
  readonly actorId: string;
  readonly curveId: string;
  /** Absolute experience value to assign. */
  readonly totalExp: number;
}

/** Parameters for `exp/get`. */
export interface ExpGetParams {
  readonly actorId: string;
}

/** Output for `exp/get`. */
export interface ExpGetOutput {
  totalExp: number;
  level: number;
  /** Experience needed to reach the next level from the current total. */
  toNextLevel: number;
  curveId: string;
}

// ---------------------------------------------------------------------------
// Notifications emitted BY ExperienceSystem
// ---------------------------------------------------------------------------

/** Emitted for every level gained (may fire multiple times per `exp/gain` call). */
export interface ExpLevelUpParams {
  readonly actorId: string;
  readonly previousLevel: number;
  readonly newLevel: number;
  readonly totalExp: number;
}

export interface ExpGainedParams {
  readonly actorId: string;
  readonly amount: number;
  readonly totalExp: number;
  readonly level: number;
}
