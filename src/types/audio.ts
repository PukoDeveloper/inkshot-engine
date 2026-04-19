// ---------------------------------------------------------------------------
// audio/load
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/load`.
 *
 * Fetches an audio file, decodes it with the Web Audio API, and caches the
 * resulting `AudioBuffer` under the provided `key` alias.
 * Calling `audio/load` a second time with the same `key` silently overwrites
 * the previous buffer.
 *
 * @example
 * ```ts
 * await core.events.emit<AudioLoadParams, AudioLoadOutput>('audio/load', {
 *   key: 'bgm:town',
 *   url: 'audio/town.ogg',
 * });
 * ```
 */
export interface AudioLoadParams {
  /** Alias used to reference this audio clip in all subsequent events. */
  readonly key: string;
  /**
   * Path or URL of the audio file to fetch.
   * Relative paths are resolved against `dataRoot`; absolute URLs and
   * root-anchored paths (`/assets/…`) are forwarded unchanged.
   */
  readonly url: string;
}

/** Output for `audio/load`. */
export interface AudioLoadOutput {
  /** `true` when the buffer was decoded and cached successfully. */
  loaded: boolean;
  /** Duration of the decoded audio clip in seconds; `0` if loading failed. */
  duration: number;
}

// ---------------------------------------------------------------------------
// audio/play
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/play`.
 *
 * Starts playback of a previously loaded audio clip.  The call is
 * synchronous — a new `AudioBufferSourceNode` is created and started
 * immediately.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
 *   'audio/play',
 *   { key: 'bgm:town', loop: true, volume: 0.8 },
 * );
 * console.log(output.instanceId); // e.g. "audio_1"
 * ```
 */
export interface AudioPlayParams {
  /** Key of the audio clip to play (must be loaded via `audio/load` first). */
  readonly key: string;
  /** When `true`, the clip loops indefinitely until stopped. Default: `false`. */
  readonly loop?: boolean;
  /** Per-instance volume multiplier (0..1). Default: `1`. */
  readonly volume?: number;
  /**
   * Optional caller-supplied identifier for this playback instance.
   * If omitted, a unique identifier is generated automatically.
   * Using a stable ID (e.g. `'bgm'`) makes it easy to stop or pause
   * a specific stream later without tracking the generated ID.
   */
  readonly instanceId?: string;
  /**
   * Fade-in duration in seconds.  When provided, playback begins at gain `0`
   * and ramps linearly to `volume` (or `1`) over this many seconds.
   * Omit or set to `0` for an instant start.
   */
  readonly fadeIn?: number;
}

/** Output for `audio/play`. */
export interface AudioPlayOutput {
  /**
   * Unique identifier for this playback instance.
   * Pass this to `audio/stop`, `audio/pause`, `audio/resume`,
   * `audio/volume`, and `audio/state` to target this specific sound.
   */
  instanceId: string;
}

// ---------------------------------------------------------------------------
// audio/stop
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/stop`.
 *
 * Stops and removes one or more playback instances.
 *
 * - Provide `instanceId` to stop a single instance.
 * - Provide `key` to stop **all** currently-playing instances of that clip.
 * - At least one of `instanceId` or `key` must be provided.
 *
 * @example
 * ```ts
 * // Stop a specific instance
 * core.events.emitSync('audio/stop', { instanceId: output.instanceId });
 *
 * // Stop all instances of a clip (e.g. all SFX hits)
 * core.events.emitSync('audio/stop', { key: 'sfx:hit' });
 * ```
 */
export interface AudioStopParams {
  /** Stop this specific playback instance. */
  readonly instanceId?: string;
  /** Stop every playing instance that uses this clip key. */
  readonly key?: string;
}

// ---------------------------------------------------------------------------
// audio/pause
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/pause`.
 *
 * Pauses a playing instance and preserves the current playback position so
 * it can be resumed later with `audio/resume`.
 * Has no effect if the instance is already paused or stopped.
 *
 * @example
 * ```ts
 * core.events.emitSync('audio/pause', { instanceId: 'bgm' });
 * ```
 */
export interface AudioPauseParams {
  /** Identifier of the playback instance to pause. */
  readonly instanceId: string;
}

// ---------------------------------------------------------------------------
// audio/resume
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/resume`.
 *
 * Resumes a paused instance from the position where it was paused.
 * Has no effect if the instance is not in the paused state.
 *
 * @example
 * ```ts
 * core.events.emitSync('audio/resume', { instanceId: 'bgm' });
 * ```
 */
export interface AudioResumeParams {
  /** Identifier of the playback instance to resume. */
  readonly instanceId: string;
}

// ---------------------------------------------------------------------------
// audio/volume
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/volume`.
 *
 * Adjusts gain for a specific instance or, when `instanceId` is omitted,
 * for the master output (affects all currently-playing sounds and all future
 * playbacks).
 *
 * @example
 * ```ts
 * // Set master volume to 50 %
 * core.events.emitSync('audio/volume', { volume: 0.5 });
 *
 * // Fade a specific music track without affecting SFX
 * core.events.emitSync('audio/volume', { instanceId: 'bgm', volume: 0.2 });
 * ```
 */
export interface AudioVolumeParams {
  /**
   * Target volume in the range `0` (silent) to `1` (full).
   * Values outside this range are clamped by the Web Audio API.
   */
  readonly volume: number;
  /**
   * When provided, only this instance is affected.
   * When omitted, the master gain is updated.
   */
  readonly instanceId?: string;
  /**
   * Fade duration in seconds.  When provided and greater than `0`, the gain
   * ramps linearly from its current value to `volume` over this many seconds.
   * Omit or set to `0` for an instant change (default behaviour).
   */
  readonly duration?: number;
}

// ---------------------------------------------------------------------------
// audio/fade-stop
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/fade-stop`.
 *
 * Fades the gain of a specific playback instance to `0` over `duration`
 * seconds, then stops and removes the instance automatically.
 *
 * This is the idiomatic way to fade out a BGM track before a scene
 * transition — no manual polling or timers required.
 *
 * @example
 * ```ts
 * // Fade the music out over 2 seconds, then release it.
 * core.events.emitSync('audio/fade-stop', { instanceId: 'bgm', duration: 2 });
 * ```
 */
export interface AudioFadeStopParams {
  /** Identifier of the playback instance to fade out and stop. */
  readonly instanceId: string;
  /** Duration of the fade-out in seconds. Must be greater than `0`. */
  readonly duration: number;
}

// ---------------------------------------------------------------------------
// audio/unload
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/unload`.
 *
 * Removes a decoded `AudioBuffer` from the cache to free memory.
 * Any instances currently using the buffer continue to play to completion;
 * only future `audio/play` calls for the same key are affected.
 *
 * @example
 * ```ts
 * core.events.emitSync('audio/unload', { key: 'bgm:intro' });
 * ```
 */
export interface AudioUnloadParams {
  /** Key of the audio clip to remove from cache. */
  readonly key: string;
}

/** Output for `audio/unload`. */
export interface AudioUnloadOutput {
  /** `true` when the key existed and was removed; `false` if it was not cached. */
  unloaded: boolean;
}

// ---------------------------------------------------------------------------
// audio/state  (Pull query)
// ---------------------------------------------------------------------------

/**
 * Parameters for `audio/state`.
 *
 * Synchronous pull query — use `core.events.emitSync` to inspect the current
 * state of a playback instance without subscribing to events.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<AudioStateParams, AudioStateOutput>(
 *   'audio/state',
 *   { instanceId: 'bgm' },
 * );
 * console.log(output.state, output.currentTime);
 * ```
 */
export interface AudioStateParams {
  /** Identifier of the playback instance to inspect. */
  readonly instanceId: string;
}

/** Output for `audio/state`. */
export interface AudioStateOutput {
  /**
   * Current lifecycle state of the instance:
   * - `'playing'`   — currently producing audio output.
   * - `'paused'`    — stopped mid-playback; can be resumed.
   * - `'stopped'`   — finished or manually stopped; cannot be resumed.
   * - `'not-found'` — no instance with the given ID exists.
   */
  state: 'playing' | 'paused' | 'stopped' | 'not-found';
  /**
   * Playback position in seconds at the time of the query.
   * `0` for `'not-found'` instances.
   */
  currentTime: number;
}
