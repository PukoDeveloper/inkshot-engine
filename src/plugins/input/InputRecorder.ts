import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  InputRecordEntry,
  InputRecording,
  InputRecorderStartParams,
  InputRecorderStopOutput,
  InputRecorderPlayParams,
  InputRecorderPauseParams,
  InputRecorderResumeParams,
  InputRecorderSaveParams,
  InputRecorderLoadParams,
  InputRecorderLoadOutput,
  InputRecorderStateOutput,
  InputRecorderPlaybackEndParams,
} from '../../types/input.js';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * All `input/*` event names that the recorder observes during recording.
 * This list explicitly enumerates every push event emitted by `InputManager`
 * so the recorder does not accidentally capture its own injected events
 * during playback (which would cause an infinite loop).
 */
const RECORDED_EVENTS: readonly string[] = [
  'input/key:down',
  'input/key:up',
  'input/pointer:down',
  'input/pointer:up',
  'input/pointer:move',
  'input/touch:start',
  'input/touch:end',
  'input/touch:move',
  'input/gesture:pinch',
  'input/gesture:rotate',
  'input/gesture:swipe',
  'input/action:triggered',
  'input/gamepad:button:down',
  'input/gamepad:button:up',
  'input/gamepad:axes',
  'input/gamepad:connected',
  'input/gamepad:disconnected',
];

/** Key prefix used in the global save area for persisted recordings. */
const SAVE_KEY_PREFIX = 'inputRecording/';

// ---------------------------------------------------------------------------
// InputRecorder plugin
// ---------------------------------------------------------------------------

/**
 * Plugin that records all `input/*` events frame-by-frame and can replay
 * them, effectively re-injecting the original input sequence into the engine.
 *
 * ### Namespace
 * `'input-recorder'`
 *
 * ### Recording
 * ```ts
 * core.events.emitSync('input/recorder:start', {});
 * // ... play the game ...
 * const { output } = core.events.emitSync<{}, InputRecorderStopOutput>(
 *   'input/recorder:stop', {},
 * );
 * const recording = output.recording; // InputRecording | null
 * ```
 *
 * ### Playback
 * ```ts
 * core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', {
 *   recording,
 *   loop: false,
 * });
 * ```
 *
 * ### Persistence (requires SaveManager)
 * ```ts
 * // Save
 * core.events.emitSync('input/recorder:save', {
 *   slotId: 'demo-run-1',
 *   recording,
 * });
 *
 * // Load
 * const { output } = core.events.emitSync<InputRecorderLoadParams, InputRecorderLoadOutput>(
 *   'input/recorder:load',
 *   { slotId: 'demo-run-1' },
 * );
 * if (output.recording) { ... }
 * ```
 *
 * ### Pull query
 * ```ts
 * const { output } = core.events.emitSync<{}, InputRecorderStateOutput>(
 *   'input/recorder:state', {},
 * );
 * console.log(output.state, output.frame);
 * ```
 */
export class InputRecorder implements EnginePlugin {
  readonly namespace = 'input-recorder';

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  private _state: 'idle' | 'recording' | 'playing' | 'paused' = 'idle';

  /** Current engine-frame counter (incremented on every `core/tick`). */
  private _engineFrame = 0;

  // ── Recording ──────────────────────────────────────────────────────────

  /** Entries captured during an active recording. */
  private _capturedEntries: InputRecordEntry[] = [];

  /** Frame at which the current recording began. */
  private _recordingStartFrame = 0;

  /** Timestamp (ms) when `input/recorder:start` was called. */
  private _recordingStartedAt = 0;

  /** Unregister functions for per-event spy listeners (active during recording). */
  private readonly _recordingUnsubscribers: Array<() => void> = [];

  // ── Playback ───────────────────────────────────────────────────────────

  /** The recording currently being played back. */
  private _playbackRecording: InputRecording | null = null;

  /** Frame index within the recording for the current playback position. */
  private _playbackFrame = 0;

  /** Index into `_playbackRecording.entries` for efficient sequential reads. */
  private _playbackEntryIndex = 0;

  /** Whether to loop the playback when it reaches the end. */
  private _playbackLoop = false;

  // ── Core reference ─────────────────────────────────────────────────────

  private _core: Core | null = null;

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    // ── Frame counter ─────────────────────────────────────────────────────
    events.on(this.namespace, 'core/tick', () => {
      this._engineFrame++;

      // Advance playback by one frame.
      if (this._state === 'playing' && this._playbackRecording) {
        this._replayFrame(core);
      }
    });

    // ── Pull query ────────────────────────────────────────────────────────
    events.on<Record<string, never>, InputRecorderStateOutput>(
      this.namespace,
      'input/recorder:state',
      (_params, output) => {
        output.state = this._state;
        output.frame =
          this._state === 'recording'
            ? this._engineFrame - this._recordingStartFrame
            : this._playbackFrame;
      },
    );

    // ── Start recording ───────────────────────────────────────────────────
    events.on<InputRecorderStartParams>(
      this.namespace,
      'input/recorder:start',
      () => {
        this._startRecording(core);
      },
    );

    // ── Stop recording / playback ─────────────────────────────────────────
    events.on<Record<string, never>, InputRecorderStopOutput>(
      this.namespace,
      'input/recorder:stop',
      (_params, output) => {
        output.recording = this._stop(core);
      },
    );

    // ── Playback ──────────────────────────────────────────────────────────
    events.on<InputRecorderPlayParams>(
      this.namespace,
      'input/recorder:play',
      (params) => {
        this._startPlayback(params.recording, params.loop ?? false);
      },
    );

    // ── Pause / resume ────────────────────────────────────────────────────
    events.on<InputRecorderPauseParams>(
      this.namespace,
      'input/recorder:pause',
      () => {
        if (this._state === 'playing') this._state = 'paused';
      },
    );

    events.on<InputRecorderResumeParams>(
      this.namespace,
      'input/recorder:resume',
      () => {
        if (this._state === 'paused') this._state = 'playing';
      },
    );

    // ── Persistence ───────────────────────────────────────────────────────
    events.on<InputRecorderSaveParams>(
      this.namespace,
      'input/recorder:save',
      (params) => {
        this._saveRecording(core, params);
      },
    );

    events.on<InputRecorderLoadParams, InputRecorderLoadOutput>(
      this.namespace,
      'input/recorder:load',
      (params, output) => {
        output.recording = this._loadRecording(core, params.slotId);
      },
    );
  }

  destroy(core: Core): void {
    // Stop any active recording/playback.
    this._stop(core);

    core.events.removeNamespace(this.namespace);
    this._engineFrame = 0;
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Begin a new recording, subscribing to all input events via the EventBus.
   * Any in-progress recording or playback is stopped first.
   */
  private _startRecording(core: Core): void {
    this._stop(core); // clean up any prior state

    this._state = 'recording';
    this._capturedEntries = [];
    this._recordingStartFrame = this._engineFrame;
    this._recordingStartedAt = Date.now();

    // Subscribe to each observable input event.
    for (const eventName of RECORDED_EVENTS) {
      const unsubscribe = core.events.on(
        this.namespace,
        eventName,
        (params: unknown) => {
          if (this._state !== 'recording') return;
          this._capturedEntries.push({
            frame: this._engineFrame - this._recordingStartFrame,
            event: eventName,
            params: this._deepClone(params),
          });
        },
        // Use 'after' phase so we capture only the final, settled state.
        { phase: 'after' },
      );
      this._recordingUnsubscribers.push(unsubscribe);
    }
  }

  /**
   * Stop an active recording and return the completed `InputRecording`.
   * Also stops playback if active.  Returns `null` if nothing was running.
   */
  private _stop(core: Core): InputRecording | null {
    if (this._state === 'recording') {
      // Unsubscribe all per-event listeners.
      for (const unsub of this._recordingUnsubscribers) unsub();
      this._recordingUnsubscribers.length = 0;

      const recording: InputRecording = {
        version: 1,
        entries: this._capturedEntries,
        frameCount: this._engineFrame - this._recordingStartFrame,
        createdAt: this._recordingStartedAt,
      };

      this._capturedEntries = [];
      this._state = 'idle';
      return recording;
    }

    if (this._state === 'playing' || this._state === 'paused') {
      const rec = this._playbackRecording;
      this._playbackRecording = null;
      this._playbackFrame = 0;
      this._playbackEntryIndex = 0;
      this._state = 'idle';

      if (rec) {
        core.events.emitSync<InputRecorderPlaybackEndParams, Record<string, never>>(
          'input/recorder:playback:end',
          { recording: rec },
        );
      }
      return null;
    }

    return null;
  }

  /**
   * Begin replaying a recording from frame 0.
   */
  private _startPlayback(recording: InputRecording, loop: boolean): void {
    if (this._core) this._stop(this._core);

    this._playbackRecording = recording;
    this._playbackFrame = 0;
    this._playbackEntryIndex = 0;
    this._playbackLoop = loop;
    this._state = 'playing';
  }

  /**
   * Emit all recorded events for the current playback frame, then advance
   * the frame counter.  Handles loop/end-of-recording transitions.
   */
  private _replayFrame(core: Core): void {
    const rec = this._playbackRecording;
    if (!rec) return;

    const frame = this._playbackFrame;

    // Emit all entries that belong to the current frame.
    while (
      this._playbackEntryIndex < rec.entries.length &&
      rec.entries[this._playbackEntryIndex]!.frame === frame
    ) {
      const entry = rec.entries[this._playbackEntryIndex]!;
      core.events.emitSync(entry.event, entry.params as Record<string, unknown>);
      this._playbackEntryIndex++;
    }

    this._playbackFrame++;

    // Check for end of recording.
    if (this._playbackFrame > rec.frameCount) {
      if (this._playbackLoop) {
        this._playbackFrame = 0;
        this._playbackEntryIndex = 0;
      } else {
        this._playbackRecording = null;
        this._state = 'idle';
        core.events.emitSync<InputRecorderPlaybackEndParams, Record<string, never>>(
          'input/recorder:playback:end',
          { recording: rec },
        );
      }
    }
  }

  /**
   * Persist a recording into the global save area via `save/global:set`.
   * Silently does nothing if `SaveManager` is not installed.
   */
  private _saveRecording(core: Core, params: InputRecorderSaveParams): void {
    const key = `${SAVE_KEY_PREFIX}${params.slotId}`;
    try {
      core.events.emitSync('save/global:set', {
        key,
        value: JSON.stringify(params.recording),
      });
    } catch {
      // SaveManager not installed — ignore.
    }
  }

  /**
   * Load a recording from the global save area via `save/global:get`.
   * Returns `null` if not found or if `SaveManager` is not installed.
   */
  private _loadRecording(core: Core, slotId: string): InputRecording | null {
    const key = `${SAVE_KEY_PREFIX}${slotId}`;
    try {
      const { output } = core.events.emitSync<
        { key: string },
        { value?: unknown }
      >('save/global:get', { key });

      if (typeof output.value !== 'string') return null;
      const parsed: unknown = JSON.parse(output.value);
      if (!this._isValidRecording(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Minimal runtime validation of an `InputRecording` loaded from storage.
   */
  private _isValidRecording(data: unknown): data is InputRecording {
    if (typeof data !== 'object' || data === null) return false;
    const rec = data as Record<string, unknown>;
    return (
      rec['version'] === 1 &&
      Array.isArray(rec['entries']) &&
      typeof rec['frameCount'] === 'number' &&
      typeof rec['createdAt'] === 'number'
    );
  }

  /**
   * Deep-clone a params object so recorded data is immutable and independent
   * of the original event params (which may be mutated by later handlers).
   */
  private _deepClone<T>(value: T): T {
    // For plain objects/arrays use JSON round-trip (handles all event params
    // which contain only serialisable primitives).
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }
}
