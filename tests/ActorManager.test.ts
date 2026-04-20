import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { ActorManager } from '../src/plugins/ActorManager.js';
import { ScriptManager } from '../src/plugins/ScriptManager.js';
import type { Core } from '../src/core/Core.js';
import type { ActorDef, ActorSpawnOutput } from '../src/types/actor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Minimal ActorDef with a single label-only script. */
function makeSimpleDef(id = 'hero'): ActorDef {
  return {
    id,
    scripts: [{ id: `${id}-idle`, nodes: [{ cmd: 'label', name: 'idle' }] }],
    triggers: [],
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('ActorManager', () => {
  let core: Core;
  let sm: ScriptManager;
  let am: ActorManager;

  beforeEach(() => {
    core = createStubCore();
    sm   = new ScriptManager();
    am   = new ActorManager();
    sm.init(core);
    am.init(core);
  });

  afterEach(() => {
    am.destroy(core);
    sm.destroy(core);
  });

  // -------------------------------------------------------------------------
  // actor/define
  // -------------------------------------------------------------------------

  describe('actor/define', () => {
    it('registers scripts with ScriptManager', async () => {
      const def: ActorDef = {
        id: 'npc',
        scripts: [{ id: 'npc-patrol', nodes: [{ cmd: 'label', name: 'loop' }] }],
        triggers: [],
      };
      core.events.emitSync('actor/define', { def });

      // ScriptManager should now know about npc-patrol.
      const started = vi.fn();
      core.events.on('test', 'script/started', started);
      core.events.emitSync('script/run', { id: 'npc-patrol' });
      await flushMicrotasks();

      expect(started).toHaveBeenCalledOnce();
    });

    it('registers multiple scripts at once', () => {
      const def: ActorDef = {
        id: 'merchant',
        scripts: [
          { id: 'merchant-patrol',   nodes: [] },
          { id: 'merchant-dialogue', nodes: [] },
        ],
        triggers: [],
      };
      core.events.emitSync('actor/define', { def });

      const startedIds: string[] = [];
      core.events.on('test', 'script/started', (p: { id: string }) => {
        startedIds.push(p.id);
      });

      core.events.emitSync('script/run', { id: 'merchant-patrol',   instanceId: 'a' });
      core.events.emitSync('script/run', { id: 'merchant-dialogue', instanceId: 'b' });

      expect(startedIds).toContain('merchant-patrol');
      expect(startedIds).toContain('merchant-dialogue');
    });
  });

  // -------------------------------------------------------------------------
  // actor/spawn
  // -------------------------------------------------------------------------

  describe('actor/spawn', () => {
    it('emits actor/spawned after successful spawn', () => {
      const spawned = vi.fn();
      core.events.on('test', 'actor/spawned', spawned);

      core.events.emitSync('actor/define', { def: makeSimpleDef('hero') });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'hero-1' });

      expect(spawned).toHaveBeenCalledOnce();
      expect(spawned.mock.calls[0]![0]).toMatchObject({
        instance: { id: 'hero-1', actorType: 'hero' },
      });
    });

    it('returns the created instance in the output object', () => {
      core.events.emitSync('actor/define', { def: makeSimpleDef() });
      const result = core.events.emitSync<ActorDef, ActorSpawnOutput>(
        'actor/spawn',
        { actorType: 'hero', instanceId: 'h1' } as unknown as ActorDef,
      );
      expect(result.output.instance).toBeDefined();
      expect(result.output.instance.id).toBe('h1');
    });

    it('auto-generates an instanceId when omitted', () => {
      core.events.emitSync('actor/define', { def: makeSimpleDef() });
      core.events.emitSync('actor/spawn', { actorType: 'hero' });
      expect(am.instances).toHaveLength(1);
      expect(am.instances[0]!.id).toMatch(/^actor_/);
    });

    it('deep-copies initialState so instances are independent', () => {
      core.events.emitSync('actor/define', {
        def: { ...makeSimpleDef(), initialState: { hp: 100 } },
      });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'a' });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'b' });

      const a = am.getInstance('a')!;
      const b = am.getInstance('b')!;
      a.state['hp'] = 50;

      expect(b.state['hp']).toBe(100);   // b must be unaffected
    });

    it('merges per-spawn initialState on top of the def initialState', () => {
      core.events.emitSync('actor/define', {
        def: { ...makeSimpleDef(), initialState: { hp: 100, mp: 50 } },
      });
      core.events.emitSync('actor/spawn', {
        actorType: 'hero',
        instanceId: 'hero-1',
        initialState: { hp: 999 },
      });
      const inst = am.getInstance('hero-1')!;
      expect(inst.state['hp']).toBe(999);   // overridden
      expect(inst.state['mp']).toBe(50);    // kept from def
    });

    it('warns and returns null when actorType is not defined', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('actor/spawn', { actorType: 'ghost', instanceId: 'g1' });
      expect(warn).toHaveBeenCalled();
      expect(am.instances).toHaveLength(0);
      warn.mockRestore();
    });

    it('warns when instanceId is already taken', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('actor/define', { def: makeSimpleDef() });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'dup' });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'dup' });
      expect(warn).toHaveBeenCalledOnce();
      expect(am.instances).toHaveLength(1);
      warn.mockRestore();
    });

    it('stores the optional entityId on the instance', () => {
      core.events.emitSync('actor/define', { def: makeSimpleDef() });
      core.events.emitSync('actor/spawn', {
        actorType: 'hero',
        instanceId: 'h1',
        entityId: 'entity_42',
      });
      expect(am.getInstance('h1')!.entityId).toBe('entity_42');
    });
  });

  // -------------------------------------------------------------------------
  // actor/despawn
  // -------------------------------------------------------------------------

  describe('actor/despawn', () => {
    it('emits actor/despawned and removes the instance', () => {
      const despawned = vi.fn();
      core.events.on('test', 'actor/despawned', despawned);

      core.events.emitSync('actor/define', { def: makeSimpleDef() });
      core.events.emitSync('actor/spawn',   { actorType: 'hero', instanceId: 'h1' });
      core.events.emitSync('actor/despawn', { instanceId: 'h1' });

      expect(despawned).toHaveBeenCalledOnce();
      expect(am.getInstance('h1')).toBeUndefined();
    });

    it('warns when despawning a non-existent instance', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('actor/despawn', { instanceId: 'ghost' });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('unregisters trigger listeners so they no longer fire', async () => {
      const scriptStarted = vi.fn();
      core.events.on('test', 'script/started', scriptStarted);

      const def: ActorDef = {
        id: 'guard',
        scripts: [{ id: 'guard-alert', nodes: [] }],
        triggers: [{ id: 'on-alarm', event: 'world/alarm', script: 'guard-alert', mode: 'concurrent' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn',   { actorType: 'guard', instanceId: 'g1' });
      core.events.emitSync('actor/despawn', { instanceId: 'g1' });

      // Fire the event — the trigger should NOT react any more.
      core.events.emitSync('world/alarm', {});
      await flushMicrotasks();

      // guard-alert should never have started (neither before nor after despawn)
      expect(scriptStarted).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // actor/state:set + actor/state:get
  // -------------------------------------------------------------------------

  describe('shared actor state', () => {
    beforeEach(() => {
      core.events.emitSync('actor/define', {
        def: { ...makeSimpleDef(), initialState: { gold: 100 } },
      });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h1' });
    });

    it('actor/state:set updates the state and emits actor/state:changed', () => {
      const changed = vi.fn();
      core.events.on('test', 'actor/state:changed', changed);

      core.events.emitSync('actor/state:set', { instanceId: 'h1', key: 'gold', value: 200 });

      expect(am.getInstance('h1')!.state['gold']).toBe(200);
      expect(changed).toHaveBeenCalledOnce();
      expect(changed.mock.calls[0]![0]).toMatchObject({
        instanceId: 'h1',
        key:        'gold',
        value:      200,
        previous:   100,
      });
    });

    it('actor/state:get returns a snapshot of the current state', () => {
      core.events.emitSync('actor/state:set', { instanceId: 'h1', key: 'gold', value: 42 });
      type Out = { state: Record<string, unknown> | null };
      const result = core.events.emitSync<unknown, Out>('actor/state:get', { instanceId: 'h1' });
      expect(result.output.state).toMatchObject({ gold: 42 });
    });

    it('actor/state:get returns null for unknown instance', () => {
      type Out = { state: Record<string, unknown> | null };
      const result = core.events.emitSync<unknown, Out>('actor/state:get', { instanceId: 'nope' });
      expect(result.output.state).toBeNull();
    });

    it('actor/state:set warns for unknown instance', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('actor/state:set', { instanceId: 'nope', key: 'x', value: 1 });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('state snapshot from actor/state:get is a copy, not a live reference', () => {
      type Out = { state: Record<string, unknown> | null };
      const result = core.events.emitSync<unknown, Out>('actor/state:get', { instanceId: 'h1' });
      const snapshot = result.output.state!;
      // Mutate the snapshot — original state must be unaffected.
      snapshot['gold'] = 9999;
      expect(am.getInstance('h1')!.state['gold']).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Trigger: concurrent mode
  // -------------------------------------------------------------------------

  describe('trigger — concurrent mode', () => {
    it('runs the script without affecting any existing primary lane', async () => {
      // Use 'wait-event' to keep the patrol script suspended until 'patrol/done' fires.
      // This prevents it from completing before we assert.
      const def: ActorDef = {
        id: 'guard',
        scripts: [
          { id: 'guard-patrol',  nodes: [{ cmd: 'wait-event', event: 'patrol/done' }] },
          { id: 'guard-ambient', nodes: [{ cmd: 'label',      name: 'noop'         }] },
        ],
        triggers: [
          { id: 'ambient', event: 'world/tick', script: 'guard-ambient', mode: 'concurrent' },
        ],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'guard', instanceId: 'g1' });

      // Start patrol on the primary lane manually.
      core.events.emitSync('script/run', { id: 'guard-patrol', instanceId: 'g1', priority: 0 });

      // Fire the concurrent trigger.
      core.events.emitSync('world/tick', {});
      await flushMicrotasks();

      // Patrol should still be running (primary lane untouched).
      const patrols = sm.runningInstances.filter((i) => i.instanceId === 'g1');
      expect(patrols).toHaveLength(1);
      expect(patrols[0]!.scriptId).toBe('guard-patrol');

      // Clean up: release the wait-event so the script loop terminates.
      core.events.emitSync('patrol/done', {});
      await flushMicrotasks();
    });

    it('emits actor/script:started and actor/script:ended', async () => {
      const started = vi.fn();
      const ended   = vi.fn();
      core.events.on('test', 'actor/script:started', started);
      core.events.on('test', 'actor/script:ended',   ended);

      const def: ActorDef = {
        id: 'npc',
        scripts: [{ id: 'npc-wave', nodes: [] }],
        triggers: [{ id: 'on-wave', event: 'player/greet', script: 'npc-wave', mode: 'concurrent' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'npc-1' });
      core.events.emitSync('player/greet', {});
      await flushMicrotasks();

      expect(started).toHaveBeenCalledOnce();
      expect(started.mock.calls[0]![0]).toMatchObject({
        instanceId: 'npc-1',
        triggerId:  'on-wave',
        scriptId:   'npc-wave',
        mode:       'concurrent',
      });
      expect(ended).toHaveBeenCalledOnce();
    });

    it('uses a separate lane id so concurrent triggers do not overwrite each other', async () => {
      let capturedLane = '';
      core.events.on('test', 'script/started', (p: { instanceId: string }) => {
        capturedLane = p.instanceId;
      });

      const def: ActorDef = {
        id: 'fx',
        scripts: [{ id: 'fx-pop', nodes: [] }],
        triggers: [{ id: 'on-pop', event: 'vfx/pop', script: 'fx-pop', mode: 'concurrent' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'fx', instanceId: 'fx-1' });
      core.events.emitSync('vfx/pop', {});

      expect(capturedLane).toBe('fx-1:on-pop');
    });

    it('condition guard skips the trigger when it returns false', async () => {
      const started = vi.fn();
      core.events.on('test', 'script/started', started);

      const def: ActorDef = {
        id: 'locked',
        scripts: [{ id: 'open-door', nodes: [] }],
        triggers: [
          {
            id: 'interact',
            event: 'player/interact',
            condition: (ctx) => ctx.actorState['isOpen'] === true,
            script: 'open-door',
            mode: 'concurrent',
          },
        ],
        initialState: { isOpen: false },
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'locked', instanceId: 'door-1' });
      core.events.emitSync('player/interact', {});
      await flushMicrotasks();

      expect(started).not.toHaveBeenCalled();
    });

    it('condition guard passes event payload to the condition function', async () => {
      const started = vi.fn();
      core.events.on('test', 'script/started', started);

      const def: ActorDef = {
        id: 'targeted',
        scripts: [{ id: 'react', nodes: [] }],
        triggers: [
          {
            id: 'interact',
            event: 'player/interact',
            condition: (ctx) =>
              (ctx.eventPayload as { targetId: string }).targetId === ctx.actorInstance.id,
            script: 'react',
            mode: 'concurrent',
          },
        ],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'targeted', instanceId: 'target-1' });

      // Wrong target — should not fire.
      core.events.emitSync('player/interact', { targetId: 'other' });
      await flushMicrotasks();
      expect(started).not.toHaveBeenCalled();

      // Correct target — should fire.
      core.events.emitSync('player/interact', { targetId: 'target-1' });
      await flushMicrotasks();
      expect(started).toHaveBeenCalledOnce();
    });

    it('varsFromEvent injects event payload fields into script vars', async () => {
      let capturedVars: Record<string, unknown> = {};
      core.events.emitSync('script/register-command', {
        cmd: 'capture',
        handler: (ctx) => { capturedVars = { ...ctx.vars }; },
      });

      const def: ActorDef = {
        id: 'receiver',
        scripts: [{ id: 'handle', nodes: [{ cmd: 'capture' }] }],
        triggers: [
          {
            id: 'on-msg',
            event: 'world/message',
            script: 'handle',
            mode: 'concurrent',
            varsFromEvent: (p) => ({ msg: (p as { msg: string }).msg }),
          },
        ],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'receiver', instanceId: 'recv-1' });
      core.events.emitSync('world/message', { msg: 'hello' });
      await flushMicrotasks();

      expect(capturedVars['msg']).toBe('hello');
    });
  });

  // -------------------------------------------------------------------------
  // Trigger: blocking mode
  // -------------------------------------------------------------------------

  describe('trigger — blocking mode', () => {
    it('emits actor/script:started and actor/script:ended', async () => {
      const started = vi.fn();
      const ended   = vi.fn();
      core.events.on('test', 'actor/script:started', started);
      core.events.on('test', 'actor/script:ended',   ended);

      const def: ActorDef = {
        id: 'npc',
        scripts: [{ id: 'npc-talk', nodes: [] }],
        triggers: [{ id: 'on-talk', event: 'player/talk', script: 'npc-talk', mode: 'blocking' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'npc-1' });
      core.events.emitSync('player/talk', {});
      await flushMicrotasks();

      expect(started).toHaveBeenCalledOnce();
      expect(started.mock.calls[0]![0]).toMatchObject({ mode: 'blocking' });
      expect(ended).toHaveBeenCalledOnce();
    });

    it('uses the primary actor instance lane (not a sub-lane)', () => {
      let capturedLane = '';
      core.events.on('test', 'script/started', (p: { instanceId: string }) => {
        capturedLane = p.instanceId;
      });

      const def: ActorDef = {
        id: 'npc',
        scripts: [{ id: 'npc-talk', nodes: [] }],
        triggers: [{ id: 'talk', event: 'player/talk', script: 'npc-talk', mode: 'blocking' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'npc-1' });
      core.events.emitSync('player/talk', {});

      expect(capturedLane).toBe('npc-1');
    });
  });

  // -------------------------------------------------------------------------
  // Merchant scenario — full integration
  // -------------------------------------------------------------------------

  describe('merchant scenario', () => {
    function buildMerchantDef(): ActorDef {
      return {
        id: 'merchant',
        initialState: { isAvailable: true, gold: 500 },
        scripts: [
          { id: 'merchant-patrol', nodes: [{ cmd: 'label', name: 'loop' }] },
          { id: 'merchant-dialogue', nodes: [{ cmd: 'label', name: 'talk' }] },
        ],
        triggers: [
          {
            id: 'auto-patrol',
            event: 'actor/spawned',
            script: 'merchant-patrol',
            mode: 'concurrent',
          },
          {
            id: 'player-interact',
            event: 'player/interact',
            condition: (ctx) =>
              ctx.actorState['isAvailable'] === true &&
              (ctx.eventPayload as { targetId: string }).targetId === ctx.actorInstance.id,
            script: 'merchant-dialogue',
            mode: 'blocking',
            priority: 10,
            onEnd: 'restore',
            varsFromEvent: (p) => ({ playerId: (p as { playerId: string }).playerId }),
          },
        ],
      };
    }

    it('auto-patrol starts on spawn via actor/spawned trigger', async () => {
      const started = vi.fn();
      core.events.on('test', 'script/started', (p: { id: string }) => {
        if (p.id === 'merchant-patrol') started();
      });

      core.events.emitSync('actor/define', { def: buildMerchantDef() });
      core.events.emitSync('actor/spawn', { actorType: 'merchant', instanceId: 'merch-1' });
      await flushMicrotasks();

      expect(started).toHaveBeenCalledOnce();
    });

    it('dialogue blocks the primary lane when player interacts', async () => {
      const scriptStartIds: string[] = [];
      core.events.on('test', 'script/started', (p: { id: string }) => {
        scriptStartIds.push(p.id);
      });

      core.events.emitSync('actor/define', { def: buildMerchantDef() });
      core.events.emitSync('actor/spawn', { actorType: 'merchant', instanceId: 'merch-1' });
      await flushMicrotasks();

      // Trigger interaction targeting the merchant.
      core.events.emitSync('player/interact', { targetId: 'merch-1', playerId: 'player-1' });
      await flushMicrotasks();

      expect(scriptStartIds).toContain('merchant-dialogue');
    });

    it('interaction with wrong targetId is ignored', async () => {
      const dialogueStarted = vi.fn();
      core.events.on('test', 'script/started', (p: { id: string }) => {
        if (p.id === 'merchant-dialogue') dialogueStarted();
      });

      core.events.emitSync('actor/define', { def: buildMerchantDef() });
      core.events.emitSync('actor/spawn', { actorType: 'merchant', instanceId: 'merch-1' });

      core.events.emitSync('player/interact', { targetId: 'other-npc', playerId: 'player-1' });
      await flushMicrotasks();

      expect(dialogueStarted).not.toHaveBeenCalled();
    });

    it('$actor var in script points to the live state object', async () => {
      let capturedRef: unknown;
      core.events.emitSync('script/register-command', {
        cmd: 'capture-actor',
        handler: (ctx) => { capturedRef = ctx.vars['$actor']; },
      });

      const def: ActorDef = {
        id: 'spy',
        scripts: [{ id: 'spy-script', nodes: [{ cmd: 'capture-actor' }] }],
        triggers: [{ id: 'run', event: 'world/go', script: 'spy-script', mode: 'concurrent' }],
        initialState: { x: 1 },
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'spy', instanceId: 'spy-1' });
      core.events.emitSync('world/go', {});
      await flushMicrotasks();

      // capturedRef should be the same object as instance.state
      expect(capturedRef).toBe(am.getInstance('spy-1')!.state);
    });
  });

  // -------------------------------------------------------------------------
  // actor/trigger (manual fire)
  // -------------------------------------------------------------------------

  describe('actor/trigger — manual fire', () => {
    it('fires the named trigger on the given instance', async () => {
      const started = vi.fn();
      core.events.on('test', 'script/started', started);

      const def: ActorDef = {
        id: 'robot',
        scripts: [{ id: 'robot-wake', nodes: [] }],
        triggers: [{ id: 'wake', event: 'world/never', script: 'robot-wake', mode: 'concurrent' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'robot', instanceId: 'r1' });

      // Manually fire the trigger.
      core.events.emitSync('actor/trigger', { instanceId: 'r1', triggerId: 'wake' });
      await flushMicrotasks();

      expect(started).toHaveBeenCalledOnce();
    });

    it('warns when instance does not exist', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('actor/trigger', { instanceId: 'ghost', triggerId: 'x' });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('warns when triggerId does not exist on the actor', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('actor/define', { def: makeSimpleDef() });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h1' });
      core.events.emitSync('actor/trigger', { instanceId: 'h1', triggerId: 'missing' });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('merges extra vars passed to actor/trigger into the script vars', async () => {
      let capturedVars: Record<string, unknown> = {};
      core.events.emitSync('script/register-command', {
        cmd: 'capture',
        handler: (ctx) => { capturedVars = { ...ctx.vars }; },
      });

      const def: ActorDef = {
        id: 'test-actor',
        scripts: [{ id: 'test-script', nodes: [{ cmd: 'capture' }] }],
        triggers: [{ id: 'run', event: 'world/never', script: 'test-script', mode: 'concurrent' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'test-actor', instanceId: 'ta1' });
      core.events.emitSync('actor/trigger', {
        instanceId: 'ta1',
        triggerId:  'run',
        vars: { extra: 'value' },
      });
      await flushMicrotasks();

      expect(capturedVars['extra']).toBe('value');
    });
  });

  // -------------------------------------------------------------------------
  // Multiple instances share no state
  // -------------------------------------------------------------------------

  describe('multiple instances of the same actor type', () => {
    it('each instance has its own independent state', () => {
      core.events.emitSync('actor/define', {
        def: { ...makeSimpleDef(), initialState: { hp: 50 } },
      });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h1' });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h2' });

      core.events.emitSync('actor/state:set', { instanceId: 'h1', key: 'hp', value: 10 });

      expect(am.getInstance('h1')!.state['hp']).toBe(10);
      expect(am.getInstance('h2')!.state['hp']).toBe(50);
    });

    it('triggers on one instance do not affect another', async () => {
      const triggered = vi.fn();
      core.events.on('test', 'actor/script:started', (p: { instanceId: string }) => {
        triggered(p.instanceId);
      });

      const def: ActorDef = {
        id: 'npc',
        scripts: [{ id: 'npc-alert', nodes: [] }],
        triggers: [
          {
            id: 'interact',
            event: 'player/interact',
            condition: (ctx) =>
              (ctx.eventPayload as { targetId: string }).targetId === ctx.actorInstance.id,
            script: 'npc-alert',
            mode: 'concurrent',
          },
        ],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'npc-1' });
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'npc-2' });

      core.events.emitSync('player/interact', { targetId: 'npc-1' });
      await flushMicrotasks();

      expect(triggered).toHaveBeenCalledOnce();
      expect(triggered).toHaveBeenCalledWith('npc-1');
    });
  });

  // -------------------------------------------------------------------------
  // getInstance() accessor
  // -------------------------------------------------------------------------

  describe('getInstance()', () => {
    it('returns undefined for a non-existent id', () => {
      expect(am.getInstance('no-such')).toBeUndefined();
    });

    it('returns the instance after spawn and undefined after despawn', () => {
      core.events.emitSync('actor/define', { def: makeSimpleDef() });
      core.events.emitSync('actor/spawn',   { actorType: 'hero', instanceId: 'h1' });
      expect(am.getInstance('h1')).toBeDefined();
      core.events.emitSync('actor/despawn', { instanceId: 'h1' });
      expect(am.getInstance('h1')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // destroy() cleans up
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('removes all instances and stops listening to events', async () => {
      const started = vi.fn();
      core.events.on('test', 'script/started', started);

      const def: ActorDef = {
        id: 'npc',
        scripts: [{ id: 'npc-run', nodes: [] }],
        triggers: [{ id: 'go', event: 'world/go', script: 'npc-run', mode: 'concurrent' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'n1' });

      am.destroy(core);

      core.events.emitSync('world/go', {});
      await flushMicrotasks();

      expect(started).not.toHaveBeenCalled();
      expect(am.instances).toHaveLength(0);
    });
  });
});
