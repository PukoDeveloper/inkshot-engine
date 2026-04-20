// ---------------------------------------------------------------------------
// EventBus params / output  (commands sent TO DialogueManager)
// ---------------------------------------------------------------------------

/**
 * A single run of styled text produced by the typewriter.
 *
 * Adjacent characters with the same colour are merged into one segment.
 * When `color` is absent the widget's default text colour is used.
 */
export interface DialogueTextSegment {
  readonly text: string;
  /** Pixi hex colour override (e.g. `0xff4444`), or `undefined` for default. */
  readonly color?: number;
}

/**
 * Parameters for `dialogue/show-text`.
 *
 * Instructs the dialogue box to display a line of text with an optional
 * typewriter effect. A session is automatically opened if none is active.
 * The script system is responsible for deciding *when* to call this.
 */
export interface DialogueShowTextParams {
  /** Raw text body. */
  readonly text?: string;
  /** i18n key for the text body (takes precedence over `text`). */
  readonly i18nKey?: string;
  /** Interpolation arguments forwarded to `i18n/t`. */
  readonly i18nArgs?: Record<string, string>;
  /** Speaker name displayed above the text body. */
  readonly speaker?: string;
  /** i18n key for the speaker name. */
  readonly speakerI18nKey?: string;
  /** Resource key for a speaker portrait image. */
  readonly portrait?: string;
  /** Characters-per-second typewriter speed override. */
  readonly speed?: number;
}

/**
 * Parameters for `dialogue/show-choices`.
 *
 * Instructs the dialogue box to display a list of choices. The script system
 * is responsible for filtering choices before calling this — no conditions are
 * evaluated here. A session is automatically opened if none is active.
 */
export interface DialogueShowChoicesParams {
  /** Optional prompt text shown above the choices. */
  readonly prompt?: string;
  /** The choices to display. `index` is used to identify the selection. */
  readonly choices: ReadonlyArray<{ readonly text: string; readonly index: number }>;
}

/**
 * Parameters for `dialogue/advance`.
 *
 * If the typewriter animation is in progress the text is completed
 * immediately. If the text is already fully shown, `dialogue/advanced` is
 * emitted so the script system can decide what to show next.
 */
export type DialogueAdvanceParams = Record<string, never>;

/** Parameters for `dialogue/choice`. */
export interface DialogueChoiceParams {
  /**
   * Zero-based index into the *visible* choices list that was last shown via
   * `dialogue/show-choices`.
   */
  readonly index: number;
}

/** Parameters for `dialogue/end` (ends the current session). */
export type DialogueEndCommandParams = Record<string, never>;

/** Output for `dialogue/state:get`. */
export interface DialogueStateGetOutput {
  /** Whether a dialogue session is currently active. */
  active: boolean;
  /**
   * Visible choices from the current choice display.
   * Empty when choices are not currently shown.
   */
  choices: Array<{ text: string; index: number }>;
  /** Portion of the current text that has been revealed by the typewriter. */
  text: string;
  /** `true` once the typewriter has finished revealing the full text. */
  textDone: boolean;
}

// ---------------------------------------------------------------------------
// Notifications emitted BY DialogueManager
// ---------------------------------------------------------------------------

/** Emitted when a dialogue session opens (first `show-text` or `show-choices` call). */
export type DialogueStartedParams = Record<string, never>;

/**
 * Emitted when `dialogue/show-text` is processed.
 * The display layer should use this to reset its state (text, portrait, etc.).
 */
export interface DialogueNodeParams {
  /** Resolved speaker name (empty string when absent). */
  readonly speaker: string;
  /** Resource key for the speaker portrait, or `undefined`. */
  readonly portrait: string | undefined;
}

/**
 * Emitted every update tick while text is being revealed by the typewriter.
 * Also emitted once with `done: true` when the full text is visible.
 */
export interface DialogueTextTickParams {
  /** Plain (tag-stripped) text revealed so far. */
  readonly text: string;
  readonly done: boolean;
  /**
   * The revealed text split into styled runs.
   * Use these to render inline colours in the dialogue box.
   * Each segment's `color` is a Pixi hex value; absent means "use default".
   */
  readonly segments: ReadonlyArray<DialogueTextSegment>;
}

/** Emitted when `dialogue/show-choices` is processed. */
export interface DialogueChoicesParams {
  readonly choices: ReadonlyArray<{ readonly text: string; readonly index: number }>;
}

/**
 * Emitted when the player triggers `dialogue/advance` and the text is already
 * fully revealed. The script system should react to this by calling
 * `dialogue/show-text`, `dialogue/show-choices`, or `dialogue/end`.
 */
export type DialogueAdvancedParams = Record<string, never>;

/**
 * Emitted when the player confirms a choice via `dialogue/choice`.
 * The script system should react to this to continue the narrative.
 */
export interface DialogueChoiceMadeParams {
  readonly index: number;
}

/** Emitted when a dialogue session ends. */
export type DialogueEndedParams = Record<string, never>;
