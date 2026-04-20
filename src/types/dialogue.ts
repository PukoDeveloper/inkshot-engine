// ---------------------------------------------------------------------------
// Dialogue Condition
// ---------------------------------------------------------------------------

/**
 * Matches when `game/state:get` returns the given state string.
 */
export interface DialogueConditionGameState {
  readonly type: 'game-state';
  readonly state: string;
}

/**
 * Matches when `save/global:get` contains `key` (and optionally equals `value`).
 */
export interface DialogueConditionSaveFlag {
  readonly type: 'save-flag';
  readonly key: string;
  /** If provided the stored value must deep-equal this for the condition to pass. */
  readonly value?: unknown;
}

/** Negates a child condition. */
export interface DialogueConditionNot {
  readonly type: 'not';
  readonly condition: DialogueCondition;
}

/** All child conditions must pass. */
export interface DialogueConditionAnd {
  readonly type: 'and';
  readonly conditions: readonly DialogueCondition[];
}

/** At least one child condition must pass. */
export interface DialogueConditionOr {
  readonly type: 'or';
  readonly conditions: readonly DialogueCondition[];
}

/**
 * A composable condition used in {@link DialogueConditionNode} and
 * {@link DialogueChoice} to guard transitions.
 */
export type DialogueCondition =
  | DialogueConditionGameState
  | DialogueConditionSaveFlag
  | DialogueConditionNot
  | DialogueConditionAnd
  | DialogueConditionOr;

// ---------------------------------------------------------------------------
// Dialogue Nodes
// ---------------------------------------------------------------------------

/**
 * Displays a line of text from a (optional) speaker.
 * Advances to `next` when the player progresses, or ends the dialogue if
 * `next` is absent.
 */
export interface DialogueTextNode {
  readonly id: string;
  readonly type: 'text';
  /** Speaker name displayed above the text body. */
  readonly speaker?: string;
  /** i18n key for the speaker name. */
  readonly speakerI18nKey?: string;
  /** Raw text body. */
  readonly text?: string;
  /** i18n key for the text body (takes precedence over `text`). */
  readonly i18nKey?: string;
  /** Interpolation arguments forwarded to `i18n/t`. */
  readonly i18nArgs?: Record<string, string>;
  /** Resource key for a speaker portrait image. */
  readonly portrait?: string;
  /** Node id to transition to after this line. Absent = end of dialogue. */
  readonly next?: string;
  /** Characters-per-second override for the typewriter effect on this line. */
  readonly speed?: number;
}

/**
 * Presents a list of options to the player.
 * Each option transitions to a different node on selection.
 */
export interface DialogueChoiceNode {
  readonly id: string;
  readonly type: 'choice';
  /** Optional prompt text shown above the choices. */
  readonly text?: string;
  /** i18n key for the prompt text. */
  readonly i18nKey?: string;
  /** Interpolation arguments for the prompt text. */
  readonly i18nArgs?: Record<string, string>;
  readonly choices: readonly DialogueChoice[];
}

/** A single selectable option inside a {@link DialogueChoiceNode}. */
export interface DialogueChoice {
  /** Display text for this option. */
  readonly text?: string;
  /** i18n key for the option text (takes precedence over `text`). */
  readonly i18nKey?: string;
  /** Interpolation arguments for the option text. */
  readonly i18nArgs?: Record<string, string>;
  /**
   * Optional guard: the choice is hidden / skipped when the condition
   * evaluates to `false`.
   */
  readonly condition?: DialogueCondition;
  /** Node id to transition to when this option is selected. */
  readonly next: string;
}

/**
 * Evaluates a condition and jumps to `then` or `else`.
 * When `else` is absent and the condition is false the dialogue ends.
 */
export interface DialogueConditionNode {
  readonly id: string;
  readonly type: 'condition';
  readonly condition: DialogueCondition;
  /** Node id for the truthy branch. */
  readonly then: string;
  /** Node id for the falsy branch. Absent = end dialogue. */
  readonly else?: string;
}

/** Unconditionally jumps to another node. */
export interface DialogueJumpNode {
  readonly id: string;
  readonly type: 'jump';
  readonly target: string;
}

/** Marks the end of a dialogue tree or branch. */
export interface DialogueEndNode {
  readonly id: string;
  readonly type: 'end';
}

/** Union of all node variants. */
export type DialogueNode =
  | DialogueTextNode
  | DialogueChoiceNode
  | DialogueConditionNode
  | DialogueJumpNode
  | DialogueEndNode;

// ---------------------------------------------------------------------------
// Dialogue Tree
// ---------------------------------------------------------------------------

/**
 * A complete dialogue tree: a flat record of nodes keyed by id, plus the
 * entry node id.
 */
export interface DialogueTree {
  /** All nodes in this tree, indexed by their `id`. */
  readonly nodes: Record<string, DialogueNode>;
  /** The id of the first node to enter when the dialogue starts. */
  readonly entry: string;
}

// ---------------------------------------------------------------------------
// EventBus params / output
// ---------------------------------------------------------------------------

/** Parameters for `dialogue/register`. */
export interface DialogueRegisterParams {
  /** Stable identifier for this tree (used in `dialogue/start` etc.). */
  readonly treeId: string;
  /** The dialogue tree to register. Replaces any existing tree with the same id. */
  readonly tree: DialogueTree;
}

/** Parameters for `dialogue/start`. */
export interface DialogueStartParams {
  /** Id of a previously registered {@link DialogueTree}. */
  readonly treeId: string;
}

/**
 * Parameters for `dialogue/advance`.
 *
 * If the typewriter animation is in progress the text is completed
 * immediately.  If the text is already fully shown the dialogue advances to
 * the next node (or ends if there is no next node).
 */
export type DialogueAdvanceParams = Record<string, never>;

/** Parameters for `dialogue/choice`. */
export interface DialogueChoiceParams {
  /**
   * Zero-based index into the *visible* choices list that was last emitted
   * via `dialogue/choices`.
   */
  readonly index: number;
}

/** Parameters for `dialogue/end` (force-ends the current dialogue). */
export type DialogueEndCommandParams = Record<string, never>;

/** Output for `dialogue/state:get`. */
export interface DialogueStateGetOutput {
  /** Whether a dialogue session is currently active. */
  active: boolean;
  /** Id of the active tree, or `null` when inactive. */
  treeId: string | null;
  /** Id of the current node, or `null` when inactive. */
  nodeId: string | null;
  /**
   * Visible choices from the current choice node.
   * Empty when the current node is not a choice node.
   */
  choices: Array<{ text: string; index: number }>;
  /** Portion of the current text that has been revealed by the typewriter. */
  text: string;
  /** `true` once the typewriter has finished revealing the full text. */
  textDone: boolean;
}

// ---------------------------------------------------------------------------
// Notifications emitted by DialogueManager
// ---------------------------------------------------------------------------

/** Emitted when a dialogue session starts. */
export interface DialogueStartedParams {
  readonly treeId: string;
}

/**
 * Emitted whenever the active node changes.
 * The display layer should use this to reset its state (text, portrait, etc.).
 */
export interface DialogueNodeParams {
  readonly treeId: string;
  readonly nodeId: string;
  readonly nodeType: string;
  /** Resolved speaker name (empty string when absent). */
  readonly speaker: string;
  /** Resource key for the speaker portrait, or `undefined`. */
  readonly portrait: string | undefined;
}

/**
 * Emitted every fixed-update tick while text is being revealed.
 * Also emitted once with `done: true` when the full text is visible.
 */
export interface DialogueTextTickParams {
  readonly text: string;
  readonly done: boolean;
}

/** Emitted when a choice node becomes active. */
export interface DialogueChoicesParams {
  /** The filtered, visible choices. */
  readonly choices: ReadonlyArray<{ readonly text: string; readonly index: number }>;
}

/** Emitted when a dialogue session ends (naturally or forced). */
export interface DialogueEndedParams {
  readonly treeId: string;
}
