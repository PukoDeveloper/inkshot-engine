import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
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
} from '../../types/dialogue.js';
import type { CoreUpdateParams } from '../../types/rendering.js';
import {
  parseDialogueMarkup,
  buildTextSegments,
  getSpeedAtIndex,
  type ParsedMarkup,
} from './DialogueMarkupParser.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActiveSession {
  /** Plain (tag-stripped) text for the current line. */
  targetText: string;
  /** Parsed markup metadata (colour spans, speed spans, pauses). */
  parsed: ParsedMarkup;
  /** Number of characters currently revealed by the typewriter. */
  charIndex: number;
  /** Default characters per second (overridden per-character by speed spans). */
  charsPerSecond: number;
  /** Accumulated time (ms) not yet consumed by the typewriter. */
  accumMs: number;
  /** Whether the current text is fully revealed. */
  textDone: boolean;
  /** Remaining pause duration (ms) before the typewriter resumes. */
  pauseRemainingMs: number;
  /** Index into `parsed.pauses` – avoids re-scanning already-consumed pauses. */
  nextPauseIdx: number;
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
  readonly editorMeta = {
    displayName: 'Dialogue Manager',
    icon: 'dialogue',
    description: 'Drives rich typewriter-style dialogue sessions with choices and markup.',
    events: [
      'dialogue/show-text', 'dialogue/show-choices', 'dialogue/advance',
      'dialogue/choice', 'dialogue/end', 'dialogue/state:get',
    ] as const,
    schemas: {
      dialogue: {
        folder: 'dialogues',
        displayName: 'Dialogue Script',
      },
    },
  };

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

      const rawText = this._resolveText(params.i18nKey, params.i18nArgs, params.text, '');
      const parsed  = parseDialogueMarkup(rawText);
      const speaker = this._resolveText(params.speakerI18nKey, undefined, params.speaker, '');

      const s = this._session!;
      s.targetText      = parsed.plain;
      s.parsed          = parsed;
      s.charIndex       = 0;
      s.accumMs         = 0;
      s.textDone        = false;
      s.charsPerSecond  = params.speed ?? this.defaultCharsPerSecond;
      s.pauseRemainingMs = 0;
      s.nextPauseIdx    = 0;
      s.choices         = [];
      s.speaker         = speaker;
      s.portrait        = params.portrait;

      events.emitSync<DialogueNodeParams>('dialogue/node', { speaker, portrait: params.portrait });
    });

    events.on<DialogueShowChoicesParams>(this.namespace, 'dialogue/show-choices', (params) => {
      if (!this._session) {
        this._openSession();
      }

      const s = this._session!;
      s.choices          = [...params.choices];
      s.targetText       = params.prompt ?? '';
      s.parsed           = parseDialogueMarkup(s.targetText);
      s.charIndex        = s.targetText.length;
      s.textDone         = true;
      s.accumMs          = 0;
      s.pauseRemainingMs = 0;
      s.nextPauseIdx     = 0;
      s.speaker          = '';
      s.portrait         = undefined;

      events.emitSync<DialogueNodeParams>('dialogue/node', { speaker: '', portrait: undefined });

      events.emitSync<DialogueChoicesParams>('dialogue/choices', {
        choices: s.choices,
      });
    });

    events.on<DialogueAdvanceParams>(this.namespace, 'dialogue/advance', () => {
      if (!this._session) return;
      if (!this._session.textDone) {
        // Skip typewriter — reveal full text immediately
        const s = this._session;
        s.charIndex        = s.targetText.length;
        s.textDone         = true;
        s.pauseRemainingMs = 0;
        const segments = buildTextSegments(s.targetText, s.charIndex, s.parsed.colorSpans);
        events.emitSync<DialogueTextTickParams>('dialogue/text:tick', {
          text: s.targetText,
          done: true,
          segments,
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

      const prevCharIndex = s.charIndex;
      let remainingMs = params.dt + s.accumMs;
      s.accumMs = 0;

      while (remainingMs > 0 && !s.textDone) {
        // Drain any active pause before advancing
        if (s.pauseRemainingMs > 0) {
          const drain = Math.min(remainingMs, s.pauseRemainingMs);
          s.pauseRemainingMs -= drain;
          remainingMs -= drain;
          continue;
        }

        // Already at end?
        if (s.charIndex >= s.targetText.length) {
          s.textDone = true;
          break;
        }

        // Time cost of the next character (may be overridden by a speed span)
        const speed    = getSpeedAtIndex(s.charIndex, s.parsed.speedSpans, s.charsPerSecond);
        const msPerChar = 1000 / speed;

        if (remainingMs < msPerChar) {
          s.accumMs = remainingMs;
          break;
        }

        remainingMs -= msPerChar;
        s.charIndex++;

        // Consume any pause that fires exactly at this charIndex
        while (
          s.nextPauseIdx < s.parsed.pauses.length &&
          s.parsed.pauses[s.nextPauseIdx]!.afterIndex <= s.charIndex
        ) {
          const p = s.parsed.pauses[s.nextPauseIdx]!;
          if (p.afterIndex === s.charIndex) {
            s.pauseRemainingMs = p.ms;
          }
          s.nextPauseIdx++;
        }

        if (s.charIndex >= s.targetText.length) {
          s.textDone = true;
        }
      }

      // Only emit a tick when the visible text actually changed
      if (s.charIndex === prevCharIndex && !s.textDone) return;

      const segments = buildTextSegments(s.targetText, s.charIndex, s.parsed.colorSpans);
      events.emitSync<DialogueTextTickParams>('dialogue/text:tick', {
        text: s.targetText.slice(0, s.charIndex),
        done: s.textDone,
        segments,
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
      return output.value ?? raw ?? fallback;
    }
    return raw ?? fallback;
  }

  /** Open a new session and emit `dialogue/started`. */
  private _openSession(): void {
    this._session = {
      targetText:       '',
      parsed:           { plain: '', colorSpans: [], speedSpans: [], pauses: [] },
      charIndex:        0,
      charsPerSecond:   this.defaultCharsPerSecond,
      accumMs:          0,
      textDone:         true,
      pauseRemainingMs: 0,
      nextPauseIdx:     0,
      choices:          [],
      speaker:          '',
      portrait:         undefined,
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

