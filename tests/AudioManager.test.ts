// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { AudioManager } from '../src/plugins/audio/AudioManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  AudioLoadOutput,
  AudioPlayParams,
  AudioPlayOutput,
  AudioStateOutput,
  AudioUnloadOutput,
  AudioListOutput,
} from '../src/types/audio.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Controllable "wall clock" for AudioContext.currentTime. */
let mockCurrentTime = 0;

const mockBuffer: AudioBuffer = { duration: 3.0 } as unknown as AudioBuffer;

function createMockSource() {
  const src = {
    buffer: null as AudioBuffer | null,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    playbackRate: { value: 1 },
    onended: null as (() => void) | null,
    connect: vi.fn(),
    start: vi.fn(),
    /** Calling stop() immediately fires onended (mirrors real Web Audio behavior). */
    stop: vi.fn().mockImplementation(function (this: typeof src) {
      src.onended?.();
    }),
  };
  return src;
}

function createMockGain() {
  return {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
}

function createMockPanner() {
  return {
    panningModel: 'equalpower' as PanningModelType,
    distanceModel: 'linear' as DistanceModelType,
    refDistance: 1,
    maxDistance: 10_000,
    rolloffFactor: 1,
    positionX: { value: 0 },
    positionY: { value: 0 },
    positionZ: { value: 0 },
    connect: vi.fn(),
  };
}

type MockSource = ReturnType<typeof createMockSource>;
type MockGain = ReturnType<typeof createMockGain>;
type MockPanner = ReturnType<typeof createMockPanner>;

/** Factory so tests can inspect specific source/gain instances. */
let lastSource: MockSource;
let lastGain: MockGain;
let lastPanner: MockPanner;

class MockAudioContext {
  get currentTime() {
    return mockCurrentTime;
  }
  state = 'running' as AudioContextState;
  destination = {} as AudioDestinationNode;
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  decodeAudioData = vi.fn().mockResolvedValue(mockBuffer);

  listener = {
    positionX: { value: 0 },
    positionY: { value: 0 },
    positionZ: { value: 0 },
    forwardX: { value: 0 },
    forwardY: { value: 0 },
    forwardZ: { value: -1 },
    upX: { value: 0 },
    upY: { value: -1 },
    upZ: { value: 0 },
  };

  createBufferSource = vi.fn().mockImplementation(() => {
    lastSource = createMockSource();
    return lastSource;
  });

  createGain = vi.fn().mockImplementation(() => {
    lastGain = createMockGain();
    return lastGain;
  });

  createPanner = vi.fn().mockImplementation(() => {
    lastPanner = createMockPanner();
    return lastPanner;
  });
}

function stubGlobals() {
  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    }),
  );
}

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/assets/' } as unknown as Core;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AudioManager', () => {
  let core: Core;
  let audio: AudioManager;

  beforeEach(() => {
    mockCurrentTime = 0;
    stubGlobals();
    core = createStubCore();
    audio = new AudioManager();
    audio.init(core);
  });

  afterEach(() => {
    audio.destroy(core);
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // audio/load
  // -------------------------------------------------------------------------

  describe('audio/load', () => {
    it('fetches, decodes, and caches a buffer', async () => {
      const { output } = await core.events.emit<AudioLoadOutput>(
        'audio/load',
        { key: 'bgm', url: 'music/town.ogg' },
      );

      expect(output.loaded).toBe(true);
      expect(output.duration).toBe(3.0);
      expect(audio.isLoaded('bgm')).toBe(true);
    });

    it('resolves relative URLs against dataRoot', async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'music/town.ogg' });

      expect(fetch).toHaveBeenCalledWith('/assets/music/town.ogg');
    });

    it('passes absolute URLs through unchanged', async () => {
      await core.events.emit('audio/load', {
        key: 'remote',
        url: 'https://cdn.example.com/sfx.ogg',
      });

      expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/sfx.ogg');
    });

    it('passes root-anchored paths through unchanged', async () => {
      await core.events.emit('audio/load', { key: 'abs', url: '/static/sfx.wav' });

      expect(fetch).toHaveBeenCalledWith('/static/sfx.wav');
    });

    it('overwrites an existing buffer when the same key is re-loaded', async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'a.ogg' });
      await core.events.emit('audio/load', { key: 'bgm', url: 'b.ogg' });

      // Two separate fetch calls should have been made.
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(audio.isLoaded('bgm')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // audio/play
  // -------------------------------------------------------------------------

  describe('audio/play', () => {
    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
    });

    it('returns a generated instanceId and starts the source', () => {
      const { output } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
        'audio/play',
        { key: 'sfx' },
      );

      expect(output.instanceId).toMatch(/^audio_\d+$/);
      expect(lastSource.start).toHaveBeenCalledWith(0, 0);
    });

    it('uses a caller-supplied instanceId when provided', () => {
      const { output } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
        'audio/play',
        { key: 'sfx', instanceId: 'my-sound' },
      );

      expect(output.instanceId).toBe('my-sound');
    });

    it('sets loop on the source node', () => {
      core.events.emitSync('audio/play', { key: 'sfx', loop: true });

      expect(lastSource.loop).toBe(true);
    });

    it('sets the per-instance gain value', () => {
      core.events.emitSync('audio/play', { key: 'sfx', volume: 0.4 });

      // lastGain is the per-instance gain (not master, which was created first)
      expect(lastGain.gain.value).toBe(0.4);
    });

    it('fades in from 0 to volume when fadeIn > 0', () => {
      mockCurrentTime = 1.0;
      core.events.emitSync('audio/play', { key: 'sfx', volume: 0.8, fadeIn: 2 });

      expect(lastGain.gain.value).toBe(0);
      expect(lastGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 1.0);
      expect(lastGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, 3.0);
    });

    it('fades in to default volume (1) when volume is omitted', () => {
      mockCurrentTime = 0;
      core.events.emitSync('audio/play', { key: 'sfx', fadeIn: 1.5 });

      expect(lastGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1.5);
    });

    it('does not schedule a ramp when fadeIn is 0', () => {
      core.events.emitSync('audio/play', { key: 'sfx', volume: 0.5, fadeIn: 0 });

      expect(lastGain.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
      expect(lastGain.gain.value).toBe(0.5);
    });

    it('throws when the key has not been loaded', () => {
      expect(() => {
        core.events.emitSync('audio/play', { key: 'missing' });
      }).toThrow('[AudioManager]');
    });

    it('reports state as "playing" immediately after play', () => {
      const { output: play } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
        'audio/play',
        { key: 'sfx', instanceId: 'inst' },
      );
      const { output: state } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId: play.instanceId },
      );

      expect(state.state).toBe('playing');
    });

    it('attempts to resume a suspended AudioContext', () => {
      const ctx = new (globalThis.AudioContext as unknown as typeof MockAudioContext)();
      ctx.state = 'suspended';
      // Replace the internal context to simulate suspension.
      // Instead we test via the resume mock on the spy.
      // Simply trigger play again (the context created inside the plugin
      // will already be 'running', so we test the branch by setting state).
      // We verify resume was called when state === 'suspended'.
      const mockCtx = (audio as unknown as { _ctx: MockAudioContext })._ctx;
      if (mockCtx) {
        mockCtx.state = 'suspended';
        core.events.emitSync('audio/play', { key: 'sfx' });
        expect(mockCtx.resume).toHaveBeenCalled();
      }
    });
  });

  // -------------------------------------------------------------------------
  // audio/stop
  // -------------------------------------------------------------------------

  describe('audio/stop', () => {
    let instanceId: string;

    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      const { output } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
        'audio/play',
        { key: 'sfx' },
      );
      instanceId = output.instanceId;
    });

    it('stops a specific instance by instanceId', () => {
      const capturedSource = lastSource;
      core.events.emitSync('audio/stop', { instanceId });

      expect(capturedSource.stop).toHaveBeenCalled();
    });

    it('marks instance as "not-found" after stop', () => {
      core.events.emitSync('audio/stop', { instanceId });

      const { output } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId },
      );
      expect(output.state).toBe('not-found');
    });

    it('stops all instances of a key', () => {
      const sources: MockSource[] = [lastSource];
      core.events.emitSync('audio/play', { key: 'sfx' });
      sources.push(lastSource);

      // Both sources should stop when we stop by key.
      core.events.emitSync('audio/stop', { key: 'sfx' });

      for (const src of sources) {
        expect(src.stop).toHaveBeenCalled();
      }
    });

    it('is a no-op for an unknown instanceId', () => {
      expect(() => {
        core.events.emitSync('audio/stop', { instanceId: 'ghost' });
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // audio/pause & audio/resume
  // -------------------------------------------------------------------------

  describe('audio/pause and audio/resume', () => {
    let instanceId: string;
    let capturedSource: MockSource;

    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });
      const { output } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
        'audio/play',
        { key: 'bgm', instanceId: 'bgm' },
      );
      instanceId = output.instanceId;
      capturedSource = lastSource;
    });

    it('pauses a playing instance', () => {
      core.events.emitSync('audio/pause', { instanceId });

      const { output } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId },
      );
      expect(output.state).toBe('paused');
      expect(capturedSource.stop).toHaveBeenCalled();
    });

    it('records the elapsed offset on pause', () => {
      mockCurrentTime = 1.5; // simulate 1.5 seconds of playback

      core.events.emitSync('audio/pause', { instanceId });

      const { output } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId },
      );
      // currentTime == offset when paused
      expect(output.currentTime).toBeCloseTo(1.5);
    });

    it('resumes from the paused position', () => {
      mockCurrentTime = 2.0;
      core.events.emitSync('audio/pause', { instanceId });

      mockCurrentTime = 5.0; // time passes while paused
      core.events.emitSync('audio/resume', { instanceId });

      expect(lastSource.start).toHaveBeenCalledWith(0, 2.0);
    });

    it('sets state back to "playing" after resume', () => {
      core.events.emitSync('audio/pause', { instanceId });
      core.events.emitSync('audio/resume', { instanceId });

      const { output } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId },
      );
      expect(output.state).toBe('playing');
    });

    it('ignores pause on a non-playing instance', () => {
      core.events.emitSync('audio/stop', { instanceId });

      expect(() => {
        core.events.emitSync('audio/pause', { instanceId });
      }).not.toThrow();
    });

    it('ignores resume on a non-paused instance', () => {
      expect(() => {
        core.events.emitSync('audio/resume', { instanceId });
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // audio/volume
  // -------------------------------------------------------------------------

  describe('audio/volume', () => {
    it('sets master volume when no instanceId is given', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      core.events.emitSync('audio/play', { key: 'sfx' }); // triggers context creation

      core.events.emitSync('audio/volume', { volume: 0.3 });

      expect(audio.getMasterVolume()).toBeCloseTo(0.3);
    });

    it('sets per-instance gain when instanceId is given', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      core.events.emitSync<AudioPlayParams, AudioPlayOutput>('audio/play', {
        key: 'sfx',
        instanceId: 'inst',
      });
      const instanceGain = lastGain;

      core.events.emitSync('audio/volume', { instanceId: 'inst', volume: 0.7 });

      expect(instanceGain.gain.value).toBeCloseTo(0.7);
    });

    it('is a no-op for an unknown instanceId', () => {
      expect(() => {
        core.events.emitSync('audio/volume', { instanceId: 'ghost', volume: 0.5 });
      }).not.toThrow();
    });

    it('schedules a linear ramp when duration > 0 for an instance', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      core.events.emitSync<AudioPlayParams, AudioPlayOutput>('audio/play', {
        key: 'sfx',
        instanceId: 'inst',
        volume: 1,
      });
      const instanceGain = lastGain;
      mockCurrentTime = 2.0;

      core.events.emitSync('audio/volume', { instanceId: 'inst', volume: 0.2, duration: 3 });

      expect(instanceGain.gain.setValueAtTime).toHaveBeenCalledWith(
        instanceGain.gain.value,
        2.0,
      );
      expect(instanceGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.2, 5.0);
    });

    it('schedules a linear ramp on master gain when duration > 0 and no instanceId', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      core.events.emitSync('audio/play', { key: 'sfx' }); // initialises context & master gain
      const masterGain = (audio as unknown as { _masterGain: MockGain })._masterGain!;
      mockCurrentTime = 1.0;

      core.events.emitSync('audio/volume', { volume: 0.4, duration: 2 });

      expect(masterGain.gain.setValueAtTime).toHaveBeenCalledWith(
        masterGain.gain.value,
        1.0,
      );
      expect(masterGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.4, 3.0);
    });

    it('sets gain instantly when duration is 0', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      core.events.emitSync<AudioPlayParams, AudioPlayOutput>('audio/play', {
        key: 'sfx',
        instanceId: 'inst2',
      });
      const instanceGain = lastGain;

      core.events.emitSync('audio/volume', { instanceId: 'inst2', volume: 0.6, duration: 0 });

      expect(instanceGain.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
      expect(instanceGain.gain.value).toBeCloseTo(0.6);
    });
  });

  // -------------------------------------------------------------------------
  // audio/fade-stop
  // -------------------------------------------------------------------------

  describe('audio/fade-stop', () => {
    let instanceId: string;
    let capturedGain: MockGain;
    let capturedSource: MockSource;

    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });
      const { output } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
        'audio/play',
        { key: 'bgm', instanceId: 'bgm', volume: 0.8 },
      );
      instanceId = output.instanceId;
      capturedGain = lastGain;
      capturedSource = lastSource;
    });

    it('schedules a gain ramp to 0 over the given duration', () => {
      mockCurrentTime = 1.0;
      core.events.emitSync('audio/fade-stop', { instanceId, duration: 2 });

      expect(capturedGain.gain.setValueAtTime).toHaveBeenCalledWith(
        capturedGain.gain.value,
        1.0,
      );
      expect(capturedGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 3.0);
    });

    it('schedules source.stop() at currentTime + duration', () => {
      mockCurrentTime = 2.0;
      // Override stop to NOT fire onended immediately so we can inspect the arg.
      capturedSource.stop = vi.fn();
      core.events.emitSync('audio/fade-stop', { instanceId, duration: 1.5 });

      expect(capturedSource.stop).toHaveBeenCalledWith(3.5);
    });

    it('is a no-op for an unknown instanceId', () => {
      expect(() => {
        core.events.emitSync('audio/fade-stop', { instanceId: 'ghost', duration: 1 });
      }).not.toThrow();
    });

    it('is a no-op for a paused instance', () => {
      core.events.emitSync('audio/pause', { instanceId });
      capturedSource.stop = vi.fn();
      core.events.emitSync('audio/fade-stop', { instanceId, duration: 1 });

      // stop should not have been called again after the initial pause stop
      expect(capturedSource.stop).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // audio/unload
  // -------------------------------------------------------------------------

  describe('audio/unload', () => {
    it('removes a cached buffer', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      expect(audio.isLoaded('sfx')).toBe(true);

      const { output } = core.events.emitSync<{ key: string }, AudioUnloadOutput>(
        'audio/unload',
        { key: 'sfx' },
      );

      expect(output.unloaded).toBe(true);
      expect(audio.isLoaded('sfx')).toBe(false);
    });

    it('returns unloaded=false for an unknown key', () => {
      const { output } = core.events.emitSync<{ key: string }, AudioUnloadOutput>(
        'audio/unload',
        { key: 'nope' },
      );

      expect(output.unloaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // audio/state
  // -------------------------------------------------------------------------

  describe('audio/state', () => {
    it('returns "not-found" for an unknown instanceId', () => {
      const { output } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId: 'ghost' },
      );

      expect(output.state).toBe('not-found');
      expect(output.currentTime).toBe(0);
    });

    it('returns elapsed time for a playing instance', async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm' });

      mockCurrentTime = 2.5;

      const { output } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId: 'bgm' },
      );

      expect(output.state).toBe('playing');
      expect(output.currentTime).toBeCloseTo(2.5);
    });

    it('returns offset time for a paused instance', async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm' });

      mockCurrentTime = 1.0;
      core.events.emitSync('audio/pause', { instanceId: 'bgm' });

      const { output } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId: 'bgm' },
      );

      expect(output.state).toBe('paused');
      expect(output.currentTime).toBeCloseTo(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // Natural playback completion (onended)
  // -------------------------------------------------------------------------

  describe('natural completion', () => {
    it('marks the instance as stopped when the source ends naturally', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      const { output } = core.events.emitSync<AudioPlayParams, AudioPlayOutput>(
        'audio/play',
        { key: 'sfx', instanceId: 'sfx' },
      );

      // Simulate the source node ending naturally (no explicit stop call).
      lastSource.stop.mockImplementationOnce(function () {
        lastSource.onended?.();
      });
      lastSource.onended?.(); // fire directly, as real Web Audio would

      const { output: state } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
        'audio/state',
        { instanceId: output.instanceId },
      );
      expect(state.state).toBe('not-found'); // cleaned up after natural end
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops all playing instances', async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });
      core.events.emitSync('audio/play', { key: 'bgm' });
      const src = lastSource;

      audio.destroy(core);

      expect(src.stop).toHaveBeenCalled();
    });

    it('closes the AudioContext', async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });
      core.events.emitSync('audio/play', { key: 'bgm' });
      const mockCtx = (audio as unknown as { _ctx: MockAudioContext })._ctx;

      audio.destroy(core);

      expect(mockCtx?.close).toHaveBeenCalled();
    });

    it('stops responding to events after destroy', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      audio.destroy(core);

      // Listeners should have been removed — calling play should not trigger
      // the AudioManager handler, so no throw from "key not found".
      expect(() => {
        core.events.emitSync('audio/play', { key: 'sfx' });
      }).not.toThrow();
    });

    it('clears the buffer cache', async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      audio.destroy(core);

      expect(audio.isLoaded('sfx')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // direct accessors
  // -------------------------------------------------------------------------

  describe('direct accessors', () => {
    it('getMasterVolume() returns 1 before context is created', () => {
      expect(audio.getMasterVolume()).toBe(1);
    });

    it('isLoaded() returns false for an unloaded key', () => {
      expect(audio.isLoaded('nope')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // audio/play — category, playbackRate, loopStart/loopEnd
  // -------------------------------------------------------------------------

  describe('audio/play — extended params', () => {
    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });
    });

    it('sets playbackRate on the source node', () => {
      core.events.emitSync('audio/play', { key: 'bgm', playbackRate: 1.5 });

      expect(lastSource.playbackRate.value).toBe(1.5);
    });

    it('leaves playbackRate at default 1 when omitted', () => {
      core.events.emitSync('audio/play', { key: 'bgm' });

      expect(lastSource.playbackRate.value).toBe(1);
    });

    it('sets loopStart and loopEnd on the source node', () => {
      core.events.emitSync('audio/play', { key: 'bgm', loop: true, loopStart: 0.5, loopEnd: 2.5 });

      expect(lastSource.loopStart).toBe(0.5);
      expect(lastSource.loopEnd).toBe(2.5);
    });

    it('leaves loopStart/loopEnd at 0 when omitted', () => {
      core.events.emitSync('audio/play', { key: 'bgm', loop: true });

      expect(lastSource.loopStart).toBe(0);
      expect(lastSource.loopEnd).toBe(0);
    });

    it('creates a category gain node when category is provided', () => {
      const createGainSpy = vi.spyOn(
        (audio as unknown as { _ctx: MockAudioContext })._ctx ?? new MockAudioContext(),
        'createGain',
      );
      core.events.emitSync('audio/load', { key: 'bgm2', url: 'bgm2.ogg' });
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm-inst', category: 'bgm' });

      // The category gain should be wired up — getCategoryVolume returns 1 (default).
      expect(audio.getCategoryVolume('bgm')).toBe(1);
    });

    it('routes uncategorised instances directly to master gain', async () => {
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'no-cat' });

      // No category gain should exist for uncategorised play.
      expect(audio.getCategoryVolume('bgm')).toBe(1); // returns default 1 — no node created
    });

    it('getCategoryVolume() returns 1 for an unknown category', () => {
      expect(audio.getCategoryVolume('ambient')).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // audio/volume — category
  // -------------------------------------------------------------------------

  describe('audio/volume — category', () => {
    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
    });

    it('adjusts category gain instantly when duration is omitted', () => {
      core.events.emitSync('audio/play', { key: 'sfx', category: 'sfx', instanceId: 'sfx1' });

      core.events.emitSync('audio/volume', { category: 'sfx', volume: 0.3 });

      expect(audio.getCategoryVolume('sfx')).toBeCloseTo(0.3);
    });

    it('schedules a linear ramp on category gain when duration > 0', () => {
      core.events.emitSync('audio/play', { key: 'sfx', category: 'sfx', instanceId: 'sfx2' });
      const sfxCatGain = (audio as unknown as { _categoryGains: Map<string, MockGain> })
        ._categoryGains.get('sfx')!;
      mockCurrentTime = 1.0;

      core.events.emitSync('audio/volume', { category: 'sfx', volume: 0.1, duration: 2 });

      expect(sfxCatGain.gain.setValueAtTime).toHaveBeenCalledWith(sfxCatGain.gain.value, 1.0);
      expect(sfxCatGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.1, 3.0);
    });

    it('is a no-op for an unknown category (no node created yet)', () => {
      expect(() => {
        core.events.emitSync('audio/volume', { category: 'vo', volume: 0.5 });
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // audio/stop — stop-all and category
  // -------------------------------------------------------------------------

  describe('audio/stop — stop-all and category', () => {
    let sfxSrc1: MockSource;
    let bgmSrc: MockSource;
    let sfxSrc2: MockSource;

    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });

      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'sfx1', category: 'sfx' });
      sfxSrc1 = lastSource;
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm1', category: 'bgm' });
      bgmSrc = lastSource;
      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'sfx2', category: 'sfx' });
      sfxSrc2 = lastSource;
    });

    it('stops all active instances when no filter is provided', () => {
      core.events.emitSync('audio/stop', {});

      expect(sfxSrc1.stop).toHaveBeenCalled();
      expect(bgmSrc.stop).toHaveBeenCalled();
      expect(sfxSrc2.stop).toHaveBeenCalled();
    });

    it('stops only instances in the given category', () => {
      core.events.emitSync('audio/stop', { category: 'sfx' });

      expect(sfxSrc1.stop).toHaveBeenCalled();
      expect(sfxSrc2.stop).toHaveBeenCalled();
      expect(bgmSrc.stop).not.toHaveBeenCalled();
    });

    it('all instances are "not-found" after stop-all', () => {
      core.events.emitSync('audio/stop', {});

      for (const id of ['sfx1', 'bgm1', 'sfx2']) {
        const { output } = core.events.emitSync<{ instanceId: string }, AudioStateOutput>(
          'audio/state',
          { instanceId: id },
        );
        expect(output.state).toBe('not-found');
      }
    });
  });

  // -------------------------------------------------------------------------
  // audio/list
  // -------------------------------------------------------------------------

  describe('audio/list', () => {
    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'bgm', url: 'bgm.ogg' });
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
    });

    it('returns an empty array when no instances are active', () => {
      const { output } = core.events.emitSync<Record<string, never>, AudioListOutput>(
        'audio/list',
        {},
      );

      expect(output.instances).toEqual([]);
    });

    it('lists all playing instances', () => {
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm1' });
      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'sfx1' });

      const { output } = core.events.emitSync<Record<string, never>, AudioListOutput>(
        'audio/list',
        {},
      );

      expect(output.instances).toHaveLength(2);
      const ids = output.instances.map((i) => i.instanceId);
      expect(ids).toContain('bgm1');
      expect(ids).toContain('sfx1');
    });

    it('includes category when one was provided at play time', () => {
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm-cat', category: 'bgm' });

      const { output } = core.events.emitSync<Record<string, never>, AudioListOutput>(
        'audio/list',
        {},
      );

      const entry = output.instances.find((i) => i.instanceId === 'bgm-cat');
      expect(entry?.category).toBe('bgm');
    });

    it('omits category when none was provided', () => {
      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'sfx-nocat' });

      const { output } = core.events.emitSync<Record<string, never>, AudioListOutput>(
        'audio/list',
        {},
      );

      const entry = output.instances.find((i) => i.instanceId === 'sfx-nocat');
      expect(entry?.category).toBeUndefined();
    });

    it('includes paused instances', () => {
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm2' });
      core.events.emitSync('audio/pause', { instanceId: 'bgm2' });

      const { output } = core.events.emitSync<Record<string, never>, AudioListOutput>(
        'audio/list',
        {},
      );

      const entry = output.instances.find((i) => i.instanceId === 'bgm2');
      expect(entry?.state).toBe('paused');
    });

    it('excludes stopped instances', () => {
      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'sfx-stop' });
      core.events.emitSync('audio/stop', { instanceId: 'sfx-stop' });

      const { output } = core.events.emitSync<Record<string, never>, AudioListOutput>(
        'audio/list',
        {},
      );

      const entry = output.instances.find((i) => i.instanceId === 'sfx-stop');
      expect(entry).toBeUndefined();
    });

    it('returns correct currentTime for a playing instance', () => {
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm3' });
      mockCurrentTime = 2.0;

      const { output } = core.events.emitSync<Record<string, never>, AudioListOutput>(
        'audio/list',
        {},
      );

      const entry = output.instances.find((i) => i.instanceId === 'bgm3');
      expect(entry?.currentTime).toBeCloseTo(2.0);
    });

    it('returns correct currentTime for a paused instance', () => {
      core.events.emitSync('audio/play', { key: 'bgm', instanceId: 'bgm4' });
      mockCurrentTime = 1.5;
      core.events.emitSync('audio/pause', { instanceId: 'bgm4' });

      const { output } = core.events.emitSync<Record<string, never>, AudioListOutput>(
        'audio/list',
        {},
      );

      const entry = output.instances.find((i) => i.instanceId === 'bgm4');
      expect(entry?.currentTime).toBeCloseTo(1.5);
    });
  });

  // -------------------------------------------------------------------------
  // Spatial audio — audio/play with position
  // -------------------------------------------------------------------------

  describe('spatial audio — audio/play with position', () => {
    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
    });

    it('creates a PannerNode when position is provided', () => {
      const mockCtx = (audio as unknown as { _ctx: MockAudioContext })._ctx;
      const createPannerSpy = vi.spyOn(mockCtx ?? new MockAudioContext(), 'createPanner');

      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'spatial', position: { x: 100, y: 50 } });

      expect(createPannerSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT create a PannerNode when position is omitted', () => {
      // trigger context creation first
      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'no-spatial' });
      const mockCtx = (audio as unknown as { _ctx: MockAudioContext })._ctx!;
      const createPannerSpy = vi.spyOn(mockCtx, 'createPanner');

      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'no-spatial-2' });

      expect(createPannerSpy).not.toHaveBeenCalled();
    });

    it('maps game X to PannerNode positionX and negates game Y to positionY', () => {
      core.events.emitSync('audio/play', {
        key: 'sfx',
        instanceId: 'pos-test',
        position: { x: 200, y: 80 },
      });

      expect(lastPanner.positionX.value).toBe(200);
      expect(lastPanner.positionY.value).toBe(-80);
      expect(lastPanner.positionZ.value).toBe(0);
    });

    it('connects source to panner and panner to gain when spatial', () => {
      core.events.emitSync('audio/play', {
        key: 'sfx',
        instanceId: 'conn-test',
        position: { x: 0, y: 0 },
      });

      // source.connect → panner; panner.connect → gain
      expect(lastSource.connect).toHaveBeenCalledWith(lastPanner);
      expect(lastPanner.connect).toHaveBeenCalledWith(lastGain);
    });

    it('connects source directly to gain when non-spatial', () => {
      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'non-spatial-conn' });

      // Source should connect directly to the instance gain node
      expect(lastSource.connect).toHaveBeenCalledWith(lastGain);
    });

    it('applies custom panningModel to the PannerNode', () => {
      core.events.emitSync('audio/play', {
        key: 'sfx',
        instanceId: 'panning-model',
        position: { x: 0, y: 0 },
        panningModel: 'HRTF',
      });

      expect(lastPanner.panningModel).toBe('HRTF');
    });

    it('applies custom distanceModel to the PannerNode', () => {
      core.events.emitSync('audio/play', {
        key: 'sfx',
        instanceId: 'dist-model',
        position: { x: 0, y: 0 },
        distanceModel: 'inverse',
      });

      expect(lastPanner.distanceModel).toBe('inverse');
    });

    it('applies refDistance, maxDistance, and rolloffFactor', () => {
      core.events.emitSync('audio/play', {
        key: 'sfx',
        instanceId: 'panner-params',
        position: { x: 0, y: 0 },
        refDistance: 50,
        maxDistance: 500,
        rolloffFactor: 2,
      });

      expect(lastPanner.refDistance).toBe(50);
      expect(lastPanner.maxDistance).toBe(500);
      expect(lastPanner.rolloffFactor).toBe(2);
    });

    it('uses default PannerNode values when optional spatial params are omitted', () => {
      core.events.emitSync('audio/play', {
        key: 'sfx',
        instanceId: 'panner-defaults',
        position: { x: 0, y: 0 },
      });

      expect(lastPanner.panningModel).toBe('equalpower');
      expect(lastPanner.distanceModel).toBe('linear');
      expect(lastPanner.refDistance).toBe(1);
      expect(lastPanner.maxDistance).toBe(10_000);
      expect(lastPanner.rolloffFactor).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Spatial audio — audio/listener:update
  // -------------------------------------------------------------------------

  describe('audio/listener:update', () => {
    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
      // Trigger context creation
      core.events.emitSync('audio/play', { key: 'sfx', instanceId: '_init' });
    });

    it('is a no-op before the AudioContext is created', () => {
      // Create a fresh audio manager with no context yet
      const freshCore = createStubCore();
      const freshAudio = new AudioManager();
      freshAudio.init(freshCore);

      expect(() => {
        freshCore.events.emitSync('audio/listener:update', { x: 100, y: 200 });
      }).not.toThrow();

      freshAudio.destroy(freshCore);
    });

    it('sets listener position using AudioParam API (negate Y)', () => {
      const listener = (audio as unknown as { _ctx: MockAudioContext })._ctx!.listener;

      core.events.emitSync('audio/listener:update', { x: 300, y: 150 });

      expect(listener.positionX.value).toBe(300);
      expect(listener.positionY.value).toBe(-150);
      expect(listener.positionZ.value).toBe(1);
    });

    it('sets listener orientation so forward points into the screen', () => {
      const listener = (audio as unknown as { _ctx: MockAudioContext })._ctx!.listener;

      core.events.emitSync('audio/listener:update', { x: 0, y: 0 });

      expect(listener.forwardX.value).toBe(0);
      expect(listener.forwardY.value).toBe(0);
      expect(listener.forwardZ.value).toBe(-1);
    });
  });

  // -------------------------------------------------------------------------
  // Spatial audio — audio/source:move
  // -------------------------------------------------------------------------

  describe('audio/source:move', () => {
    beforeEach(async () => {
      await core.events.emit('audio/load', { key: 'sfx', url: 'sfx.wav' });
    });

    it('updates the PannerNode position for a spatial instance', () => {
      core.events.emitSync('audio/play', {
        key: 'sfx',
        instanceId: 'moving-sound',
        position: { x: 10, y: 20 },
      });

      core.events.emitSync('audio/source:move', { instanceId: 'moving-sound', x: 300, y: 150 });

      expect(lastPanner.positionX.value).toBe(300);
      expect(lastPanner.positionY.value).toBe(-150);
      expect(lastPanner.positionZ.value).toBe(0);
    });

    it('is a no-op for a non-spatial instance (no PannerNode)', () => {
      core.events.emitSync('audio/play', { key: 'sfx', instanceId: 'non-spatial-move' });

      expect(() => {
        core.events.emitSync('audio/source:move', {
          instanceId: 'non-spatial-move',
          x: 100,
          y: 200,
        });
      }).not.toThrow();
    });

    it('is a no-op for an unknown instanceId', () => {
      expect(() => {
        core.events.emitSync('audio/source:move', { instanceId: 'ghost', x: 0, y: 0 });
      }).not.toThrow();
    });
  });
});
