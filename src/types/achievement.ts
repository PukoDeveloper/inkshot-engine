// ---------------------------------------------------------------------------
// Achievement definition
// ---------------------------------------------------------------------------

/**
 * Defines a single achievement.
 *
 * Achievements can be **instant** (unlocked the moment a condition is
 * satisfied) or **progressive** (requiring a counter to reach a threshold).
 */
export interface AchievementDef {
  /** Unique identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Human-readable description. */
  description?: string;
  /**
   * For progressive achievements: the number of times the trigger event
   * must fire before the achievement is unlocked.
   *
   * When `threshold` is `1` (or omitted), the achievement unlocks on the
   * first matching event.
   */
  threshold?: number;
  /**
   * EventBus event name that increments progress towards this achievement.
   *
   * When `triggerEvent` is set, the plugin subscribes to it and calls
   * `achievement/progress` automatically.
   *
   * The event payload is passed to `triggerFilter` (if provided) so you can
   * ignore events that do not match the right context.
   */
  triggerEvent?: string;
  /**
   * Optional predicate evaluated each time `triggerEvent` fires.
   *
   * Return `true` to count the event towards the achievement's progress.
   * When omitted, every occurrence of `triggerEvent` counts.
   */
  triggerFilter?: (payload: unknown) => boolean;
  /** Optional URL/key for an icon image. */
  icon?: string;
  /** Whether this achievement is hidden until unlocked. Default `false`. */
  hidden?: boolean;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

/** Runtime state of a single achievement. */
export interface AchievementState {
  id: string;
  /** Number of qualifying events that have occurred. */
  progress: number;
  /** Total events required (equal to `AchievementDef.threshold ?? 1`). */
  threshold: number;
  /** Whether the achievement has been unlocked. */
  unlocked: boolean;
  /** ISO timestamp when unlocked, or `null`. */
  unlockedAt: string | null;
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/** Params for `achievement/define`. */
export interface AchievementDefineParams {
  achievement: AchievementDef;
}

/** Params for `achievement/unlock`. Manually unlocks an achievement. */
export interface AchievementUnlockParams {
  id: string;
}

/** Params for `achievement/progress`. Increments progress by `amount`. */
export interface AchievementProgressParams {
  id: string;
  /** Amount to add to the progress counter. Defaults to `1`. */
  amount?: number;
}

/** Params for `achievement/get`. */
export interface AchievementGetParams {
  id: string;
}

/** Output for `achievement/get`. */
export interface AchievementGetOutput {
  achievement: AchievementState | null;
}

/** Output for `achievement/list`. */
export interface AchievementListOutput {
  achievements: AchievementState[];
}

/**
 * Notification emitted as `achievement/unlocked` when an achievement is
 * unlocked for the first time.
 */
export interface AchievementUnlockedParams {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

/** Params for `achievement/reset`. Resets a single achievement. */
export interface AchievementResetParams {
  id: string;
}
