import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  DialogueTree,
  DialogueNode,
  DialogueCondition,
  DialogueChoice,
  DialogueRegisterParams,
  DialogueStartParams,
  DialogueAdvanceParams,
  DialogueChoiceParams,
  DialogueEndCommandParams,
  DialogueStateGetOutput,
  DialogueStartedParams,
  DialogueNodeParams,
  DialogueTextTickParams,
  DialogueChoicesParams,
  DialogueEndedParams,
} from '../types/dialogue.js';
import type { CoreUpdateParams } from '../types/rendering.js';
import type { GameStateGetOutput } from '../types/game.js';
import type { SaveGlobalGetOutput } from '../types/save.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActiveSession {
  treeId: string;
  tree: DialogueTree;
  nodeId: string;
  /** Fully-resolved text for the current text node. */
  targetText: string;
  /** Number of characters currently revealed by the typewriter. */
  charIndex: number;
  /** Characters per second for the typewriter animation. */
  charsPerSecond: number;
  /** Accumulated time (ms) not yet consumed by the typewriter. */
  accumMs: number;
  /** Whether the current text is fully revealed. */
  textDone: boolean;
  /** Visible choices for the current choice node. */
  choices: Array<{ text: string; index: number }>;
  /** Speaker name for the current text node. */
  speaker: string;
  /** Portrait resource key for the current text node. */
  portrait: string | undefined;
}

// ---------------------------------------------------------------------------
// DialogueManager
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that drives a node-based dialogue / cutscene system.
 *
 * ### Node types
 *
 * | Type        | Behaviour                                                       |
 * |-------------|------------------------------------------------------------------|
 * | `text`      | Shows a line of text with an optional typewriter effect          |
 * | `choice`    | Presents a filtered list of player choices                       |
 * | `condition` | Evaluates a condition and branches to `then` or `else`           |
 * | `jump`      | Unconditionally jumps to another node                            |
 * | `end`       | Terminates the dialogue session                                  |
 *
 * ### EventBus API
 *
 * | Event                  | Description                                          |
 * |------------------------|------------------------------------------------------|
 * | `dialogue/register`    | Register (or replace) a dialogue tree                |
 * | `dialogue/start`       | Start a registered tree                              |
 * | `dialogue/advance`     | Advance / skip typewriter → move to next node        |
 * | `dialogue/choice`      | Select a visible choice by index                     |
 * | `dialogue/end`         | Force-end the current session                        |
 * | `dialogue/state:get`   | Query the current session state                      |
 *
 * ### Notifications emitted
 *
 * | Event                  | When                                                 |
 * |------------------------|------------------------------------------------------|
 * | `dialogue/started`     | Session begins                                       |
 * | `dialogue/node`        | Active node changes                                  |
 * | `dialogue/text:tick`   | Typewriter advances (and once when fully revealed)   |
 * | `dialogue/choices`     | A choice node becomes active                         |
 * | `dialogue/ended`       | Session ends                                         |
 *
 * @example
 * ```ts
 * import { createEngine, DialogueManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({ plugins: [new DialogueManager()] });
 *
 * core.events.emitSync('dialogue/register', {
 *   treeId: 'intro',
 *   tree: {
 *     entry: 'n1',
 *     nodes: {
 *       n1: { id: 'n1', type: 'text', speaker: 'Alice', text: 'Hello!', next: 'n2' },
 *       n2: { id: 'n2', type: 'end' },
 *     },
 *   },
 * });
 *
 * core.events.emitSync('dialogue/start', { treeId: 'intro' });
 * ```
 */
export class DialogueManager implements EnginePlugin {
  readonly namespace = 'dialogue';

  /** Characters per second used when a text node does not override speed. */
  readonly defaultCharsPerSecond: number;

  private _core!: Core;
  private readonly _trees = new Map<string, DialogueTree>();
  private _session: ActiveSession | null = null;

  constructor(options: { defaultCharsPerSecond?: number } = {}) {
    this.defaultCharsPerSecond = options.defaultCharsPerSecond ?? 40;
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    events.on<DialogueRegisterParams>(this.namespace, 'dialogue/register', (params) => {
      if (this._trees.has(params.treeId)) {
        console.warn(`[DialogueManager] Replacing existing tree "${params.treeId}".`);
      }
      this._trees.set(params.treeId, params.tree);
    });

    events.on<DialogueStartParams>(this.namespace, 'dialogue/start', (params) => {
      const tree = this._trees.get(params.treeId);
      if (!tree) {
        console.warn(`[DialogueManager] dialogue/start: tree "${params.treeId}" is not registered.`);
        return;
      }
      if (this._session) {
        this._endSession();
      }
      this._session = {
        treeId: params.treeId,
        tree,
        nodeId: '',
        targetText: '',
        charIndex: 0,
        charsPerSecond: this.defaultCharsPerSecond,
        accumMs: 0,
        textDone: true,
        choices: [],
        speaker: '',
        portrait: undefined,
      };
      events.emitSync<DialogueStartedParams>('dialogue/started', { treeId: params.treeId });
      this._enterNode(tree.entry);
    });

    events.on<DialogueAdvanceParams>(this.namespace, 'dialogue/advance', () => {
      if (!this._session) return;
      if (!this._session.textDone) {
        // Skip typewriter — reveal full text immediately
        this._session.charIndex = this._session.targetText.length;
        this._session.textDone = true;
        events.emitSync<DialogueTextTickParams>('dialogue/text:tick', {
          text: this._session.targetText,
          done: true,
        });
        return;
      }
      // Text is already done — advance to next node (only valid for text nodes)
      const node = this._session.tree.nodes[this._session.nodeId];
      if (node?.type === 'text') {
        if (node.next) {
          this._enterNode(node.next);
        } else {
          this._endSession();
        }
      }
    });

    events.on<DialogueChoiceParams>(this.namespace, 'dialogue/choice', (params) => {
      if (!this._session) return;
      const choice = this._session.choices[params.index];
      if (!choice) {
        console.warn(`[DialogueManager] dialogue/choice: index ${params.index} is out of range.`);
        return;
      }
      // Find the original choice node to get the `next` target
      const node = this._session.tree.nodes[this._session.nodeId];
      if (node?.type !== 'choice') {
        console.warn('[DialogueManager] dialogue/choice: current node is not a choice node.');
        return;
      }
      // Map visible-choice index back to original choice next target
      const visibleChoices = this._buildVisibleChoices(node.choices);
      const selected = visibleChoices[params.index];
      if (!selected) return;
      this._enterNode(selected.next);
    });

    events.on<DialogueEndCommandParams>(this.namespace, 'dialogue/end', () => {
      if (this._session) {
        this._endSession();
      }
    });

    events.on<Record<string, never>, DialogueStateGetOutput>(
      this.namespace,
      'dialogue/state:get',
      (_params, output) => {
        if (!this._session) {
          output.active = false;
          output.treeId = null;
          output.nodeId = null;
          output.choices = [];
          output.text = '';
          output.textDone = true;
        } else {
          output.active = true;
          output.treeId = this._session.treeId;
          output.nodeId = this._session.nodeId;
          output.choices = [...this._session.choices];
          output.text = this._session.targetText.slice(0, this._session.charIndex);
          output.textDone = this._session.textDone;
        }
      },
    );

    // Drive the typewriter animation
    events.on<CoreUpdateParams>(this.namespace, 'core/update', (params) => {
      const s = this._session;
      if (!s || s.textDone) return;

      s.accumMs += params.dt;
      const msPerChar = 1000 / s.charsPerSecond;
      const newChars = Math.floor(s.accumMs / msPerChar);
      if (newChars <= 0) return;

      s.accumMs -= newChars * msPerChar;
      s.charIndex = Math.min(s.charIndex + newChars, s.targetText.length);
      s.textDone = s.charIndex >= s.targetText.length;

      events.emitSync<DialogueTextTickParams>('dialogue/text:tick', {
        text: s.targetText.slice(0, s.charIndex),
        done: s.textDone,
      });
    });
  }

  destroy(core: Core): void {
    this._session = null;
    this._trees.clear();
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** `true` when a dialogue session is currently active. */
  get isActive(): boolean {
    return this._session !== null;
  }

  /** Returns the number of registered dialogue trees. */
  get treeCount(): number {
    return this._trees.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve a text string: use the i18n key when present, otherwise fall back
   * to the raw string, and finally to `fallback`.
   */
  private _resolveText(
    i18nKey: string | undefined,
    i18nArgs: Record<string, string> | undefined,
    raw: string | undefined,
    fallback: string,
  ): string {
    if (i18nKey) {
      const { output } = this._core.events.emitSync<
        { key: string; args?: Record<string, string> },
        { value: string }
      >('i18n/t', { key: i18nKey, args: i18nArgs });
      return output.value ?? i18nKey;
    }
    return raw ?? fallback;
  }

  /**
   * Build the list of visible choices from a raw choices array,
   * evaluating any attached conditions.
   */
  private _buildVisibleChoices(
    choices: ReadonlyArray<DialogueChoice>,
  ): Array<{ text: string; index: number; next: string }> {
    const result: Array<{ text: string; index: number; next: string }> = [];
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]!;
      if (c.condition && !this._evalCondition(c.condition)) continue;
      const text = this._resolveText(c.i18nKey, c.i18nArgs, c.text, `Choice ${i}`);
      result.push({ text, index: result.length, next: c.next });
    }
    return result;
  }

  /** Enter a node by id, recursively handling logic nodes. */
  private _enterNode(nodeId: string): void {
    const s = this._session;
    if (!s) return;

    const node = s.tree.nodes[nodeId];
    if (!node) {
      console.warn(`[DialogueManager] Node "${nodeId}" not found in tree "${s.treeId}". Ending dialogue.`);
      this._endSession();
      return;
    }

    s.nodeId = nodeId;

    switch (node.type) {
      case 'text': {
        const text = this._resolveText(node.i18nKey, node.i18nArgs, node.text, '');
        const speaker = this._resolveText(node.speakerI18nKey, undefined, node.speaker, '');
        s.targetText = text;
        s.charIndex = 0;
        s.accumMs = 0;
        s.textDone = false;
        s.charsPerSecond = node.speed ?? this.defaultCharsPerSecond;
        s.choices = [];
        s.speaker = speaker;
        s.portrait = node.portrait;

        this._core.events.emitSync<DialogueNodeParams>('dialogue/node', {
          treeId: s.treeId,
          nodeId,
          nodeType: 'text',
          speaker,
          portrait: node.portrait,
        });
        break;
      }

      case 'choice': {
        const promptText = this._resolveText(node.i18nKey, node.i18nArgs, node.text, '');
        const visibleChoices = this._buildVisibleChoices(node.choices);

        s.targetText = promptText;
        s.charIndex = promptText.length;
        s.textDone = true;
        s.accumMs = 0;
        s.choices = visibleChoices.map(c => ({ text: c.text, index: c.index }));
        s.speaker = '';
        s.portrait = undefined;

        this._core.events.emitSync<DialogueNodeParams>('dialogue/node', {
          treeId: s.treeId,
          nodeId,
          nodeType: 'choice',
          speaker: '',
          portrait: undefined,
        });
        this._core.events.emitSync<DialogueChoicesParams>('dialogue/choices', {
          choices: visibleChoices,
        });
        break;
      }

      case 'condition': {
        const result = this._evalCondition(node.condition);
        if (result) {
          this._enterNode(node.then);
        } else if (node.else) {
          this._enterNode(node.else);
        } else {
          this._endSession();
        }
        break;
      }

      case 'jump': {
        this._enterNode(node.target);
        break;
      }

      case 'end': {
        this._endSession();
        break;
      }

      default: {
        // Exhaustiveness guard
        const _never: never = node;
        void _never;
        this._endSession();
      }
    }
  }

  /** Evaluate a condition synchronously via the event bus. */
  private _evalCondition(condition: DialogueCondition): boolean {
    switch (condition.type) {
      case 'game-state': {
        const { output } = this._core.events.emitSync<Record<string, never>, GameStateGetOutput>(
          'game/state:get',
          {},
        );
        return output.state === condition.state;
      }

      case 'save-flag': {
        const { output } = this._core.events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
          'save/global:get',
          {},
        );
        const stored = output?.data?.data?.[condition.key];
        if (condition.value !== undefined) {
          return stored === condition.value;
        }
        return stored !== undefined && stored !== null && stored !== false;
      }

      case 'not':
        return !this._evalCondition(condition.condition);

      case 'and':
        return condition.conditions.every(c => this._evalCondition(c));

      case 'or':
        return condition.conditions.some(c => this._evalCondition(c));

      default: {
        const _never: never = condition;
        void _never;
        return false;
      }
    }
  }

  /** End the current session and emit `dialogue/ended`. */
  private _endSession(): void {
    if (!this._session) return;
    const { treeId } = this._session;
    this._session = null;
    this._core.events.emitSync<DialogueEndedParams>('dialogue/ended', { treeId });
  }
}
