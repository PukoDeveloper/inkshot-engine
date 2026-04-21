import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  AudioCategory,
  AudioLoadParams,
  AudioLoadOutput,
  AudioPlayParams,
  AudioPlayOutput,
  AudioStopParams,
  AudioPauseParams,
  AudioResumeParams,
  AudioVolumeParams,
  AudioFadeStopParams,
  AudioUnloadParams,
  AudioUnloadOutput,
  AudioStateParams,
  AudioStateOutput,
  AudioListOutput,
  AudioInstanceInfo,
  AudioListenerUpdateParams,
  AudioSourceMoveParams,
} from '../../types/audio.js';

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
  /**
   * Audio category this instance belongs to (e.g. `'bgm'`, `'sfx'`).
   * `undefined` for uncategorised instances.
   */
  readonly category?: AudioCategory;
  /**
   * Spatial `PannerNode` for positional audio.
   * Present only when the instance was created with a `position` parameter.
   */
  readonly pannerNode?: PannerNode;
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
 * | `audio/stop`    | ✗ sync | Stop an instance, all by key/category, or all active |
 * | `audio/pause`   | ✗ sync | Pause a playing instance |
 * | `audio/resume`  | ✗ sync | Resume a paused instance |
 * | `audio/volume`  | ✗ sync | Set master / category / per-instance volume (with optional fade) |
 * | `audio/fade-stop` | ✗ sync | Fade out and stop a specific instance |
 * | `audio/unload`  | ✗ sync | Remove a buffer from cache |
 * | `audio/state`   | ✗ sync | Query the state of a playback instance (pull) |
 * | `audio/list`    | ✗ sync | List all active (playing / paused) instances (pull) |
 * | `audio/listener:update` | ✗ sync | Update the listener world position (for spatial audio) |
 * | `audio/source:move`     | ✗ sync | Reposition a spatial audio source at runtime |
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

  /**
   * Per-category gain nodes, created lazily the first time a category is used.
   * Each category gain connects to the master gain so that both category-level
   * and master-level volume adjustments take effect simultaneously.
   */
  private readonly _categoryGains = new Map<string, GainNode>();

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

        // Per-instance gain → (optional category gain) → master gain → destination
        const gainNode = ctx.createGain();
        const targetVolume = params.volume ?? 1;

        if (params.fadeIn && params.fadeIn > 0) {
          gainNode.gain.value = 0;
          gainNode.gain.setValueAtTime(0, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(targetVolume, ctx.currentTime + params.fadeIn);
        } else {
          gainNode.gain.value = targetVolume;
        }

        const upstreamGain = params.category
          ? this._getCategoryGain(params.category)
          : this._masterGain!;
        gainNode.connect(upstreamGain);

        // ── Spatial (PannerNode) wiring ──────────────────────────────────────
        // When a world-space `position` is provided, insert a PannerNode between
        // the source and the per-instance gain.  This gives per-stream volume
        // control AND spatial processing simultaneously.
        let pannerNode: PannerNode | undefined;
        if (params.position !== undefined) {
          pannerNode = ctx.createPanner();
          pannerNode.panningModel  = params.panningModel  ?? 'equalpower';
          pannerNode.distanceModel = params.distanceModel ?? 'linear';
          pannerNode.refDistance   = params.refDistance   ?? 1;
          pannerNode.maxDistance   = params.maxDistance   ?? 10_000;
          pannerNode.rolloffFactor = params.rolloffFactor ?? 1;
          // Map game 2-D coords to Web Audio 3-D space (negate Y because Web
          // Audio Y points up while game Y points down; fixed Z keeps it in-plane).
          pannerNode.positionX.value =  params.position.x;
          pannerNode.positionY.value = -params.position.y;
          pannerNode.positionZ.value =  0;
          pannerNode.connect(gainNode);
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = params.loop ?? false;
        if (params.playbackRate !== undefined) {
          source.playbackRate.value = params.playbackRate;
        }
        if (params.loopStart !== undefined) {
          source.loopStart = params.loopStart;
        }
        if (params.loopEnd !== undefined) {
          source.loopEnd = params.loopEnd;
        }
        // Source connects to panner (if spatial) or directly to the gain node.
        source.connect(pannerNode ?? gainNode);

        const instance: AudioInstance = {
          key: params.key,
          gainNode,
          source,
          startedAt: ctx.currentTime,
          offset: 0,
          loop: params.loop ?? false,
          state: 'playing',
          category: params.category,
          pannerNode,
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
        } else if (params.category !== undefined) {
          const toStop: string[] = [];
          for (const [id, inst] of this._instances) {
            if (inst.category === params.category) toStop.push(id);
          }
          for (const id of toStop) this._stopInstance(id);
        } else {
          // Stop-all: no filter provided.
          const toStop = [...this._instances.keys()];
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
        if (inst.loop) {
          const buffer = this._buffers.get(inst.key);
          if (buffer && buffer.duration > 0) {
            inst.offset = (inst.offset + elapsed) % buffer.duration;
          } else {
            inst.offset += elapsed;
          }
        } else {
          inst.offset += elapsed;
        }
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
        // Reconnect through the panner node if this is a spatial instance,
        // otherwise connect directly to the per-instance gain node.
        newSource.connect(inst.pannerNode ?? inst.gainNode);

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
        const ctx = this._ctx;
        // Resolve the target gain in priority order:
        //   instanceId > category > master
        const gain =
          params.instanceId !== undefined
            ? this._instances.get(params.instanceId)?.gainNode.gain
            : params.category !== undefined
              ? this._categoryGains.get(params.category)?.gain
              : this._masterGain?.gain;

        if (!gain) return;

        if (params.duration && params.duration > 0 && ctx) {
          gain.setValueAtTime(gain.value, ctx.currentTime);
          gain.linearRampToValueAtTime(params.volume, ctx.currentTime + params.duration);
        } else {
          gain.value = params.volume;
        }
      },
    );

    // ── audio/fade-stop ───────────────────────────────────────────────────────

    events.on<AudioFadeStopParams>(
      this.namespace,
      'audio/fade-stop',
      (params) => {
        const inst = this._instances.get(params.instanceId);
        if (!inst || inst.state !== 'playing') return;

        const ctx = this._ctx!;
        const { gainNode, source } = inst;

        gainNode.gain.setValueAtTime(gainNode.gain.value, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + params.duration);
        source.stop(ctx.currentTime + params.duration);
        // onended will fire after the scheduled stop and clean up the instance.
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

    // ── audio/list (pull) ─────────────────────────────────────────────────────

    events.on<Record<string, never>, AudioListOutput>(
      this.namespace,
      'audio/list',
      (_params, output) => {
        const instances: AudioInstanceInfo[] = [];
        for (const [instanceId, inst] of this._instances) {
          if (inst.state === 'stopped') continue;
          const currentTime =
            inst.state === 'playing' && this._ctx
              ? this._ctx.currentTime - inst.startedAt + inst.offset
              : inst.offset;
          instances.push({
            instanceId,
            key: inst.key,
            state: inst.state,
            currentTime,
            ...(inst.category !== undefined ? { category: inst.category } : {}),
          });
        }
        output.instances = instances;
      },
    );

    // ── audio/listener:update ─────────────────────────────────────────────────

    events.on<AudioListenerUpdateParams>(
      this.namespace,
      'audio/listener:update',
      (params) => {
        const ctx = this._ctx;
        if (!ctx) return;
        const listener = ctx.listener;
        // Web Audio Y axis points up; game Y axis points down.
        if (typeof listener.positionX !== 'undefined') {
          // Modern API (AudioParam-based)
          listener.positionX.value =  params.x;
          listener.positionY.value = -params.y;
          listener.positionZ.value =  1;
        } else {
          // Legacy API
          (listener as AudioListener).setPosition(params.x, -params.y, 1);
        }
        // Orient the listener so that "forward" is into the screen plane
        // and "up" follows the game's inverted Y axis.
        if (typeof listener.forwardX !== 'undefined') {
          listener.forwardX.value =  0;
          listener.forwardY.value =  0;
          listener.forwardZ.value = -1;
          listener.upX.value =  0;
          listener.upY.value = -1;
          listener.upZ.value =  0;
        } else {
          (listener as AudioListener).setOrientation(0, 0, -1, 0, -1, 0);
        }
      },
    );

    // ── audio/source:move ─────────────────────────────────────────────────────

    events.on<AudioSourceMoveParams>(
      this.namespace,
      'audio/source:move',
      (params) => {
        const inst = this._instances.get(params.instanceId);
        if (!inst) return;
        if (!inst.pannerNode) {
          // This is a non-spatial instance — always warn so callers don't
          // silently get no effect when they forget to pass `position` to
          // `audio/play`.
          console.warn(
            `[AudioManager] audio/source:move: instance "${params.instanceId}" ` +
              `was not created with a position and has no PannerNode. ` +
              `Pass a \`position\` parameter to \`audio/play\` to enable spatial audio.`,
          );
          return;
        }
        inst.pannerNode.positionX.value =  params.x;
        inst.pannerNode.positionY.value = -params.y;
        inst.pannerNode.positionZ.value =  0;
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
    this._categoryGains.clear();

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

  /**
   * Returns the current gain value for the given category (0..1).
   * Returns `1` if the category gain node has not yet been created (i.e. no
   * instance in that category has been played yet).
   */
  getCategoryVolume(category: AudioCategory): number {
    return this._categoryGains.get(category)?.gain.value ?? 1;
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
   * Returns the `GainNode` for the given category, creating it lazily if it
   * does not exist yet.  The node is always wired to the master gain so that
   * both levels of volume control take effect simultaneously.
   */
  private _getCategoryGain(category: AudioCategory): GainNode {
    const existing = this._categoryGains.get(category);
    if (existing) return existing;
    const ctx = this._ensureContext();
    const gainNode = ctx.createGain();
    gainNode.connect(this._masterGain!);
    this._categoryGains.set(category, gainNode);
    return gainNode;
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
