import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { ScriptManager } from '../src/plugins/ScriptManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  ScriptDef,
  ScriptStartedParams,
  ScriptEndedParams,
  ScriptStepParams,
  ScriptErrorParams,
  ScriptStateGetOutput,
  ScriptRegisterCommandParams,
} from '../src/types/script.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

/**
 * Run a script to completion (all commands are synchronous or the test uses
 * `await flushMicrotasks()` to let the async loop advance).
 */
async function flushMicrotasks(): Promise<void> {
  // Yield to the event loop to let pending microtasks (Promise callbacks) run.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScriptManager', () => {
  let core: Core;
  let sm: ScriptManager;

  beforeEach(() => {
    core = createStubCore();
    sm   = new ScriptManager();
    sm.init(core);
  });

  afterEach(() => {
    sm.destroy(core);
  });

  // -------------------------------------------------------------------------
  // script/define + script/run – basic execution
  // -------------------------------------------------------------------------

  describe('script/define + script/run', () => {
    it('emits script/started when a script begins', async () => {
      const handler = vi.fn();
      core.events.on('test', 'script/started', handler);

      core.events.emitSync('script/define', {
        script: { id: 'test-script', nodes: [] },
      });
      core.events.emitSync('script/run', { id: 'test-script' });
      await flushMicrotasks();

      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0]![0] as ScriptStartedParams).id).toBe('test-script');
    });

    it('emits script/ended when all nodes have executed', async () => {
      const handler = vi.fn();
      core.events.on('test', 'script/ended', handler);

      core.events.emitSync('script/define', {
        script: { id: 's', nodes: [{ cmd: 'label', name: 'noop' }] },
      });
      core.events.emitSync('script/run', { id: 's' });
      await flushMicrotasks();

      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0]![0] as ScriptEndedParams).id).toBe('s');
    });

    it('emits script/step before each command', async () => {
      const steps: ScriptStepParams[] = [];
      core.events.on('test', 'script/step', (p: ScriptStepParams) => steps.push(p));

      const script: ScriptDef = {
        id: 'seq',
        nodes: [
          { cmd: 'label', name: 'a' },
          { cmd: 'label', name: 'b' },
          { cmd: 'label', name: 'c' },
        ],
      };
      core.events.emitSync('script/define', { script });
      core.events.emitSync('script/run', { id: 'seq' });
      await flushMicrotasks();

      expect(steps).toHaveLength(3);
      expect(steps[0]).toMatchObject({ id: 'seq', index: 0, cmd: 'label' });
      expect(steps[1]).toMatchObject({ id: 'seq', index: 1, cmd: 'label' });
      expect(steps[2]).toMatchObject({ id: 'seq', index: 2, cmd: 'label' });
    });

    it('warns and skips unknown commands', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: { id: 'x', nodes: [{ cmd: 'not-a-real-command' }] },
      });
      core.events.emitSync('script/run', { id: 'x' });
      await flushMicrotasks();

      expect(warnSpy).toHaveBeenCalled();
      expect(ended).toHaveBeenCalledOnce(); // script still ends normally
      warnSpy.mockRestore();
    });

    it('warns when running an undefined script', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/run', { id: 'ghost' });
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('forwards seed vars into the script context', async () => {
      const captured: Record<string, unknown> = {};

      core.events.emitSync('script/register-command', {
        cmd: 'capture-vars',
        handler: (ctx) => {
          Object.assign(captured, ctx.vars);
        },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'seed', nodes: [{ cmd: 'capture-vars' }] },
      });
      core.events.emitSync('script/run', { id: 'seed', vars: { npc: 'guard', level: 3 } });
      await flushMicrotasks();

      expect(captured).toMatchObject({ npc: 'guard', level: 3 });
    });
  });

  // -------------------------------------------------------------------------
  // script/stop
  // -------------------------------------------------------------------------

  describe('script/stop', () => {
    it('emits script/ended and clears isRunning', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: { id: 'long', nodes: [{ cmd: 'label', name: 'a' }] },
      });
      core.events.emitSync('script/run', { id: 'long' });
      // Stop before the async loop finishes
      core.events.emitSync('script/stop', {});
      await flushMicrotasks();

      // ended may fire from stop or from natural completion; should fire exactly once
      expect(ended).toHaveBeenCalledOnce();
    });

    it('sets isRunning to false', async () => {
      core.events.emitSync('script/define', {
        script: { id: 's2', nodes: [] },
      });
      core.events.emitSync('script/run', { id: 's2' });
      core.events.emitSync('script/stop', {});
      await flushMicrotasks();

      expect(sm.isRunning).toBe(false);
    });

    it('ctx.stop() halts execution mid-script', async () => {
      const reached = vi.fn();

      core.events.emitSync('script/register-command', {
        cmd: 'halt',
        handler: (ctx) => ctx.stop(),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/register-command', {
        cmd: 'should-not-run',
        handler: reached,
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'mid-stop',
          nodes: [{ cmd: 'halt' }, { cmd: 'should-not-run' }],
        },
      });
      core.events.emitSync('script/run', { id: 'mid-stop' });
      await flushMicrotasks();

      expect(reached).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // script/state:get
  // -------------------------------------------------------------------------

  describe('script/state:get', () => {
    it('returns running=false when idle', () => {
      const { output } = core.events.emitSync<Record<string, never>, ScriptStateGetOutput>(
        'script/state:get',
        {},
      );
      expect(output.running).toBe(false);
      expect(output.scriptId).toBeNull();
    });

    it('returns running=true while a script is pending', async () => {
      // Use a custom async command to keep the script alive
      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => {
          ctx.onStop(resolve);
        }),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'hang-script', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/run', { id: 'hang-script' });
      // Let the loop reach the 'hang' command
      await flushMicrotasks();

      const { output } = core.events.emitSync<Record<string, never>, ScriptStateGetOutput>(
        'script/state:get',
        {},
      );
      expect(output.running).toBe(true);
      expect(output.scriptId).toBe('hang-script');

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();
    });
  });

  // -------------------------------------------------------------------------
  // script/register-command
  // -------------------------------------------------------------------------

  describe('script/register-command', () => {
    it('registers a custom command that executes', async () => {
      const fn = vi.fn();
      core.events.emitSync<ScriptRegisterCommandParams>('script/register-command', {
        cmd: 'custom',
        handler: fn,
      });

      core.events.emitSync('script/define', {
        script: { id: 'c', nodes: [{ cmd: 'custom', payload: 42 }] },
      });
      core.events.emitSync('script/run', { id: 'c' });
      await flushMicrotasks();

      expect(fn).toHaveBeenCalledOnce();
      expect(fn.mock.calls[0]![0].node.payload).toBe(42);
    });

    it('constructor commands are available immediately', async () => {
      const fn = vi.fn();
      const localCore = createStubCore();
      const localSm = new ScriptManager({ commands: { 'ctor-cmd': fn } });
      localSm.init(localCore);

      localCore.events.emitSync('script/define', {
        script: { id: 'ctor', nodes: [{ cmd: 'ctor-cmd' }] },
      });
      localCore.events.emitSync('script/run', { id: 'ctor' });
      await flushMicrotasks();

      expect(fn).toHaveBeenCalledOnce();
      localSm.destroy(localCore);
    });

    it('constructor command can override a built-in command', async () => {
      const customEnd = vi.fn();
      const localCore = createStubCore();
      const localSm = new ScriptManager({ commands: { end: customEnd } });
      localSm.init(localCore);

      localCore.events.emitSync('script/define', {
        script: { id: 'override', nodes: [{ cmd: 'end' }] },
      });
      localCore.events.emitSync('script/run', { id: 'override' });
      await flushMicrotasks();

      expect(customEnd).toHaveBeenCalledOnce();
      localSm.destroy(localCore);
    });
  });

  // -------------------------------------------------------------------------
  // Built-in commands
  // -------------------------------------------------------------------------

  describe('built-in: set', () => {
    it('writes a value into the variable store', async () => {
      let capturedVars: Record<string, unknown> = {};

      core.events.emitSync('script/register-command', {
        cmd: 'read-vars',
        handler: (ctx) => { capturedVars = { ...ctx.vars }; },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'set-test',
          nodes: [
            { cmd: 'set', var: 'score', value: 100 },
            { cmd: 'read-vars' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'set-test' });
      await flushMicrotasks();

      expect(capturedVars.score).toBe(100);
    });

    it('warns when "var" field is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: { id: 'bad-set', nodes: [{ cmd: 'set', value: 1 }] },
      });
      core.events.emitSync('script/run', { id: 'bad-set' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('built-in: jump', () => {
    it('jumps to the target label', async () => {
      const order: number[] = [];

      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'jump-test',
          nodes: [
            { cmd: 'mark',  n: 1 },
            { cmd: 'jump',  target: 'skip-to' },
            { cmd: 'mark',  n: 2 }, // should be skipped
            { cmd: 'label', name: 'skip-to' },
            { cmd: 'mark',  n: 3 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'jump-test' });
      await flushMicrotasks();

      expect(order).toEqual([1, 3]);
    });

    it('warns when target label is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: { id: 'bad-jump', nodes: [{ cmd: 'jump', target: 'ghost' }] },
      });
      core.events.emitSync('script/run', { id: 'bad-jump' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('built-in: if', () => {
    it('jumps when the condition is true', async () => {
      const order: number[] = [];

      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'if-true',
          nodes: [
            { cmd: 'set',   var: 'x', value: 1 },
            { cmd: 'if',    var: 'x', value: 1, jump: 'taken' },
            { cmd: 'mark',  n: 99 }, // should be skipped
            { cmd: 'label', name: 'taken' },
            { cmd: 'mark',  n: 1 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'if-true' });
      await flushMicrotasks();

      expect(order).toEqual([1]);
    });

    it('does NOT jump when the condition is false', async () => {
      const order: number[] = [];

      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'if-false',
          nodes: [
            { cmd: 'set',   var: 'x', value: 0 },
            { cmd: 'if',    var: 'x', value: 1, jump: 'branch' },
            { cmd: 'mark',  n: 1 }, // should run
            { cmd: 'label', name: 'branch' },
            { cmd: 'mark',  n: 2 }, // also runs (we just didn't skip here)
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'if-false' });
      await flushMicrotasks();

      expect(order).toEqual([1, 2]);
    });
  });

  describe('built-in: emit', () => {
    it('fires a custom event synchronously', async () => {
      const handler = vi.fn();
      core.events.on('test', 'my/custom-event', handler);

      core.events.emitSync('script/define', {
        script: {
          id: 'emit-test',
          nodes: [{ cmd: 'emit', event: 'my/custom-event', params: { foo: 'bar' } }],
        },
      });
      core.events.emitSync('script/run', { id: 'emit-test' });
      await flushMicrotasks();

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![0]).toMatchObject({ foo: 'bar' });
    });
  });

  describe('built-in: wait', () => {
    it('resolves after the specified duration', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: { id: 'wait-test', nodes: [{ cmd: 'wait', ms: 10 }] },
      });
      core.events.emitSync('script/run', { id: 'wait-test' });

      // Not done yet
      expect(ended).not.toHaveBeenCalled();

      // Wait longer than the 10 ms timer
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(ended).toHaveBeenCalledOnce();
    });

    it('is cancelled cleanly when the script is stopped', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: { id: 'wait-stop', nodes: [{ cmd: 'wait', ms: 5000 }] },
      });
      core.events.emitSync('script/run', { id: 'wait-stop' });
      await flushMicrotasks();

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();

      expect(ended).toHaveBeenCalledOnce();
      expect(sm.isRunning).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('emits script/error and stops when a command throws', async () => {
      const errorHandler = vi.fn();
      core.events.on('test', 'script/error', errorHandler);

      const afterError = vi.fn();

      core.events.emitSync('script/register-command', {
        cmd: 'boom',
        handler: () => { throw new Error('test error'); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/register-command', {
        cmd: 'after-error',
        handler: afterError,
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'err',
          nodes: [{ cmd: 'boom' }, { cmd: 'after-error' }],
        },
      });
      core.events.emitSync('script/run', { id: 'err' });
      await flushMicrotasks();

      expect(errorHandler).toHaveBeenCalledOnce();
      const p = errorHandler.mock.calls[0]![0] as ScriptErrorParams;
      expect(p.cmd).toBe('boom');
      expect(p.message).toBe('test error');
      expect(afterError).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Starting a new script while one is running
  // -------------------------------------------------------------------------

  describe('starting a new script interrupts the current one', () => {
    it('emits ended for the old script and started for the new one', async () => {
      const events: string[] = [];
      core.events.on('test', 'script/started', (p: ScriptStartedParams) => {
        events.push(`started:${p.id}`);
      });
      core.events.on('test', 'script/ended', (p: ScriptEndedParams) => {
        events.push(`ended:${p.id}`);
      });

      // Script A: uses a custom async command that hangs until stopped
      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'A', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/define', {
        script: { id: 'B', nodes: [] },
      });

      core.events.emitSync('script/run', { id: 'A' });
      await flushMicrotasks();

      core.events.emitSync('script/run', { id: 'B' });
      await flushMicrotasks();

      expect(events).toContain('started:A');
      expect(events).toContain('ended:A');
      expect(events).toContain('started:B');
      expect(events).toContain('ended:B');
    });
  });

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  describe('accessors', () => {
    it('isRunning is false when idle', () => {
      expect(sm.isRunning).toBe(false);
    });

    it('currentScriptId is null when idle', () => {
      expect(sm.currentScriptId).toBeNull();
    });

    it('currentScriptId reflects the running script', async () => {
      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'active', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/run', { id: 'active' });
      await flushMicrotasks();

      expect(sm.currentScriptId).toBe('active');

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();

      expect(sm.currentScriptId).toBeNull();
    });
  });
});
