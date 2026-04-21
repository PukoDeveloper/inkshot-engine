import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SaveManager } from '../src/plugins/save/SaveManager.js';
import { ScriptManager } from '../src/plugins/rpg/ScriptManager.js';
import { VariableStoreManager } from '../src/plugins/rpg/VariableStoreManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  StoreGetOutput,
  StoreGetNamespaceOutput,
  StoreSnapshotOutput,
} from '../src/types/store.js';
import type {
  SaveSlotSaveOutput,
  SaveSlotLoadOutput,
  SaveSlotGetOutput,
} from '../src/types/save.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VariableStoreManager', () => {
  let core: Core;
  let store: VariableStoreManager;

  beforeEach(() => {
    core  = createStubCore();
    store = new VariableStoreManager();
    store.init(core);
  });

  // -------------------------------------------------------------------------
  // store/set + store/get
  // -------------------------------------------------------------------------

  describe('store/set + store/get', () => {
    it('writes and reads a value in a namespace', () => {
      core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 250 });

      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'gold' },
      );

      expect(output.value).toBe(250);
    });

    it('overwrites an existing key', () => {
      core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 100 });
      core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 999 });

      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'gold' },
      );

      expect(output.value).toBe(999);
    });

    it('returns undefined for a missing namespace', () => {
      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'unknown', key: 'anything' },
      );

      expect(output.value).toBeUndefined();
    });

    it('returns undefined for a missing key inside an existing namespace', () => {
      core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 1 });

      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'no-such-key' },
      );

      expect(output.value).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // store/patch
  // -------------------------------------------------------------------------

  describe('store/patch', () => {
    it('shallow-merges multiple keys into a namespace', () => {
      core.events.emitSync('store/patch', { ns: 'quest', patch: { a: true, b: false } });
      core.events.emitSync('store/patch', { ns: 'quest', patch: { b: true, c: 42 } });

      const { output: a } = core.events.emitSync<object, StoreGetOutput>('store/get', { ns: 'quest', key: 'a' });
      const { output: b } = core.events.emitSync<object, StoreGetOutput>('store/get', { ns: 'quest', key: 'b' });
      const { output: c } = core.events.emitSync<object, StoreGetOutput>('store/get', { ns: 'quest', key: 'c' });

      expect(a.value).toBe(true);
      expect(b.value).toBe(true);
      expect(c.value).toBe(42);
    });

    it('creates the namespace if it does not exist', () => {
      core.events.emitSync('store/patch', { ns: 'world', patch: { dayTime: 'night' } });

      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'world', key: 'dayTime' },
      );

      expect(output.value).toBe('night');
    });
  });

  // -------------------------------------------------------------------------
  // store/get-namespace
  // -------------------------------------------------------------------------

  describe('store/get-namespace', () => {
    it('returns a live reference to the namespace data', () => {
      core.events.emitSync('store/set', { ns: 'player', key: 'hp', value: 100 });

      const { output } = core.events.emitSync<object, StoreGetNamespaceOutput>(
        'store/get-namespace',
        { ns: 'player' },
      );

      expect(output.data).toBeDefined();
      expect(output.data!['hp']).toBe(100);
    });

    it('returns undefined for a non-existent namespace', () => {
      const { output } = core.events.emitSync<object, StoreGetNamespaceOutput>(
        'store/get-namespace',
        { ns: 'nope' },
      );

      expect(output.data).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // store/clear-namespace
  // -------------------------------------------------------------------------

  describe('store/clear-namespace', () => {
    it('removes all keys from the namespace', () => {
      core.events.emitSync('store/set', { ns: 'tmp', key: 'x', value: 1 });
      core.events.emitSync('store/clear-namespace', { ns: 'tmp' });

      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'tmp', key: 'x' },
      );

      expect(output.value).toBeUndefined();
    });

    it('is a no-op for a non-existent namespace', () => {
      expect(() =>
        core.events.emitSync('store/clear-namespace', { ns: 'ghost' }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // store/snapshot + store/restore
  // -------------------------------------------------------------------------

  describe('store/snapshot', () => {
    it('returns a deep clone of all namespaces', () => {
      core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 50 });
      core.events.emitSync('store/set', { ns: 'quest',  key: 'done',  value: true });

      const { output } = core.events.emitSync<object, StoreSnapshotOutput>(
        'store/snapshot',
        {},
      );

      expect(output.snapshot['player']?.['gold']).toBe(50);
      expect(output.snapshot['quest']?.['done']).toBe(true);
    });

    it('snapshot is independent (mutations do not affect the live store)', () => {
      core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 50 });

      const { output } = core.events.emitSync<object, StoreSnapshotOutput>(
        'store/snapshot',
        {},
      );

      // Mutate the snapshot
      output.snapshot['player']!['gold'] = 9999;

      const { output: live } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'gold' },
      );

      expect(live.value).toBe(50);
    });
  });

  describe('store/restore', () => {
    it('replaces the store with the given snapshot', () => {
      core.events.emitSync('store/set', { ns: 'old', key: 'x', value: 1 });

      core.events.emitSync('store/restore', {
        snapshot: { player: { gold: 77 }, quest: { done: false } },
      });

      const { output: gold } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'gold' },
      );
      const { output: old } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'old', key: 'x' },
      );

      expect(gold.value).toBe(77);
      expect(old.value).toBeUndefined();
    });

    it('restore deep-clones the snapshot (mutations do not bleed in)', () => {
      const snap = { player: { gold: 10 } };
      core.events.emitSync('store/restore', { snapshot: snap });

      // Mutate the original snapshot object
      snap.player.gold = 999;

      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'gold' },
      );

      expect(output.value).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Namespace isolation
  // -------------------------------------------------------------------------

  describe('namespace isolation', () => {
    it('two namespaces using the same key do not interfere', () => {
      core.events.emitSync('store/set', { ns: 'pluginA', key: 'volume', value: 50 });
      core.events.emitSync('store/set', { ns: 'pluginB', key: 'volume', value: 80 });

      const { output: a } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'pluginA', key: 'volume' },
      );
      const { output: b } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'pluginB', key: 'volume' },
      );

      expect(a.value).toBe(50);
      expect(b.value).toBe(80);
    });
  });

  // -------------------------------------------------------------------------
  // Save / load integration
  // -------------------------------------------------------------------------

  describe('save/slot:save + save/slot:load integration', () => {
    let saveManager: SaveManager;

    beforeEach(() => {
      saveManager = new SaveManager();
      saveManager.init(core);
    });

    it('embeds the store snapshot in slot data during save', () => {
      core.events.emitSync('store/set',  { ns: 'player', key: 'gold', value: 123 });
      core.events.emitSync('save/slot:set', { id: 'slot-1', patch: {} });

      const { output } = core.events.emitSync<object, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 'slot-1' },
      );

      expect(output.data).toBeDefined();
      expect(output.data!.data['_varStore']).toBeDefined();
      const snap = output.data!.data['_varStore'] as Record<string, unknown>;
      expect((snap['player'] as Record<string, unknown>)?.['gold']).toBe(123);
    });

    it('restores the store from slot data during load', async () => {
      // Prepare a slot that already contains a _varStore snapshot
      const rawSlot = {
        meta: { id: 'slot-1', name: 'Slot 1', createdAt: 1000, updatedAt: 2000 },
        data: {
          _varStore: { player: { gold: 777 }, quest: { chapter: 3 } },
        },
      };

      // Simulate an env adapter setting output.raw in the before phase
      core.events.on('env', 'save/slot:load', (_p, output: SaveSlotLoadOutput) => {
        output.raw = rawSlot;
      }, { phase: 'before' });

      await core.events.emit('save/slot:load', { id: 'slot-1' });

      const { output: gold } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'gold' },
      );
      const { output: chapter } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'quest', key: 'chapter' },
      );

      expect(gold.value).toBe(777);
      expect(chapter.value).toBe(3);
    });

    it('does not restore when load fails (no raw data)', async () => {
      core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 1 });

      await core.events.emit('save/slot:load', { id: 'no-slot' });

      // Store should be untouched
      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'gold' },
      );
      expect(output.value).toBe(1);
    });

    it('full round-trip: save then load restores the store', async () => {
      // Set up initial state
      core.events.emitSync('store/set', { ns: 'player', key: 'level', value: 7 });
      core.events.emitSync('store/set', { ns: 'quest',  key: 'main',  value: 'started' });
      core.events.emitSync('save/slot:set', { id: 's1', patch: {} });

      // Save — capture output.data (simulating env adapter)
      const { output: saveOut } = core.events.emitSync<object, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 's1' },
      );
      const persistedSlot = structuredClone(saveOut.data!);

      // Clear the store to simulate a fresh game session
      core.events.emitSync('store/clear-namespace', { ns: 'player' });
      core.events.emitSync('store/clear-namespace', { ns: 'quest' });

      // Load — env adapter places the persisted slot into output.raw
      core.events.on('env', 'save/slot:load', (_p, output: SaveSlotLoadOutput) => {
        output.raw = persistedSlot;
      }, { phase: 'before' });

      await core.events.emit('save/slot:load', { id: 's1' });

      const { output: level } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'level' },
      );
      const { output: quest } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'quest', key: 'main' },
      );

      expect(level.value).toBe(7);
      expect(quest.value).toBe('started');
    });
  });

  // -------------------------------------------------------------------------
  // Script command integration
  //
  // ScriptManager must be initialised BEFORE VariableStoreManager so that it
  // is already listening for 'script/register-command' when the store plugin
  // emits it during its own init().
  // -------------------------------------------------------------------------

  describe('script command integration', () => {
    let scriptCore: Core;
    let scriptStore: VariableStoreManager;
    let sm: ScriptManager;

    beforeEach(() => {
      scriptCore  = createStubCore();
      sm          = new ScriptManager();
      sm.init(scriptCore);                   // ScriptManager first
      scriptStore = new VariableStoreManager();
      scriptStore.init(scriptCore);          // store registers commands into sm
    });

    it('store-set writes a value via script', async () => {
      scriptCore.events.emitSync('script/define', {
        script: {
          id: 'test-store-set',
          nodes: [
            { cmd: 'store-set', ns: 'player', key: 'score', value: 42 },
          ],
        },
      });
      scriptCore.events.emitSync('script/run', { id: 'test-store-set' });
      await flushMicrotasks();

      const { output } = scriptCore.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'score' },
      );

      expect(output.value).toBe(42);
    });

    it('store-get reads a value into a script variable', async () => {
      scriptCore.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 100 });

      let capturedVars: Record<string, unknown> | null = null;

      // Register a custom command that captures the vars state
      scriptCore.events.emitSync('script/register-command', {
        cmd: 'capture',
        handler: (ctx) => { capturedVars = { ...ctx.vars }; },
      });

      scriptCore.events.emitSync('script/define', {
        script: {
          id: 'test-store-get',
          nodes: [
            { cmd: 'store-get', ns: 'player', key: 'gold', var: 'myGold' },
            { cmd: 'capture' },
          ],
        },
      });
      scriptCore.events.emitSync('script/run', { id: 'test-store-get' });
      await flushMicrotasks();

      expect(capturedVars!['myGold']).toBe(100);
    });

    it('store-patch writes multiple keys via script', async () => {
      scriptCore.events.emitSync('script/define', {
        script: {
          id: 'test-store-patch',
          nodes: [
            { cmd: 'store-patch', ns: 'quest', patch: { a: true, b: 99 } },
          ],
        },
      });
      scriptCore.events.emitSync('script/run', { id: 'test-store-patch' });
      await flushMicrotasks();

      const { output: a } = scriptCore.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'quest', key: 'a' },
      );
      const { output: b } = scriptCore.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'quest', key: 'b' },
      );

      expect(a.value).toBe(true);
      expect(b.value).toBe(99);
    });

    it('store-get + if: script branches on stored value', async () => {
      scriptCore.events.emitSync('store/set', { ns: 'player', key: 'quest', value: 'done' });

      const visited: string[] = [];
      scriptCore.events.emitSync('script/register-command', {
        cmd: 'mark',
        handler: (ctx) => { visited.push(ctx.node['label'] as string); },
      });

      scriptCore.events.emitSync('script/define', {
        script: {
          id: 'test-branch',
          nodes: [
            { cmd: 'store-get', ns: 'player', key: 'quest', var: 'q' },
            { cmd: 'if', var: 'q', value: 'done', jump: 'is-done' },
            { cmd: 'mark', label: 'not-done' },
            { cmd: 'jump', target: 'end' },
            { cmd: 'label', name: 'is-done' },
            { cmd: 'mark', label: 'done' },
            { cmd: 'label', name: 'end' },
          ],
        },
      });
      scriptCore.events.emitSync('script/run', { id: 'test-branch' });
      await flushMicrotasks();

      expect(visited).toEqual(['done']);
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('clears the store and stops responding to events', () => {
      core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 1 });
      store.destroy(core);

      const { output } = core.events.emitSync<object, StoreGetOutput>(
        'store/get',
        { ns: 'player', key: 'gold' },
      );
      // Handler was removed — output stays as initialised by the bus
      expect(output.value).toBeUndefined();
    });
  });
});
