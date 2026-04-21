import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { ActorManager } from '../src/plugins/rpg/ActorManager.js';
import { ScriptManager } from '../src/plugins/rpg/ScriptManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  ActorDef,
  ActorSpawnOutput,
  ActorStatePatchedParams,
  ActorListOutput,
} from '../src/types/actor.js';

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

  // -------------------------------------------------------------------------
  // Bug fix: once listener does not get consumed by a different script/ended
  // -------------------------------------------------------------------------

  describe('bug fix: once listener isolation (actor/script:ended emits correctly)', () => {
    it('actor/script:ended fires for concurrent trigger even when another script ends first', async () => {
      const ended = vi.fn();
      core.events.on('test', 'actor/script:ended', ended);

      // Register a "hang" command that suspends until explicitly stopped
      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx: import('../src/types/script.js').ScriptContext) =>
          new Promise<void>((resolve) => ctx.onStop(resolve)),
      });

      // An unrelated script that ends quickly (it will emit script/ended first)
      core.events.emitSync('script/define', {
        script: { id: 'unrelated', nodes: [] },
      });

      const def: ActorDef = {
        id: 'npc',
        scripts: [{ id: 'npc-vfx', nodes: [{ cmd: 'hang' }] }],
        triggers: [{ id: 'vfx', event: 'world/vfx', script: 'npc-vfx', mode: 'concurrent' }],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'npc-1' });

      // Fire the concurrent trigger first
      core.events.emitSync('world/vfx', {});
      await flushMicrotasks();

      // Now start and immediately end an unrelated script — this used to consume
      // the actor's once listener, preventing actor/script:ended from firing.
      core.events.emitSync('script/run', { id: 'unrelated', instanceId: 'other-instance' });
      await flushMicrotasks();

      // The concurrent script is still running; actor/script:ended has NOT fired yet
      expect(ended).not.toHaveBeenCalled();

      // Now stop the actor's concurrent lane
      core.events.emitSync('script/stop', { instanceId: 'npc-1:vfx' });
      await flushMicrotasks();

      // actor/script:ended must fire exactly once for the correct trigger
      expect(ended).toHaveBeenCalledOnce();
      expect(ended.mock.calls[0]![0]).toMatchObject({
        instanceId: 'npc-1',
        triggerId:  'vfx',
        mode:       'concurrent',
      });
    });

    it('onEnd: restore fires correctly after an unrelated script/ended', async () => {
      const scriptStarted: string[] = [];
      core.events.on('test', 'script/started', (p: { id: string }) => {
        scriptStarted.push(p.id);
      });

      core.events.emitSync('script/register-command', {
        cmd: 'hang',
        handler: (ctx: import('../src/types/script.js').ScriptContext) =>
          new Promise<void>((resolve) => ctx.onStop(resolve)),
      });

      // An unrelated short-lived script
      core.events.emitSync('script/define', {
        script: { id: 'quick', nodes: [] },
      });

      const def: ActorDef = {
        id: 'guard',
        scripts: [
          { id: 'guard-patrol',   nodes: [{ cmd: 'hang' }] },
          { id: 'guard-dialogue', nodes: []                 },
        ],
        triggers: [
          {
            id:       'auto-patrol',
            event:    'actor/spawned',
            script:   'guard-patrol',
            mode:     'concurrent',
          },
          {
            id:       'talk',
            event:    'player/talk',
            script:   'guard-dialogue',
            mode:     'blocking',
            priority: 10,
            onEnd:    'restore',
          },
        ],
      };
      core.events.emitSync('actor/define', { def });
      core.events.emitSync('actor/spawn', { actorType: 'guard', instanceId: 'g1' });
      await flushMicrotasks();

      // Start patrol on the primary lane
      core.events.emitSync('script/run', {
        id:         'guard-patrol',
        instanceId: 'g1',
        priority:   0,
      });
      await flushMicrotasks();

      // Fire dialogue trigger
      core.events.emitSync('player/talk', {});
      await flushMicrotasks();

      const beforeUnrelated = scriptStarted.slice();

      // Fire an unrelated script that ends immediately — previously this would
      // consume the blocking listener and prevent onEnd: 'restore' from firing
      core.events.emitSync('script/run', { id: 'quick', instanceId: 'other' });
      await flushMicrotasks();

      // guard-dialogue ends naturally (empty nodes), then onEnd: 'restore' should
      // re-launch guard-patrol
      expect(scriptStarted).toContain('guard-patrol');
      // It should have been launched at least twice: once initially, once via restore
      const patrolCount = scriptStarted.filter((id) => id === 'guard-patrol').length;
      expect(patrolCount).toBeGreaterThanOrEqual(2);

      // Cleanup
      core.events.emitSync('script/stop', { instanceId: 'g1' });
      await flushMicrotasks();
    });
  });

  // -------------------------------------------------------------------------
  // Bug fix: actor/spawned triggers do not fire for pre-existing instances
  // -------------------------------------------------------------------------

  describe('bug fix: actor/spawned does not broadcast to existing instances', () => {
    it('spawning a second instance does not re-fire actor/spawned triggers on the first', async () => {
      const patrolStarted = vi.fn();
      core.events.on('test', 'script/started', (p: { id: string; instanceId: string }) => {
        if (p.id === 'npc-patrol') patrolStarted(p.instanceId);
      });

      const def: ActorDef = {
        id: 'npc',
        scripts: [{ id: 'npc-patrol', nodes: [] }],
        triggers: [
          { id: 'auto', event: 'actor/spawned', script: 'npc-patrol', mode: 'concurrent' },
        ],
      };
      core.events.emitSync('actor/define', { def });

      // Spawn first instance — auto-patrol should start for npc-1 only
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'npc-1' });
      await flushMicrotasks();

      expect(patrolStarted).toHaveBeenCalledOnce();
      expect(patrolStarted.mock.calls[0]![0]).toBe('npc-1:auto');

      // Spawn second instance — npc-1's patrol trigger must NOT fire again
      core.events.emitSync('actor/spawn', { actorType: 'npc', instanceId: 'npc-2' });
      await flushMicrotasks();

      // Total: npc-1 once + npc-2 once = 2 total, not 3
      expect(patrolStarted).toHaveBeenCalledTimes(2);
      const calls = patrolStarted.mock.calls.map((c) => c[0] as string);
      expect(calls).toContain('npc-1:auto');
      expect(calls).toContain('npc-2:auto');
    });
  });

  // -------------------------------------------------------------------------
  // Bug fix: actor/state:get returns a deep clone
  // -------------------------------------------------------------------------

  describe('bug fix: actor/state:get deep clones nested state', () => {
    it('mutating a nested array in the snapshot does not affect the live state', () => {
      core.events.emitSync('actor/define', {
        def: {
          ...makeSimpleDef('hero'),
          initialState: { inventory: ['sword', 'potion'] },
        },
      });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h1' });

      type Out = { state: Record<string, unknown> | null };
      const result = core.events.emitSync<unknown, Out>('actor/state:get', { instanceId: 'h1' });
      const snapshot = result.output.state!;

      // Mutate the nested array in the snapshot
      (snapshot['inventory'] as string[]).push('shield');

      // The live instance must be unaffected
      const live = am.getInstance('h1')!.state['inventory'] as string[];
      expect(live).toHaveLength(2);
      expect(live).not.toContain('shield');
    });
  });

  // -------------------------------------------------------------------------
  // actor/state:patch
  // -------------------------------------------------------------------------

  describe('actor/state:patch', () => {
    beforeEach(() => {
      core.events.emitSync('actor/define', {
        def: { ...makeSimpleDef(), initialState: { gold: 100, hp: 50, level: 1 } },
      });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h1' });
    });

    it('updates multiple keys atomically', () => {
      core.events.emitSync('actor/state:patch', {
        instanceId: 'h1',
        patch: { gold: 200, hp: 75 },
      });
      const inst = am.getInstance('h1')!;
      expect(inst.state['gold']).toBe(200);
      expect(inst.state['hp']).toBe(75);
      expect(inst.state['level']).toBe(1); // unchanged
    });

    it('emits actor/state:patched with patch and previous values', () => {
      const patched = vi.fn();
      core.events.on('test', 'actor/state:patched', patched);

      core.events.emitSync('actor/state:patch', {
        instanceId: 'h1',
        patch: { gold: 500, level: 2 },
      });

      expect(patched).toHaveBeenCalledOnce();
      const p = patched.mock.calls[0]![0] as ActorStatePatchedParams;
      expect(p.instanceId).toBe('h1');
      expect(p.patch).toMatchObject({ gold: 500, level: 2 });
      expect(p.previous).toMatchObject({ gold: 100, level: 1 });
    });

    it('emits only one actor/state:patched event per patch call', () => {
      const count = vi.fn();
      core.events.on('test', 'actor/state:patched', count);

      core.events.emitSync('actor/state:patch', {
        instanceId: 'h1',
        patch: { gold: 1, hp: 2, level: 3 },
      });

      expect(count).toHaveBeenCalledOnce();
    });

    it('warns when instance does not exist', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('actor/state:patch', {
        instanceId: 'ghost',
        patch: { gold: 1 },
      });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('adds a new key that did not exist before (previous value is undefined)', () => {
      const patched = vi.fn();
      core.events.on('test', 'actor/state:patched', patched);

      core.events.emitSync('actor/state:patch', {
        instanceId: 'h1',
        patch: { newKey: 'hello' },
      });

      expect(am.getInstance('h1')!.state['newKey']).toBe('hello');
      const p = patched.mock.calls[0]![0] as ActorStatePatchedParams;
      expect(p.previous['newKey']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // actor/list
  // -------------------------------------------------------------------------

  describe('actor/list', () => {
    it('returns an empty array when no instances are spawned', () => {
      const result = core.events.emitSync<Record<string, never>, ActorListOutput>(
        'actor/list',
        {},
      );
      expect(result.output.instances).toEqual([]);
    });

    it('returns all currently live instances', () => {
      core.events.emitSync('actor/define', { def: makeSimpleDef('hero') });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h1' });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h2' });
      core.events.emitSync('actor/spawn', { actorType: 'hero', instanceId: 'h3' });

      const result = core.events.emitSync<Record<string, never>, ActorListOutput>(
        'actor/list',
        {},
      );
      const ids = result.output.instances.map((i) => i.id);
      expect(ids).toContain('h1');
      expect(ids).toContain('h2');
      expect(ids).toContain('h3');
      expect(ids).toHaveLength(3);
    });

    it('reflects despawns immediately', () => {
      core.events.emitSync('actor/define', { def: makeSimpleDef('hero') });
      core.events.emitSync('actor/spawn',   { actorType: 'hero', instanceId: 'h1' });
      core.events.emitSync('actor/spawn',   { actorType: 'hero', instanceId: 'h2' });
      core.events.emitSync('actor/despawn', { instanceId: 'h1' });

      const result = core.events.emitSync<Record<string, never>, ActorListOutput>(
        'actor/list',
        {},
      );
      const ids = result.output.instances.map((i) => i.id);
      expect(ids).not.toContain('h1');
      expect(ids).toContain('h2');
    });
  });
});
