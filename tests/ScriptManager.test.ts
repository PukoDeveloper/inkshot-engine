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

  // -------------------------------------------------------------------------
  // Multi-instance concurrency & interruption
  // -------------------------------------------------------------------------

  describe('multi-instance concurrency', () => {
    it('two scripts with different instanceIds run concurrently', async () => {
      const order: string[] = [];
      core.events.on('test', 'script/started', (p: ScriptStartedParams) => {
        order.push(`started:${p.instanceId}`);
      });
      core.events.on('test', 'script/ended', (p: ScriptEndedParams) => {
        order.push(`ended:${p.instanceId}`);
      });

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'patrol', nodes: [{ cmd: 'hang' }] },
      });

      // Two NPC instances share the same script definition but run concurrently
      core.events.emitSync('script/run', { id: 'patrol', instanceId: 'guard-1' });
      core.events.emitSync('script/run', { id: 'patrol', instanceId: 'guard-2' });
      await flushMicrotasks();

      expect(sm.isRunning).toBe(true);
      expect(sm.runningInstances).toHaveLength(2);

      // Stop only guard-1
      core.events.emitSync('script/stop', { instanceId: 'guard-1' });
      await flushMicrotasks();

      expect(order).toContain('ended:guard-1');
      expect(order).not.toContain('ended:guard-2');
      expect(sm.runningInstances).toHaveLength(1);
      expect(sm.runningInstances[0]!.instanceId).toBe('guard-2');

      // Stop remaining
      core.events.emitSync('script/stop', {});
      await flushMicrotasks();
      expect(sm.isRunning).toBe(false);
    });

    it('same instanceId: new run replaces existing one', async () => {
      const events: string[] = [];
      core.events.on('test', 'script/started', (p: ScriptStartedParams) => {
        events.push(`started:${p.instanceId}:${p.id}`);
      });
      core.events.on('test', 'script/ended', (p: ScriptEndedParams) => {
        events.push(`ended:${p.instanceId}:${p.id}`);
      });

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'patrol', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/define', {
        script: { id: 'chase', nodes: [] },
      });

      core.events.emitSync('script/run', { id: 'patrol', instanceId: 'guard-1' });
      await flushMicrotasks();

      // Same instanceId — replaces patrol with chase
      core.events.emitSync('script/run', { id: 'chase', instanceId: 'guard-1' });
      await flushMicrotasks();

      expect(events).toContain('started:guard-1:patrol');
      expect(events).toContain('ended:guard-1:patrol');
      expect(events).toContain('started:guard-1:chase');
      expect(events).toContain('ended:guard-1:chase');
    });

    it('exclusive: true stops all running instances before starting', async () => {
      const ended: string[] = [];
      core.events.on('test', 'script/ended', (p: ScriptEndedParams) => {
        ended.push(p.instanceId);
      });

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'npc', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/define', {
        script: { id: 'cutscene', nodes: [] },
      });

      // Start two NPC instances
      core.events.emitSync('script/run', { id: 'npc', instanceId: 'npc-1' });
      core.events.emitSync('script/run', { id: 'npc', instanceId: 'npc-2' });
      await flushMicrotasks();
      expect(sm.runningInstances).toHaveLength(2);

      // Exclusive cutscene — stops everything first
      core.events.emitSync('script/run', { id: 'cutscene', exclusive: true });
      await flushMicrotasks();

      expect(ended).toContain('npc-1');
      expect(ended).toContain('npc-2');
      expect(sm.isRunning).toBe(false); // cutscene also ended (empty nodes)
    });

    it('script/stop with no instanceId stops all instances', async () => {
      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'npc', nodes: [{ cmd: 'hang' }] },
      });

      core.events.emitSync('script/run', { id: 'npc', instanceId: 'a' });
      core.events.emitSync('script/run', { id: 'npc', instanceId: 'b' });
      core.events.emitSync('script/run', { id: 'npc', instanceId: 'c' });
      await flushMicrotasks();
      expect(sm.runningInstances).toHaveLength(3);

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();
      expect(sm.isRunning).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Priority system
  // -------------------------------------------------------------------------

  describe('priority', () => {
    it('higher-priority run interrupts same-instanceId lower-priority run', async () => {
      const events: string[] = [];
      core.events.on('test', 'script/started', (p: ScriptStartedParams) => {
        events.push(`started:${p.id}`);
      });
      core.events.on('test', 'script/ended', (p: ScriptEndedParams) => {
        events.push(`ended:${p.id}`);
      });

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'patrol', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/define', {
        script: { id: 'chase', nodes: [] },
      });

      core.events.emitSync('script/run', { id: 'patrol', instanceId: 'guard', priority: 0 });
      await flushMicrotasks();

      // Higher priority wins — patrol is interrupted
      core.events.emitSync('script/run', { id: 'chase', instanceId: 'guard', priority: 10 });
      await flushMicrotasks();

      expect(events).toContain('ended:patrol');
      expect(events).toContain('started:chase');
    });

    it('lower-priority run is rejected when a higher-priority run is active', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const started = vi.fn();
      core.events.on('test', 'script/started', started);

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'chase', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/define', {
        script: { id: 'patrol', nodes: [] },
      });

      core.events.emitSync('script/run', { id: 'chase',  instanceId: 'guard', priority: 10 });
      await flushMicrotasks();

      // Lower priority should be rejected
      core.events.emitSync('script/run', { id: 'patrol', instanceId: 'guard', priority: 0 });
      await flushMicrotasks();

      expect(warnSpy).toHaveBeenCalled();
      // Only 'chase' should have started (patrol was rejected)
      expect(started).toHaveBeenCalledOnce();
      expect((started.mock.calls[0]![0] as ScriptStartedParams).id).toBe('chase');

      core.events.emitSync('script/stop', {});
      warnSpy.mockRestore();
    });

    it('equal-priority run replaces the existing one', async () => {
      const started: string[] = [];
      core.events.on('test', 'script/started', (p: ScriptStartedParams) => {
        started.push(p.id);
      });

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'patrol-a', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/define', {
        script: { id: 'patrol-b', nodes: [] },
      });

      core.events.emitSync('script/run', { id: 'patrol-a', instanceId: 'guard', priority: 5 });
      await flushMicrotasks();
      core.events.emitSync('script/run', { id: 'patrol-b', instanceId: 'guard', priority: 5 });
      await flushMicrotasks();

      expect(started).toContain('patrol-a');
      expect(started).toContain('patrol-b');
    });
  });

  // -------------------------------------------------------------------------
  // script/state:get – extended output
  // -------------------------------------------------------------------------

  describe('script/state:get (extended)', () => {
    it('instances array reflects all running scripts', async () => {
      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'npc', nodes: [{ cmd: 'hang' }] },
      });

      core.events.emitSync('script/run', { id: 'npc', instanceId: 'npc-1', priority: 2 });
      core.events.emitSync('script/run', { id: 'npc', instanceId: 'npc-2', priority: 3 });
      await flushMicrotasks();

      const { output } = core.events.emitSync<Record<string, never>, ScriptStateGetOutput>(
        'script/state:get',
        {},
      );

      expect(output.running).toBe(true);
      expect(output.instances).toHaveLength(2);

      const inst1 = output.instances.find((i) => i.instanceId === 'npc-1')!;
      const inst2 = output.instances.find((i) => i.instanceId === 'npc-2')!;
      expect(inst1).toBeDefined();
      expect(inst1.scriptId).toBe('npc');
      expect(inst1.priority).toBe(2);
      expect(inst2).toBeDefined();
      expect(inst2.priority).toBe(3);

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();
    });

    it('instances is empty when idle', () => {
      const { output } = core.events.emitSync<Record<string, never>, ScriptStateGetOutput>(
        'script/state:get',
        {},
      );
      expect(output.instances).toEqual([]);
      expect(output.running).toBe(false);
      expect(output.scriptId).toBeNull();
      expect(output.nodeIndex).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // New built-in command: wait-event
  // -------------------------------------------------------------------------

  describe('built-in: wait-event', () => {
    it('suspends until the specified event fires', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: {
          id: 'we-test',
          nodes: [{ cmd: 'wait-event', event: 'zone/entered' }],
        },
      });
      core.events.emitSync('script/run', { id: 'we-test' });
      await flushMicrotasks();

      expect(ended).not.toHaveBeenCalled(); // still waiting

      core.events.emitSync('zone/entered', {});
      await flushMicrotasks();

      expect(ended).toHaveBeenCalledOnce();
    });

    it('stores the event payload in the variable when var is specified', async () => {
      let capturedVars: Record<string, unknown> = {};

      core.events.emitSync('script/register-command', {
        cmd: 'read-vars',
        handler: (ctx) => { capturedVars = { ...ctx.vars }; },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'we-var',
          nodes: [
            { cmd: 'wait-event', event: 'enemy/died', var: 'killed' },
            { cmd: 'read-vars' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'we-var' });
      await flushMicrotasks();

      core.events.emitSync('enemy/died', { id: 'goblin' });
      await flushMicrotasks();

      expect(capturedVars.killed).toMatchObject({ id: 'goblin' });
    });

    it('is cancelled cleanly when the script is stopped', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: {
          id: 'we-stop',
          nodes: [{ cmd: 'wait-event', event: 'never/fires' }],
        },
      });
      core.events.emitSync('script/run', { id: 'we-stop' });
      await flushMicrotasks();

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();

      expect(ended).toHaveBeenCalledOnce();
      expect(sm.isRunning).toBe(false);
    });

    it('warns when event field is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: { id: 'we-bad', nodes: [{ cmd: 'wait-event' }] },
      });
      core.events.emitSync('script/run', { id: 'we-bad' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // New built-in command: call
  // -------------------------------------------------------------------------

  describe('built-in: call', () => {
    it('runs a sub-script inline and awaits its completion', async () => {
      const order: number[] = [];

      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'sub',
          nodes: [
            { cmd: 'mark', n: 2 },
            { cmd: 'mark', n: 3 },
          ],
        },
      });
      core.events.emitSync('script/define', {
        script: {
          id: 'main',
          nodes: [
            { cmd: 'mark', n: 1 },
            { cmd: 'call', id: 'sub' },
            { cmd: 'mark', n: 4 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'main' });
      await flushMicrotasks();

      expect(order).toEqual([1, 2, 3, 4]);
    });

    it('shares the variable store with the caller', async () => {
      let capturedVars: Record<string, unknown> = {};

      core.events.emitSync('script/register-command', {
        cmd: 'read-vars',
        handler: (ctx) => { capturedVars = { ...ctx.vars }; },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'sub-set',
          nodes: [{ cmd: 'set', var: 'result', value: 99 }],
        },
      });
      core.events.emitSync('script/define', {
        script: {
          id: 'main-call',
          nodes: [
            { cmd: 'call', id: 'sub-set' },
            { cmd: 'read-vars' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'main-call' });
      await flushMicrotasks();

      expect(capturedVars.result).toBe(99);
    });

    it('warns when called script id is not defined', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: { id: 'call-ghost', nodes: [{ cmd: 'call', id: 'nonexistent' }] },
      });
      core.events.emitSync('script/run', { id: 'call-ghost' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('is stopped cleanly when the parent script is stopped mid-call', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'sub-hang', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/define', {
        script: { id: 'main-hang', nodes: [{ cmd: 'call', id: 'sub-hang' }] },
      });

      core.events.emitSync('script/run', { id: 'main-hang' });
      await flushMicrotasks();

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();

      expect(ended).toHaveBeenCalledOnce();
      expect(sm.isRunning).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // New built-in command: fork
  // -------------------------------------------------------------------------

  describe('built-in: fork', () => {
    it('launches a new instance without blocking the parent', async () => {
      const order: string[] = [];

      core.events.emitSync('script/register-command', {
        cmd: 'mark-str',
        handler: (ctx) => { order.push(ctx.node.s as string); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'forked',
          nodes: [{ cmd: 'hang' }],  // hangs – parent should not wait for it
        },
      });
      core.events.emitSync('script/define', {
        script: {
          id: 'parent',
          nodes: [
            { cmd: 'fork',     id: 'forked', instanceId: 'bg' },
            { cmd: 'mark-str', s: 'after-fork' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'parent' });
      await flushMicrotasks();

      // Parent continued past the fork
      expect(order).toContain('after-fork');
      // Forked instance still running
      expect(sm.runningInstances.some((i) => i.instanceId === 'bg')).toBe(true);

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();
    });

    it('warns when fork script id is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: { id: 'fork-bad', nodes: [{ cmd: 'fork' }] },
      });
      core.events.emitSync('script/run', { id: 'fork-bad' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // New built-in command: wait-instance
  // -------------------------------------------------------------------------

  describe('built-in: wait-instance', () => {
    it('suspends the caller until the target instance ends', async () => {
      const order: string[] = [];

      core.events.emitSync('script/register-command', {
        cmd: 'mark-str',
        handler: (ctx) => { order.push(ctx.node.s as string); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'fx',
          nodes: [
            { cmd: 'wait', ms: 20 },
            { cmd: 'mark-str', s: 'fx-done' },
          ],
        },
      });
      core.events.emitSync('script/define', {
        script: {
          id: 'boss',
          nodes: [
            { cmd: 'fork',          id: 'fx', instanceId: 'fx-inst' },
            { cmd: 'wait-instance', instanceId: 'fx-inst' },
            { cmd: 'mark-str',      s: 'boss-after-fx' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'boss' });
      await new Promise<void>((resolve) => setTimeout(resolve, 60));

      expect(order.indexOf('fx-done')).toBeLessThan(order.indexOf('boss-after-fx'));
    });

    it('resolves immediately when target instance is not running', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: {
          id: 'wi-immediate',
          nodes: [{ cmd: 'wait-instance', instanceId: 'nonexistent' }],
        },
      });
      core.events.emitSync('script/run', { id: 'wi-immediate' });
      await flushMicrotasks();

      expect(ended).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // New built-in command: stop-instance
  // -------------------------------------------------------------------------

  describe('built-in: stop-instance', () => {
    it('stops the specified running instance', async () => {
      const ended: string[] = [];
      core.events.on('test', 'script/ended', (p: ScriptEndedParams) => {
        ended.push(p.instanceId);
      });

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'bg', nodes: [{ cmd: 'hang' }] },
      });
      core.events.emitSync('script/define', {
        script: {
          id: 'controller',
          nodes: [
            { cmd: 'fork',          id: 'bg', instanceId: 'bg-inst' },
            { cmd: 'stop-instance', instanceId: 'bg-inst' },
          ],
        },
      });

      core.events.emitSync('script/run', { id: 'controller' });
      await flushMicrotasks();

      expect(ended).toContain('bg-inst');
    });

    it('warns when instanceId field is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: { id: 'si-bad', nodes: [{ cmd: 'stop-instance' }] },
      });
      core.events.emitSync('script/run', { id: 'si-bad' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
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

    it('runningInstances returns all active instances', async () => {
      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx) => new Promise<void>((resolve) => ctx.onStop(resolve)),
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: { id: 'npc', nodes: [{ cmd: 'hang' }] },
      });

      core.events.emitSync('script/run', { id: 'npc', instanceId: 'n1', priority: 1 });
      core.events.emitSync('script/run', { id: 'npc', instanceId: 'n2', priority: 2 });
      await flushMicrotasks();

      const instances = sm.runningInstances;
      expect(instances).toHaveLength(2);
      expect(instances.find((i) => i.instanceId === 'n1')?.priority).toBe(1);
      expect(instances.find((i) => i.instanceId === 'n2')?.priority).toBe(2);

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();
    });
  });

  // -------------------------------------------------------------------------
  // Bug fix: if command warns when label is missing
  // -------------------------------------------------------------------------

  describe('bug fix: if warns on missing label', () => {
    it('emits console.warn when the jump label does not exist', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      core.events.emitSync('script/define', {
        script: {
          id: 'if-missing-label',
          nodes: [
            { cmd: 'set', var: 'x', value: 1 },
            { cmd: 'if',  var: 'x', value: 1, jump: 'nonexistent-label' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'if-missing-label' });
      await flushMicrotasks();

      expect(warnSpy).toHaveBeenCalled();
      const msg = warnSpy.mock.calls.find(
        (c) => String(c[0]).includes('nonexistent-label'),
      );
      expect(msg).toBeDefined();
      warnSpy.mockRestore();
    });

    it('does not warn when condition is false (label lookup is skipped)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      core.events.emitSync('script/define', {
        script: {
          id: 'if-false-no-warn',
          nodes: [
            { cmd: 'set', var: 'x', value: 0 },
            { cmd: 'if',  var: 'x', value: 1, jump: 'nonexistent-label' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'if-false-no-warn' });
      await flushMicrotasks();

      const labelsWarn = warnSpy.mock.calls.find(
        (c) => String(c[0]).includes('nonexistent-label'),
      );
      expect(labelsWarn).toBeUndefined();
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // New built-in command: if-not
  // -------------------------------------------------------------------------

  describe('built-in: if-not', () => {
    it('jumps when vars[var] !== value', async () => {
      const order: number[] = [];
      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'ifnot-taken',
          nodes: [
            { cmd: 'set',    var: 'x', value: 0 },
            { cmd: 'if-not', var: 'x', value: 1, jump: 'branch' },
            { cmd: 'mark',   n: 99 },   // should be skipped
            { cmd: 'label',  name: 'branch' },
            { cmd: 'mark',   n: 1 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'ifnot-taken' });
      await flushMicrotasks();

      expect(order).toEqual([1]);
    });

    it('does NOT jump when vars[var] === value', async () => {
      const order: number[] = [];
      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'ifnot-not-taken',
          nodes: [
            { cmd: 'set',    var: 'x', value: 1 },
            { cmd: 'if-not', var: 'x', value: 1, jump: 'branch' },
            { cmd: 'mark',   n: 1 },
            { cmd: 'label',  name: 'branch' },
            { cmd: 'mark',   n: 2 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'ifnot-not-taken' });
      await flushMicrotasks();

      expect(order).toEqual([1, 2]);
    });

    it('warns when required fields are missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: { id: 'ifnot-bad', nodes: [{ cmd: 'if-not', var: 'x' }] },
      });
      core.events.emitSync('script/run', { id: 'ifnot-bad' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('warns when jump label is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: {
          id: 'ifnot-no-label',
          nodes: [
            { cmd: 'set',    var: 'x', value: 0 },
            { cmd: 'if-not', var: 'x', value: 1, jump: 'ghost' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'ifnot-no-label' });
      await flushMicrotasks();
      const msg = warnSpy.mock.calls.find((c) => String(c[0]).includes('ghost'));
      expect(msg).toBeDefined();
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // New built-in commands: if-gt / if-lt
  // -------------------------------------------------------------------------

  describe('built-in: if-gt', () => {
    it('jumps when vars[var] > value', async () => {
      const order: number[] = [];
      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'ifgt-taken',
          nodes: [
            { cmd: 'set',   var: 'score', value: 100 },
            { cmd: 'if-gt', var: 'score', value: 50, jump: 'high' },
            { cmd: 'mark',  n: 99 },     // skipped
            { cmd: 'label', name: 'high' },
            { cmd: 'mark',  n: 1 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'ifgt-taken' });
      await flushMicrotasks();

      expect(order).toEqual([1]);
    });

    it('does NOT jump when vars[var] === value', async () => {
      const order: number[] = [];
      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'ifgt-equal',
          nodes: [
            { cmd: 'set',   var: 'score', value: 50 },
            { cmd: 'if-gt', var: 'score', value: 50, jump: 'high' },
            { cmd: 'mark',  n: 1 },
            { cmd: 'label', name: 'high' },
            { cmd: 'mark',  n: 2 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'ifgt-equal' });
      await flushMicrotasks();

      expect(order).toEqual([1, 2]);
    });

    it('warns when value is not a number', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: {
          id: 'ifgt-bad',
          nodes: [{ cmd: 'if-gt', var: 'x', value: 'not-a-number', jump: 'somewhere' }],
        },
      });
      core.events.emitSync('script/run', { id: 'ifgt-bad' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('built-in: if-lt', () => {
    it('jumps when vars[var] < value', async () => {
      const order: number[] = [];
      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'iflt-taken',
          nodes: [
            { cmd: 'set',   var: 'hp', value: 10 },
            { cmd: 'if-lt', var: 'hp', value: 50, jump: 'low-hp' },
            { cmd: 'mark',  n: 99 },    // skipped
            { cmd: 'label', name: 'low-hp' },
            { cmd: 'mark',  n: 1 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'iflt-taken' });
      await flushMicrotasks();

      expect(order).toEqual([1]);
    });

    it('does NOT jump when vars[var] >= value', async () => {
      const order: number[] = [];
      core.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { order.push(ctx.node.n as number); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'iflt-not-taken',
          nodes: [
            { cmd: 'set',   var: 'hp', value: 50 },
            { cmd: 'if-lt', var: 'hp', value: 50, jump: 'low-hp' },
            { cmd: 'mark',  n: 1 },
            { cmd: 'label', name: 'low-hp' },
            { cmd: 'mark',  n: 2 },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'iflt-not-taken' });
      await flushMicrotasks();

      expect(order).toEqual([1, 2]);
    });

    it('warns when required fields are missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: { id: 'iflt-bad', nodes: [{ cmd: 'if-lt', var: 'x' }] },
      });
      core.events.emitSync('script/run', { id: 'iflt-bad' });
      await flushMicrotasks();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Enhanced built-in: wait-event with timeout
  // -------------------------------------------------------------------------

  describe('built-in: wait-event — timeout', () => {
    it('continues normally when the event fires before the timeout', async () => {
      const order: string[] = [];
      core.events.emitSync('script/register-command', {
        cmd: 'mark-str',
        handler: (ctx) => { order.push(ctx.node.s as string); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'we-timeout-not-hit',
          nodes: [
            { cmd: 'wait-event', event: 'npc/arrived', timeout: 5000 },
            { cmd: 'mark-str',   s: 'after-event' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'we-timeout-not-hit' });
      await flushMicrotasks();

      // Fire the event before timeout expires
      core.events.emitSync('npc/arrived', {});
      await flushMicrotasks();

      expect(order).toContain('after-event');
    });

    it('continues from next node when timeout fires and no timeoutJump', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: {
          id: 'we-timeout-fallthrough',
          nodes: [{ cmd: 'wait-event', event: 'never/fires', timeout: 10 }],
        },
      });
      core.events.emitSync('script/run', { id: 'we-timeout-fallthrough' });

      // Wait for the 10 ms timeout
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(ended).toHaveBeenCalledOnce();
      expect(sm.isRunning).toBe(false);
    });

    it('jumps to timeoutJump label when timeout fires', async () => {
      const order: string[] = [];
      core.events.emitSync('script/register-command', {
        cmd: 'mark-str',
        handler: (ctx) => { order.push(ctx.node.s as string); },
      } satisfies ScriptRegisterCommandParams);

      core.events.emitSync('script/define', {
        script: {
          id: 'we-timeout-jump',
          nodes: [
            { cmd: 'wait-event', event: 'never/fires', timeout: 10, timeoutJump: 'fallback' },
            { cmd: 'mark-str',   s: 'should-not-run' },
            { cmd: 'jump',       target: 'done' },
            { cmd: 'label',      name: 'fallback' },
            { cmd: 'mark-str',   s: 'timed-out' },
            { cmd: 'label',      name: 'done' },
          ],
        },
      });
      core.events.emitSync('script/run', { id: 'we-timeout-jump' });

      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(order).toContain('timed-out');
      expect(order).not.toContain('should-not-run');
    });

    it('does not fire the timeout when the script is stopped first', async () => {
      const ended = vi.fn();
      core.events.on('test', 'script/ended', ended);

      core.events.emitSync('script/define', {
        script: {
          id: 'we-stop-before-timeout',
          nodes: [{ cmd: 'wait-event', event: 'never/fires', timeout: 5000 }],
        },
      });
      core.events.emitSync('script/run', { id: 'we-stop-before-timeout' });
      await flushMicrotasks();

      core.events.emitSync('script/stop', {});
      await flushMicrotasks();

      expect(ended).toHaveBeenCalledOnce();
      expect(sm.isRunning).toBe(false);
    });

    it('warns when timeoutJump label does not exist', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('script/define', {
        script: {
          id: 'we-timeout-bad-label',
          nodes: [{ cmd: 'wait-event', event: 'never/fires', timeout: 10, timeoutJump: 'ghost' }],
        },
      });
      core.events.emitSync('script/run', { id: 'we-timeout-bad-label' });
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      const msg = warnSpy.mock.calls.find((c) => String(c[0]).includes('ghost'));
      expect(msg).toBeDefined();
      warnSpy.mockRestore();
    });
  });
});
