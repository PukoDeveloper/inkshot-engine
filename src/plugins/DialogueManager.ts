import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  DialogueShowTextParams,
  DialogueShowChoicesParams,
  DialogueAdvanceParams,
  DialogueChoiceParams,
  DialogueEndCommandParams,
  DialogueStateGetOutput,
  DialogueStartedParams,
  DialogueNodeParams,
  DialogueTextTickParams,
  DialogueChoicesParams,
  DialogueAdvancedParams,
  DialogueChoiceMadeParams,
  DialogueEndedParams,
} from '../types/dialogue.js';
import type { CoreUpdateParams } from '../types/rendering.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActiveSession {
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
  /** Visible choices (provided externally by the script system). */
  choices: Array<{ text: string; index: number }>;
  /** Speaker name. */
  speaker: string;
  /** Portrait resource key. */
  portrait: string | undefined;
}

// ---------------------------------------------------------------------------
// DialogueManager
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that drives the dialogue box display layer.
 *
 * This plugin is a **pure presentation renderer**: it handles the typewriter
 * effect, choice display, and player-input forwarding. All flow control
 * (branching, conditions, tree traversal) belongs to the script system, which
 * drives DialogueManager by sending commands.
 *
 * ### Command events (sent to DialogueManager)
 *
 * | Event                   | Description                                           |
 * |-------------------------|-------------------------------------------------------|
 * | `dialogue/show-text`    | Display a line of text (starts typewriter)            |
 * | `dialogue/show-choices` | Display a list of player choices                      |
 * | `dialogue/advance`      | Skip typewriter OR signal "ready for next" to script  |
 * | `dialogue/choice`       | Confirm a choice selection                            |
 * | `dialogue/end`          | End the current session                               |
 * | `dialogue/state:get`    | Query the current display state                       |
 *
 * ### Notifications emitted
 *
 * | Event                   | When                                                  |
 * |-------------------------|-------------------------------------------------------|
 * | `dialogue/started`      | Session opens (first show-text / show-choices call)   |
 * | `dialogue/node`         | A new text line begins (speaker / portrait changed)   |
 * | `dialogue/text:tick`    | Typewriter advances (and once when fully revealed)    |
 * | `dialogue/choices`      | Choice list becomes active                            |
 * | `dialogue/advanced`     | Player advanced when text was already done            |
 * | `dialogue/choice:made`  | Player confirmed a choice                             |
 * | `dialogue/ended`        | Session ends                                          |
 *
 * @example
 * ```ts
 * import { createEngine, DialogueManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({ plugins: [new DialogueManager()] });
 *
 * // Script system drives the box:
 * core.events.emitSync('dialogue/show-text', {
 *   text: 'Hello!',
 *   speaker: 'Alice',
 * });
 *
 * // Player presses advance → 'dialogue/advanced' fires → script shows next line
 * core.events.on('script', 'dialogue/advanced', () => {
 *   core.events.emitSync('dialogue/show-choices', {
 *     choices: [
 *       { text: 'Wave back', index: 0 },
 *       { text: 'Stay silent', index: 1 },
 *     ],
 *   });
 * });
 *
 * // Player picks choice → 'dialogue/choice:made' fires → script continues
 * core.events.on('script', 'dialogue/choice:made', ({ index }) => {
 *   core.events.emitSync('dialogue/end', {});
 * });
 * ```
 */
export class DialogueManager implements EnginePlugin {
  readonly namespace = 'dialogue';

  /** Characters per second used when `dialogue/show-text` does not override speed. */
  readonly defaultCharsPerSecond: number;

  private _core!: Core;
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

    events.on<DialogueShowTextParams>(this.namespace, 'dialogue/show-text', (params) => {
      if (!this._session) {
        this._openSession();
      }

      const text = this._resolveText(params.i18nKey, params.i18nArgs, params.text, '');
      const speaker = this._resolveText(params.speakerI18nKey, undefined, params.speaker, '');

      const s = this._session!;
      s.targetText    = text;
      s.charIndex     = 0;
      s.accumMs       = 0;
      s.textDone      = false;
      s.charsPerSecond = params.speed ?? this.defaultCharsPerSecond;
      s.choices       = [];
      s.speaker       = speaker;
      s.portrait      = params.portrait;

      events.emitSync<DialogueNodeParams>('dialogue/node', { speaker, portrait: params.portrait });
    });

    events.on<DialogueShowChoicesParams>(this.namespace, 'dialogue/show-choices', (params) => {
      if (!this._session) {
        this._openSession();
      }

      const s = this._session!;
      s.choices = [...params.choices];
      s.targetText = params.prompt ?? '';
      s.charIndex  = s.targetText.length;
      s.textDone   = true;
      s.accumMs    = 0;
      s.speaker    = '';
      s.portrait   = undefined;

      events.emitSync<DialogueChoicesParams>('dialogue/choices', {
        choices: s.choices,
      });
    });

    events.on<DialogueAdvanceParams>(this.namespace, 'dialogue/advance', () => {
      if (!this._session) return;
      if (!this._session.textDone) {
        // Skip typewriter — reveal full text immediately
        this._session.charIndex = this._session.targetText.length;
        this._session.textDone  = true;
        events.emitSync<DialogueTextTickParams>('dialogue/text:tick', {
          text: this._session.targetText,
          done: true,
        });
        return;
      }
      // Text already done — notify the script system to decide what comes next
      events.emitSync<DialogueAdvancedParams>('dialogue/advanced', {});
    });

    events.on<DialogueChoiceParams>(this.namespace, 'dialogue/choice', (params) => {
      if (!this._session) return;
      const choice = this._session.choices[params.index];
      if (!choice) {
        console.warn(`[DialogueManager] dialogue/choice: index ${params.index} is out of range.`);
        return;
      }
      events.emitSync<DialogueChoiceMadeParams>('dialogue/choice:made', { index: params.index });
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
          output.active   = false;
          output.choices  = [];
          output.text     = '';
          output.textDone = true;
        } else {
          output.active   = true;
          output.choices  = [...this._session.choices];
          output.text     = this._session.targetText.slice(0, this._session.charIndex);
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
      const newChars  = Math.floor(s.accumMs / msPerChar);
      if (newChars <= 0) return;

      s.accumMs  -= newChars * msPerChar;
      s.charIndex = Math.min(s.charIndex + newChars, s.targetText.length);
      s.textDone  = s.charIndex >= s.targetText.length;

      events.emitSync<DialogueTextTickParams>('dialogue/text:tick', {
        text: s.targetText.slice(0, s.charIndex),
        done: s.textDone,
      });
    });
  }

  destroy(core: Core): void {
    this._session = null;
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** `true` when a dialogue session is currently active. */
  get isActive(): boolean {
    return this._session !== null;
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

  /** Open a new session and emit `dialogue/started`. */
  private _openSession(): void {
    this._session = {
      targetText:    '',
      charIndex:     0,
      charsPerSecond: this.defaultCharsPerSecond,
      accumMs:       0,
      textDone:      true,
      choices:       [],
      speaker:       '',
      portrait:      undefined,
    };
    this._core.events.emitSync<DialogueStartedParams>('dialogue/started', {});
  }

  /** End the current session and emit `dialogue/ended`. */
  private _endSession(): void {
    if (!this._session) return;
    this._session = null;
    this._core.events.emitSync<DialogueEndedParams>('dialogue/ended', {});
  }
}

