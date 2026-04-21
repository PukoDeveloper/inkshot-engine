// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { InputManager } from '../src/plugins/input/InputManager.js';
import { InputRecorder } from '../src/plugins/input/InputRecorder.js';
import type { Core } from '../src/core/Core.js';
import type {
  InputRecording,
  InputRecorderStopOutput,
  InputRecorderPlayParams,
  InputRecorderStateOutput,
  InputRecorderPlaybackEndParams,
  InputRecorderSaveParams,
  InputRecorderLoadParams,
  InputRecorderLoadOutput,
} from '../src/types/input.js';

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

function tick(core: Core): void {
  core.events.emitSync('core/tick', { delta: 1, elapsed: 16 });
}

/** Fire a keyboard event on window. */
function fireKey(type: 'keydown' | 'keyup', code: string, key = code): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, key }));
}

/** Fire a pointer (mouse) event on window. */
function firePointer(
  type: 'pointerdown' | 'pointerup',
  opts: { clientX?: number; clientY?: number; button?: number } = {},
): void {
  window.dispatchEvent(
    new PointerEvent(type, {
      clientX: opts.clientX ?? 0,
      clientY: opts.clientY ?? 0,
      button: opts.button ?? 0,
      pointerType: 'mouse',
    }),
  );
}

describe('InputRecorder', () => {
  let core: Core;
  let inputManager: InputManager;
  let recorder: InputRecorder;

  beforeEach(() => {
    core = createStubCore();
    inputManager = new InputManager();
    recorder = new InputRecorder();
    inputManager.init(core);
    recorder.init(core);
  });

  afterEach(() => {
    recorder.destroy(core);
    inputManager.destroy(core);
  });

  // -------------------------------------------------------------------------
  // State query
  // -------------------------------------------------------------------------

  describe('input/recorder:state', () => {
    it('starts in idle state', () => {
      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStateOutput>(
        'input/recorder:state',
        {},
      );
      expect(output.state).toBe('idle');
      expect(output.frame).toBe(0);
    });

    it('reports "recording" after input/recorder:start', () => {
      core.events.emitSync('input/recorder:start', {});

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStateOutput>(
        'input/recorder:state',
        {},
      );
      expect(output.state).toBe('recording');
    });

    it('reports "idle" after input/recorder:stop', () => {
      core.events.emitSync('input/recorder:start', {});
      core.events.emitSync('input/recorder:stop', {});

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStateOutput>(
        'input/recorder:state',
        {},
      );
      expect(output.state).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // Recording: basic capture
  // -------------------------------------------------------------------------

  describe('recording', () => {
    it('captures key:down events while recording', () => {
      core.events.emitSync('input/recorder:start', {});

      tick(core); // frame 0
      fireKey('keydown', 'Space', ' ');
      tick(core); // frame 1

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );

      expect(output.recording).not.toBeNull();
      const rec = output.recording!;
      const keyDownEntries = rec.entries.filter((e) => e.event === 'input/key:down');
      expect(keyDownEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('captures pointer events while recording', () => {
      core.events.emitSync('input/recorder:start', {});
      tick(core);
      firePointer('pointerdown', { clientX: 50, clientY: 60, button: 0 });
      tick(core);

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      const rec = output.recording!;
      const pointerDownEntries = rec.entries.filter((e) => e.event === 'input/pointer:down');
      expect(pointerDownEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('records the frame number for each event', () => {
      core.events.emitSync('input/recorder:start', {});

      tick(core); // frame 1 within recording
      fireKey('keydown', 'KeyA', 'a');
      tick(core); // frame 2

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      const rec = output.recording!;
      const entry = rec.entries.find((e) => e.event === 'input/key:down');
      // The key was pressed during the tick at frame 1 (before the frame counter
      // increments at the start of the tick handler — so it lands on frame 1).
      expect(entry).toBeDefined();
      // The key was pressed between frame 1 and frame 2 of the recording;
      // the after-phase listener records the current recording frame at that point.
      expect(entry!.frame).toBe(1);
    });

    it('returns null recording when stop is called without start', () => {
      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      expect(output.recording).toBeNull();
    });

    it('does not capture events before start is called', () => {
      fireKey('keydown', 'KeyW', 'w');
      tick(core);

      core.events.emitSync('input/recorder:start', {});
      tick(core);

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      const rec = output.recording!;
      const entries = rec.entries.filter((e) => e.event === 'input/key:down');
      expect(entries).toHaveLength(0);
    });

    it('does not capture events after stop is called', () => {
      core.events.emitSync('input/recorder:start', {});
      tick(core);

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );

      // Fire key AFTER stopping.
      fireKey('keydown', 'KeyX', 'x');
      tick(core);

      const rec = output.recording!;
      const afterEntries = rec.entries.filter((e) => e.event === 'input/key:down');
      expect(afterEntries).toHaveLength(0);
    });

    it('stores frameCount in the recording', () => {
      core.events.emitSync('input/recorder:start', {});
      tick(core);
      tick(core);
      tick(core);

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      expect(output.recording!.frameCount).toBeGreaterThanOrEqual(3);
    });

    it('second start discards the previous recording', () => {
      core.events.emitSync('input/recorder:start', {});
      tick(core);
      fireKey('keydown', 'KeyA', 'a');
      tick(core);

      // Start a fresh recording — previous data should be discarded.
      core.events.emitSync('input/recorder:start', {});
      tick(core);

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      const keyEntries = output.recording!.entries.filter((e) => e.event === 'input/key:down');
      expect(keyEntries).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  describe('playback', () => {
    /** Helper: record key:down 'Space' over 3 frames, return the recording. */
    function recordSpaceKey(): InputRecording {
      core.events.emitSync('input/recorder:start', {});
      tick(core); // frame 0
      fireKey('keydown', 'Space', ' ');
      tick(core); // frame 1 — key down captured in after-phase
      tick(core); // frame 2
      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      return output.recording!;
    }

    it('replays recorded key:down events', () => {
      const recording = recordSpaceKey();

      const handler = vi.fn();
      core.events.on('test', 'input/key:down', handler);

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', { recording });

      // Advance frames until the recorded key:down entry fires.
      const maxFrames = recording.frameCount + 5;
      for (let i = 0; i < maxFrames; i++) {
        tick(core);
      }

      // Playback should re-emit the key:down event.
      expect(handler.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('reports "playing" state during playback', () => {
      const recording = recordSpaceKey();

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', { recording });

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStateOutput>(
        'input/recorder:state',
        {},
      );
      expect(output.state).toBe('playing');
    });

    it('emits input/recorder:playback:end when playback finishes', () => {
      const recording = recordSpaceKey();

      const endHandler = vi.fn();
      core.events.on('test', 'input/recorder:playback:end', endHandler);

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', { recording });

      // Advance past the end.
      for (let i = 0; i <= recording.frameCount + 5; i++) tick(core);

      expect(endHandler).toHaveBeenCalledOnce();
      const params = endHandler.mock.calls[0]![0] as InputRecorderPlaybackEndParams;
      expect(params.recording).toBe(recording);
    });

    it('returns to idle state after non-looping playback ends', () => {
      const recording = recordSpaceKey();

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', { recording });
      for (let i = 0; i <= recording.frameCount + 5; i++) tick(core);

      const { output } = core.events.emitSync<Record<string, never>, InputRecorderStateOutput>(
        'input/recorder:state',
        {},
      );
      expect(output.state).toBe('idle');
    });

    it('loops the recording when loop=true', () => {
      const recording = recordSpaceKey();

      const handler = vi.fn();
      core.events.on('test', 'input/key:down', handler);

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', {
        recording,
        loop: true,
      });

      // Advance 3 full loops worth of frames.
      const frames = (recording.frameCount + 2) * 3;
      for (let i = 0; i < frames; i++) tick(core);

      // The key:down event should have fired at least twice (once per loop).
      expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('does NOT emit playback:end when looping', () => {
      const recording = recordSpaceKey();

      const endHandler = vi.fn();
      core.events.on('test', 'input/recorder:playback:end', endHandler);

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', {
        recording,
        loop: true,
      });

      for (let i = 0; i <= recording.frameCount * 3; i++) tick(core);

      expect(endHandler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Pause / resume
  // -------------------------------------------------------------------------

  describe('pause and resume', () => {
    it('pauses and resumes playback', () => {
      core.events.emitSync('input/recorder:start', {});
      tick(core);
      fireKey('keydown', 'KeyA', 'a');
      tick(core);
      const { output: stopOut } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      const recording = stopOut.recording!;

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', { recording });

      core.events.emitSync('input/recorder:pause', {});

      const { output: paused } = core.events.emitSync<Record<string, never>, InputRecorderStateOutput>(
        'input/recorder:state',
        {},
      );
      expect(paused.state).toBe('paused');

      core.events.emitSync('input/recorder:resume', {});

      const { output: resumed } = core.events.emitSync<Record<string, never>, InputRecorderStateOutput>(
        'input/recorder:state',
        {},
      );
      expect(resumed.state).toBe('playing');
    });

    it('does not advance frames while paused', () => {
      core.events.emitSync('input/recorder:start', {});
      tick(core);
      fireKey('keydown', 'KeyB', 'b');
      tick(core);
      const { output: stopOut } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      const recording = stopOut.recording!;

      const handler = vi.fn();
      core.events.on('test', 'input/key:down', handler);

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', { recording });
      core.events.emitSync('input/recorder:pause', {});

      // Many ticks while paused — key:down should not fire.
      for (let i = 0; i < 20; i++) tick(core);
      expect(handler).not.toHaveBeenCalled();

      // Resume — now it should eventually fire.
      core.events.emitSync('input/recorder:resume', {});
      for (let i = 0; i <= recording.frameCount + 5; i++) tick(core);
      expect(handler.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence (SaveManager stub)
  // -------------------------------------------------------------------------

  describe('persistence (save/load)', () => {
    it('saves and loads a recording via save/global:set / save/global:get', () => {
      // Install a minimal in-memory global save store on the EventBus.
      const store = new Map<string, unknown>();
      core.events.on('test', 'save/global:set', (params: unknown) => {
        const p = params as { key: string; value: unknown };
        store.set(p.key, p.value);
      });
      core.events.on<{ key: string }, { value?: unknown }>(
        'test',
        'save/global:get',
        (params, output) => {
          output.value = store.get(params.key);
        },
      );

      // Build a minimal recording.
      core.events.emitSync('input/recorder:start', {});
      tick(core);
      fireKey('keydown', 'KeyS', 's');
      tick(core);
      const { output: stopOut } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      const recording = stopOut.recording!;

      // Save.
      core.events.emitSync<InputRecorderSaveParams>('input/recorder:save', {
        slotId: 'test-slot',
        recording,
      });

      // Load.
      const { output: loadOut } = core.events.emitSync<
        InputRecorderLoadParams,
        InputRecorderLoadOutput
      >('input/recorder:load', { slotId: 'test-slot' });

      expect(loadOut.recording).not.toBeNull();
      expect(loadOut.recording!.version).toBe(1);
      expect(loadOut.recording!.entries.length).toBe(recording.entries.length);
    });

    it('returns null when no recording is stored for the given slotId', () => {
      // No save/global:get handler — load should silently return null.
      const { output } = core.events.emitSync<InputRecorderLoadParams, InputRecorderLoadOutput>(
        'input/recorder:load',
        { slotId: 'nonexistent' },
      );
      expect(output.recording).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops recording on destroy and does not throw', () => {
      core.events.emitSync('input/recorder:start', {});
      expect(() => recorder.destroy(core)).not.toThrow();
    });

    it('does not advance playback after destroy', () => {
      core.events.emitSync('input/recorder:start', {});
      tick(core);
      fireKey('keydown', 'KeyD', 'd');
      tick(core);
      const { output: stopOut } = core.events.emitSync<Record<string, never>, InputRecorderStopOutput>(
        'input/recorder:stop',
        {},
      );
      const recording = stopOut.recording!;

      const handler = vi.fn();
      core.events.on('test', 'input/key:down', handler);

      core.events.emitSync<InputRecorderPlayParams>('input/recorder:play', { recording });

      recorder.destroy(core);

      for (let i = 0; i <= recording.frameCount + 5; i++) tick(core);

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
