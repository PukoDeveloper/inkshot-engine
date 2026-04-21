import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { CutscenePlugin } from '../src/plugins/CutscenePlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  CutsceneDef,
  CutsceneEndedParams,
  CutsceneStartedParams,
  CutsceneStateOutput,
  CutsceneStepStartedParams,
} from '../src/types/cutscene.js';

function createCoreStub() {
  const events = new EventBus();
  return { core: { events } as unknown as Core };
}

function makeDef(overrides: Partial<CutsceneDef> = {}): CutsceneDef {
  return { id: 'test', skippable: true, steps: [{ kind: 'wait', duration: 500 }], ...overrides };
}

describe('CutscenePlugin', () => {
  let core: Core;
  let plugin: CutscenePlugin;

  beforeEach(() => {
    ({ core } = createCoreStub());
    plugin = new CutscenePlugin();
    plugin.init(core);
  });

  describe('cutscene/define', () => {
    it('registers a cutscene definition', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'intro' }) });
      const { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.status).toBe('idle');
    });
  });

  describe('cutscene/play', () => {
    it('starts a registered cutscene', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'intro' }) });
      core.events.emitSync('cutscene/play', { id: 'intro' });
      const { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.status).toBe('playing');
      expect(output.cutsceneId).toBe('intro');
    });

    it('emits cutscene/started', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'intro' }) });
      const started: CutsceneStartedParams[] = [];
      core.events.on('t', 'cutscene/started', (p: CutsceneStartedParams) => started.push(p));
      core.events.emitSync('cutscene/play', { id: 'intro' });
      expect(started).toHaveLength(1);
      expect(started[0]!.id).toBe('intro');
    });

    it('warns and does nothing when a cutscene is already playing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'a' }) });
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'b' }) });
      core.events.emitSync('cutscene/play', { id: 'a' });
      core.events.emitSync('cutscene/play', { id: 'b' });
      expect(warnSpy).toHaveBeenCalled();
      const { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.cutsceneId).toBe('a');
      warnSpy.mockRestore();
    });

    it('warns for unknown cutscene ids', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('cutscene/play', { id: 'missing' });
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('wait step', () => {
    it('advances and completes a wait step after the duration', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'w', steps: [{ kind: 'wait', duration: 200 }] }) });
      core.events.emitSync('cutscene/play', { id: 'w' });
      core.events.emitSync('core/update', { dt: 100, tick: 1 });
      let { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.status).toBe('playing');
      core.events.emitSync('core/update', { dt: 150, tick: 2 });
      ({ output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {}));
      expect(output.status).toBe('idle');
    });

    it('emits cutscene/ended when all steps complete', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'end', steps: [{ kind: 'wait', duration: 10 }] }) });
      const ended: CutsceneEndedParams[] = [];
      core.events.on('t', 'cutscene/ended', (p: CutsceneEndedParams) => ended.push(p));
      core.events.emitSync('cutscene/play', { id: 'end' });
      core.events.emitSync('core/update', { dt: 20, tick: 1 });
      expect(ended).toHaveLength(1);
      expect(ended[0]!.skipped).toBe(false);
    });
  });

  describe('instant steps', () => {
    it('emit step advances immediately', () => {
      const emitted: unknown[] = [];
      core.events.on('t', 'custom/event', (p: unknown) => emitted.push(p));
      core.events.emitSync('cutscene/define', {
        cutscene: makeDef({ id: 'emit_test', steps: [{ kind: 'emit', event: 'custom/event', params: { value: 42 } }, { kind: 'wait', duration: 50 }] }),
      });
      core.events.emitSync('cutscene/play', { id: 'emit_test' });
      expect(emitted).toHaveLength(1);
      const { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.status).toBe('playing');
    });

    it('lock-input / unlock-input steps complete instantly', () => {
      core.events.emitSync('cutscene/define', {
        cutscene: makeDef({ id: 'lock_test', steps: [{ kind: 'lock-input' }, { kind: 'unlock-input' }, { kind: 'wait', duration: 50 }] }),
      });
      core.events.emitSync('cutscene/play', { id: 'lock_test' });
      const { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.stepIndex).toBe(2);
    });
  });

  describe('cutscene/skip', () => {
    it('marks the cutscene as skipping and ends it on next update', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'sk', skippable: true, steps: [{ kind: 'wait', duration: 10000 }] }) });
      const ended: CutsceneEndedParams[] = [];
      core.events.on('t', 'cutscene/ended', (p: CutsceneEndedParams) => ended.push(p));
      core.events.emitSync('cutscene/play', { id: 'sk' });
      core.events.emitSync('cutscene/skip', {});
      core.events.emitSync('core/update', { dt: 16, tick: 1 });
      expect(ended).toHaveLength(1);
      expect(ended[0]!.skipped).toBe(true);
    });

    it('does not skip non-skippable cutscenes', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'ns', skippable: false, steps: [{ kind: 'wait', duration: 10000 }] }) });
      core.events.emitSync('cutscene/play', { id: 'ns' });
      core.events.emitSync('cutscene/skip', {});
      core.events.emitSync('core/update', { dt: 16, tick: 1 });
      const { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.status).toBe('playing');
    });
  });

  describe('cutscene/stop', () => {
    it('ends the cutscene immediately and marks it skipped', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'stop_me', steps: [{ kind: 'wait', duration: 10000 }] }) });
      const ended: CutsceneEndedParams[] = [];
      core.events.on('t', 'cutscene/ended', (p: CutsceneEndedParams) => ended.push(p));
      core.events.emitSync('cutscene/play', { id: 'stop_me' });
      core.events.emitSync('cutscene/stop', {});
      expect(ended).toHaveLength(1);
      expect(ended[0]!.skipped).toBe(true);
      const { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.status).toBe('idle');
    });
  });

  describe('multi-step cutscene', () => {
    it('emits step:started for each step', () => {
      const stepStarts: CutsceneStepStartedParams[] = [];
      core.events.on('t', 'cutscene/step:started', (p: CutsceneStepStartedParams) => stepStarts.push(p));
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'multi', steps: [{ kind: 'wait', duration: 10 }, { kind: 'wait', duration: 10 }] }) });
      core.events.emitSync('cutscene/play', { id: 'multi' });
      expect(stepStarts[0]!.stepIndex).toBe(0);
      core.events.emitSync('core/update', { dt: 20, tick: 1 });
      expect(stepStarts[1]!.stepIndex).toBe(1);
    });
  });

  describe('camera steps', () => {
    it('camera-shake step completes instantly', () => {
      const shakes: unknown[] = [];
      core.events.on('t', 'camera/shake', (p: unknown) => shakes.push(p));
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'shake', steps: [{ kind: 'camera-shake', intensity: 10, duration: 500 }, { kind: 'wait', duration: 50 }] }) });
      core.events.emitSync('cutscene/play', { id: 'shake' });
      expect(shakes).toHaveLength(1);
      const { output } = core.events.emitSync<object, CutsceneStateOutput>('cutscene/state', {});
      expect(output.stepIndex).toBe(1);
    });

    it('camera-move step with duration=0 completes instantly', () => {
      const moves: unknown[] = [];
      core.events.on('t', 'camera/move', (p: unknown) => moves.push(p));
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'cam_move', steps: [{ kind: 'camera-move', x: 100, y: 200, duration: 0 }, { kind: 'wait', duration: 50 }] }) });
      core.events.emitSync('cutscene/play', { id: 'cam_move' });
      expect(moves).toHaveLength(1);
    });
  });

  describe('direct API', () => {
    it('isPlaying returns false when idle', () => {
      expect(plugin.isPlaying()).toBe(false);
    });

    it('isPlaying returns true when a cutscene is running', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'ip', steps: [{ kind: 'wait', duration: 1000 }] }) });
      core.events.emitSync('cutscene/play', { id: 'ip' });
      expect(plugin.isPlaying()).toBe(true);
    });
  });

  describe('destroy', () => {
    it('clears active cutscene and removes listeners', () => {
      core.events.emitSync('cutscene/define', { cutscene: makeDef({ id: 'd', steps: [{ kind: 'wait', duration: 1000 }] }) });
      core.events.emitSync('cutscene/play', { id: 'd' });
      plugin.destroy(core);
      const { output } = core.events.emitSync<object, Partial<CutsceneStateOutput>>('cutscene/state', {});
      expect(output.status).toBeUndefined();
    });
  });
});
