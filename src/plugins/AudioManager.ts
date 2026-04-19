import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  AudioLoadParams,
  AudioLoadOutput,
  AudioPlayParams,
  AudioPlayOutput,
  AudioStopParams,
  AudioPauseParams,
  AudioResumeParams,
  AudioVolumeParams,
  AudioUnloadParams,
  AudioUnloadOutput,
  AudioStateParams,
  AudioStateOutput,
} from '../types/audio.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AudioInstance {
  readonly key: string;
  readonly gainNode: GainNode;
  /** Current (or most recently created) source node for this instance. */
  source: AudioBufferSourceNode;
  /**
   * `AudioContext.currentTime` at the moment the source last started.
   * Used to compute elapsed time for state queries and pause offsets.
   */
  startedAt: number;
  /**
   * Accumulated playback offset in seconds.
   * On first play this is `0`; after a pause/resume cycle it holds the
   * position from which playback restarted.
   */
  offset: number;
  /** Whether the clip should loop. */
  loop: boolean;
  /** Current lifecycle state of this instance. */
  state: 'playing' | 'paused' | 'stopped';
}

// ---------------------------------------------------------------------------
// AudioManager
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that provides audio playback via the browser-native
 * **Web Audio API**.  No external dependencies are required.
 *
 * An `AudioContext` is created lazily on the first `audio/play` or
 * `audio/load` call; this defers creation until after a user gesture, which
 * satisfies browser autoplay policies.
 *
 * ### Architecture notes
 * Each `audio/play` call produces one playback **instance** with its own
 * `GainNode` chained into a shared master `GainNode`.  This gives per-stream
 * volume control while still allowing a single master-volume adjustment.
 *
 * Pause / resume are simulated by stopping the current `AudioBufferSourceNode`
 * (which cannot be paused natively), recording the elapsed offset, then
 * recreating the node at that offset on resume.
 *
 * ---
 *
 * ### Event contract
 *
 * | Event           | Async? | Description |
 * |-----------------|--------|-------------|
 * | `audio/load`    | ✓      | Fetch, decode, and cache an audio clip |
 * | `audio/play`    | ✗ sync | Start a cached clip; returns `instanceId` |
 * | `audio/stop`    | ✗ sync | Stop an instance or all instances of a key |
 * | `audio/pause`   | ✗ sync | Pause a playing instance |
 * | `audio/resume`  | ✗ sync | Resume a paused instance |
 * | `audio/volume`  | ✗ sync | Set master volume or per-instance volume |
 * | `audio/unload`  | ✗ sync | Remove a buffer from cache |
 * | `audio/state`   | ✗ sync | Query the state of a playback instance (pull) |
 *
 * ---
 *
 * ### Usage
 * ```ts
 * import { createEngine, AudioManager } from 'inkshot-engine';
 *
 * const audio = new AudioManager();
 * const { core } = await createEngine({
 *   dataRoot: '/assets/',
 *   plugins: [
 *     audio,
 *     {
 *       namespace: 'myGame',
 *       async init(c) {
 *         await c.events.emit('audio/load', { key: 'bgm:town', url: 'audio/town.ogg' });
 *         await c.events.emit('audio/load', { key: 'sfx:hit',  url: 'audio/hit.wav' });
 *       },
 *     },
 *   ],
 * });
 *
 * // Play looping background music
 * const { output } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
 *   'audio/play',
 *   { key: 'bgm:town', loop: true, volume: 0.6, instanceId: 'bgm' },
 * );
 *
 * // Pause / resume
 * core.events.emitSync('audio/pause',  { instanceId: 'bgm' });
 * core.events.emitSync('audio/resume', { instanceId: 'bgm' });
 *
 * // Lower music during a cutscene
 * core.events.emitSync('audio/volume', { instanceId: 'bgm', volume: 0.2 });
 *
 * // Stop everything
 * core.events.emitSync('audio/stop', { key: 'bgm:town' });
 * ```
 */
export class AudioManager implements EnginePlugin {
  readonly namespace = 'audio';

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  private _ctx: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _dataRoot = '/';

  /** Decoded audio buffers keyed by the user-supplied alias. */
  private readonly _buffers = new Map<string, AudioBuffer>();

  /**
   * Active (playing or paused) instances.
   * Stopped instances are removed on stop; naturally-completed instances are
   * removed when `onended` fires.
   */
  private readonly _instances = new Map<string, AudioInstance>();

  /** Monotonically increasing counter for auto-generated instance IDs. */
  private _instanceCounter = 0;

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._dataRoot = core.dataRoot;
    const { events } = core;

    // ── audio/load ────────────────────────────────────────────────────────────

    events.on<AudioLoadParams, AudioLoadOutput>(
      this.namespace,
      'audio/load',
      async (params, output) => {
        const ctx = this._ensureContext();
        const resolved = this._resolve(params.url);
        const response = await fetch(resolved);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this._buffers.set(params.key, audioBuffer);
        output.loaded = true;
        output.duration = audioBuffer.duration;
      },
    );

    // ── audio/play ────────────────────────────────────────────────────────────

    events.on<AudioPlayParams, AudioPlayOutput>(
      this.namespace,
      'audio/play',
      (params, output) => {
        const buffer = this._buffers.get(params.key);
        if (!buffer) {
          throw new Error(
            `[AudioManager] No buffer loaded for key "${params.key}". ` +
              `Call audio/load first.`,
          );
        }

        const ctx = this._ensureContext();
        // Attempt to resume a suspended context (browser autoplay policy).
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }

        const instanceId = params.instanceId ?? `audio_${++this._instanceCounter}`;

        // Per-instance gain → master gain → destination
        const gainNode = ctx.createGain();
        gainNode.gain.value = params.volume ?? 1;
        gainNode.connect(this._masterGain!);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = params.loop ?? false;
        source.connect(gainNode);

        const instance: AudioInstance = {
          key: params.key,
          gainNode,
          source,
          startedAt: ctx.currentTime,
          offset: 0,
          loop: params.loop ?? false,
          state: 'playing',
        };

        source.onended = () => {
          const inst = this._instances.get(instanceId);
          // Only mark as stopped if playback ended naturally (i.e. no explicit
          // stop/pause has already changed the state).
          if (inst && inst.state === 'playing') {
            inst.state = 'stopped';
            this._instances.delete(instanceId);
          }
        };

        source.start(0, 0);
        this._instances.set(instanceId, instance);
        output.instanceId = instanceId;
      },
    );

    // ── audio/stop ────────────────────────────────────────────────────────────

    events.on<AudioStopParams>(
      this.namespace,
      'audio/stop',
      (params) => {
        if (params.instanceId !== undefined) {
          this._stopInstance(params.instanceId);
        } else if (params.key !== undefined) {
          // Collect IDs first to avoid mutating the map while iterating.
          const toStop: string[] = [];
          for (const [id, inst] of this._instances) {
            if (inst.key === params.key) toStop.push(id);
          }
          for (const id of toStop) this._stopInstance(id);
        }
      },
    );

    // ── audio/pause ───────────────────────────────────────────────────────────

    events.on<AudioPauseParams>(
      this.namespace,
      'audio/pause',
      (params) => {
        const inst = this._instances.get(params.instanceId);
        if (!inst || inst.state !== 'playing') return;

        const elapsed = this._ctx!.currentTime - inst.startedAt;
        inst.offset += elapsed;
        // Mark paused BEFORE stopping so `onended` does not overwrite the state.
        inst.state = 'paused';
        try {
          inst.source.stop();
        } catch {
          // Source may have already ended naturally; safe to ignore.
        }
      },
    );

    // ── audio/resume ──────────────────────────────────────────────────────────

    events.on<AudioResumeParams>(
      this.namespace,
      'audio/resume',
      (params) => {
        const inst = this._instances.get(params.instanceId);
        if (!inst || inst.state !== 'paused') return;

        const buffer = this._buffers.get(inst.key);
        if (!buffer) return; // Buffer was unloaded while paused — cannot resume.

        const ctx = this._ctx!;
        const newSource = ctx.createBufferSource();
        newSource.buffer = buffer;
        newSource.loop = inst.loop;
        newSource.connect(inst.gainNode);

        const instanceId = params.instanceId;
        newSource.onended = () => {
          const current = this._instances.get(instanceId);
          if (current && current.state === 'playing') {
            current.state = 'stopped';
            this._instances.delete(instanceId);
          }
        };

        newSource.start(0, inst.offset);
        inst.source = newSource;
        inst.startedAt = ctx.currentTime;
        inst.state = 'playing';
      },
    );

    // ── audio/volume ──────────────────────────────────────────────────────────

    events.on<AudioVolumeParams>(
      this.namespace,
      'audio/volume',
      (params) => {
        if (params.instanceId !== undefined) {
          const inst = this._instances.get(params.instanceId);
          if (inst) inst.gainNode.gain.value = params.volume;
        } else {
          // Master volume — affects all current and future playbacks.
          if (this._masterGain) this._masterGain.gain.value = params.volume;
        }
      },
    );

    // ── audio/unload ──────────────────────────────────────────────────────────

    events.on<AudioUnloadParams, AudioUnloadOutput>(
      this.namespace,
      'audio/unload',
      (params, output) => {
        output.unloaded = this._buffers.delete(params.key);
      },
    );

    // ── audio/state (pull) ────────────────────────────────────────────────────

    events.on<AudioStateParams, AudioStateOutput>(
      this.namespace,
      'audio/state',
      (params, output) => {
        const inst = this._instances.get(params.instanceId);
        if (!inst) {
          output.state = 'not-found';
          output.currentTime = 0;
          return;
        }

        output.state = inst.state;
        if (inst.state === 'playing' && this._ctx) {
          output.currentTime = this._ctx.currentTime - inst.startedAt + inst.offset;
        } else {
          // Paused or stopped: return the last recorded offset.
          output.currentTime = inst.offset;
        }
      },
    );
  }

  destroy(core: Core): void {
    // Stop all active instances before tearing down the context so that no
    // `onended` callbacks fire into a partially-destroyed manager.
    for (const id of [...this._instances.keys()]) {
      this._stopInstance(id);
    }
    this._instances.clear();
    this._buffers.clear();

    if (this._ctx) {
      void this._ctx.close();
      this._ctx = null;
      this._masterGain = null;
    }

    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Direct accessor API
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` when an `AudioBuffer` has been successfully loaded for
   * the given key.
   */
  isLoaded(key: string): boolean {
    return this._buffers.has(key);
  }

  /**
   * Returns the current master volume (0..1).
   * Returns `1` before the `AudioContext` has been initialised.
   */
  getMasterVolume(): number {
    return this._masterGain?.gain.value ?? 1;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Lazily creates the `AudioContext` and master gain node.
   *
   * Deferring creation until the first audio operation satisfies browser
   * autoplay policies that require a user gesture before audio can start.
   */
  private _ensureContext(): AudioContext {
    if (!this._ctx) {
      this._ctx = new AudioContext();
      this._masterGain = this._ctx.createGain();
      this._masterGain.connect(this._ctx.destination);
    }
    return this._ctx;
  }

  /**
   * Resolve a path relative to `dataRoot`.
   *
   * Absolute URLs (`http://`, `https://`, `data:`, `blob:`) and root-anchored
   * paths (`/…`) are returned unchanged.  All other values are prefixed with
   * `dataRoot`.
   */
  private _resolve(url: string): string {
    if (/^(https?:|data:|blob:)\/\//i.test(url) || url.startsWith('/')) {
      return url;
    }
    const base = this._dataRoot.endsWith('/') ? this._dataRoot : `${this._dataRoot}/`;
    return `${base}${url}`;
  }

  /**
   * Stop a single instance by ID, remove it from the registry, and suppress
   * any subsequent `onended` state change.
   */
  private _stopInstance(instanceId: string): void {
    const inst = this._instances.get(instanceId);
    if (!inst) return;
    if (inst.state !== 'stopped') {
      // Mark stopped BEFORE calling source.stop() so the onended callback
      // does not overwrite the state.
      inst.state = 'stopped';
      try {
        inst.source.stop();
      } catch {
        // The source may have already ended naturally; safe to ignore.
      }
    }
    this._instances.delete(instanceId);
  }
}
