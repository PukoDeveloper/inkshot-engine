import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SaveManager } from '../src/plugins/save/SaveManager.js';
import {
  IndexedDBSaveAdapter,
  type IDBStoreLike,
} from '../src/plugins/save/IndexedDBSaveAdapter.js';
import type { Core } from '../src/core/Core.js';
import type {
  SaveSlotGetOutput,
  SaveSlotSaveOutput,
  SaveSlotLoadOutput,
  SaveSlotDeleteOutput,
  SaveGlobalGetOutput,
  SaveGlobalSaveOutput,
  SaveGlobalLoadOutput,
} from '../src/types/save.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** In-memory IDBStoreLike mock — no IndexedDB dependency required in tests. */
function createMockIDBStore(): IDBStoreLike & {
  data: Map<string, Map<string, unknown>>;
} {
  const data: Map<string, Map<string, unknown>> = new Map();

  const ensureStore = (storeName: string): Map<string, unknown> => {
    if (!data.has(storeName)) data.set(storeName, new Map());
    return data.get(storeName)!;
  };

  return {
    data,
    async get(storeName, key) {
      return ensureStore(storeName).get(key);
    },
    async put(storeName, key, value) {
      ensureStore(storeName).set(key, value);
    },
    async delete(storeName, key) {
      ensureStore(storeName).delete(key);
    },
  };
}

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IndexedDBSaveAdapter', () => {
  let core: Core;
  let idbStore: ReturnType<typeof createMockIDBStore>;

  /** Set up a full save stack (SaveManager + adapter). */
  async function setup(): Promise<void> {
    core = createStubCore();
    idbStore = createMockIDBStore();

    const saveManager = new SaveManager();
    const adapter = new IndexedDBSaveAdapter({ idbStore });
    saveManager.init(core);
    await adapter.init(core);
  }

  beforeEach(async () => {
    await setup();
  });

  // -------------------------------------------------------------------------
  // save/slot:save  →  IDB
  // -------------------------------------------------------------------------

  describe('save/slot:save → persists to IDB', () => {
    it('writes the slot to IDB after a successful save', async () => {
      core.events.emitSync('save/slot:set', { id: 'slot-1', patch: { gold: 50 } });
      const { output } = await core.events.emit<{ id: string }, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 'slot-1' },
      );

      expect(output.saved).toBe(true);
      const stored = idbStore.data.get('slots')?.get('slot-1');
      expect(stored).toBeDefined();
      expect((stored as { data: { gold: number } }).data.gold).toBe(50);
    });

    it('does not write to IDB when the slot does not exist', async () => {
      const { output } = await core.events.emit<{ id: string }, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 'missing' },
      );

      expect(output.saved).toBe(false);
      expect(idbStore.data.get('slots')?.has('missing')).toBeFalsy();
    });

    it('preserves structured data (object references are stored by value)', async () => {
      const inventory = [{ name: 'sword', qty: 1 }, { name: 'shield', qty: 1 }];
      core.events.emitSync('save/slot:set', { id: 's2', patch: { inventory } });
      await core.events.emit('save/slot:save', { id: 's2' });

      const stored = idbStore.data.get('slots')?.get('s2') as {
        data: { inventory: typeof inventory };
      };
      expect(stored.data.inventory).toHaveLength(2);
      expect(stored.data.inventory[0].name).toBe('sword');
    });
  });

  // -------------------------------------------------------------------------
  // save/slot:load  ←  IDB
  // -------------------------------------------------------------------------

  describe('save/slot:load → restores from IDB', () => {
    it('reads stored data and restores the slot into memory', async () => {
      const serialised = {
        meta: { id: 'slot-2', name: 'Chapter 2', createdAt: 1000, updatedAt: 2000 },
        data: { chapter: 2 },
      };
      await idbStore.put('slots', 'slot-2', serialised);

      const { output } = await core.events.emit<{ id: string }, SaveSlotLoadOutput>(
        'save/slot:load',
        { id: 'slot-2' },
      );

      expect(output.loaded).toBe(true);

      const { output: get } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'slot-2' },
      );
      expect(get.slot?.data.chapter).toBe(2);
    });

    it('sets loaded=false when there is no entry in IDB', async () => {
      const { output } = await core.events.emit<{ id: string }, SaveSlotLoadOutput>(
        'save/slot:load',
        { id: 'nonexistent' },
      );

      expect(output.loaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip  (save → load)
  // -------------------------------------------------------------------------

  describe('round-trip slot save / load', () => {
    it('persists and fully restores a slot across a fresh memory state', async () => {
      core.events.emitSync('save/slot:set', { id: 'rt', patch: { hp: 80, mp: 40 } });
      await core.events.emit('save/slot:save', { id: 'rt' });

      // Simulate memory loss — fresh core + manager sharing the same IDB store.
      const core2 = createStubCore();
      const saveManager2 = new SaveManager();
      const adapter2 = new IndexedDBSaveAdapter({ idbStore });
      saveManager2.init(core2);
      await adapter2.init(core2);

      const { output } = await core2.events.emit<{ id: string }, SaveSlotLoadOutput>(
        'save/slot:load',
        { id: 'rt' },
      );
      expect(output.loaded).toBe(true);

      const { output: get } = core2.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'rt' },
      );
      expect(get.slot?.data.hp).toBe(80);
      expect(get.slot?.data.mp).toBe(40);
    });
  });

  // -------------------------------------------------------------------------
  // save/slot:delete  →  IDB
  // -------------------------------------------------------------------------

  describe('save/slot:delete → removes from IDB', () => {
    it('removes the persisted entry after deleting the slot', async () => {
      core.events.emitSync('save/slot:set', { id: 'del', patch: {} });
      await core.events.emit('save/slot:save', { id: 'del' });

      expect(idbStore.data.get('slots')?.has('del')).toBe(true);

      const { output } = await core.events.emit<{ id: string }, SaveSlotDeleteOutput>(
        'save/slot:delete',
        { id: 'del' },
      );

      expect(output.deleted).toBe(true);
      expect(idbStore.data.get('slots')?.has('del')).toBe(false);
    });

    it('does not throw when deleting a slot that was never persisted', async () => {
      await expect(
        core.events.emit('save/slot:delete', { id: 'never-saved' }),
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // save/global:save  →  IDB
  // -------------------------------------------------------------------------

  describe('save/global:save → persists to IDB', () => {
    it('writes global data to IDB after a successful save', async () => {
      core.events.emitSync('save/global:set', { patch: { lang: 'zh-TW', volume: 90 } });
      const { output } = await core.events.emit<Record<string, never>, SaveGlobalSaveOutput>(
        'save/global:save',
        {} as Record<string, never>,
      );

      expect(output.saved).toBe(true);
      const stored = idbStore.data.get('global')?.get('__global__') as {
        data: { lang: string; volume: number };
      };
      expect(stored).toBeDefined();
      expect(stored.data.lang).toBe('zh-TW');
      expect(stored.data.volume).toBe(90);
    });
  });

  // -------------------------------------------------------------------------
  // save/global:load  ←  IDB
  // -------------------------------------------------------------------------

  describe('save/global:load → restores from IDB', () => {
    it('reads stored data and restores global data into memory', async () => {
      const serialised = { data: { unlocked: true }, updatedAt: 9999 };
      await idbStore.put('global', '__global__', serialised);

      const { output } = await core.events.emit<Record<string, never>, SaveGlobalLoadOutput>(
        'save/global:load',
        {} as Record<string, never>,
      );

      expect(output.loaded).toBe(true);

      const { output: get } = core.events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
        'save/global:get',
        {} as Record<string, never>,
      );
      expect(get.data?.data.unlocked).toBe(true);
    });

    it('sets loaded=false when there is no global entry in IDB', async () => {
      const { output } = await core.events.emit<Record<string, never>, SaveGlobalLoadOutput>(
        'save/global:load',
        {} as Record<string, never>,
      );

      expect(output.loaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip  (global save → global load)
  // -------------------------------------------------------------------------

  describe('round-trip global save / load', () => {
    it('persists and restores global data across a fresh memory state', async () => {
      core.events.emitSync('save/global:set', { patch: { achievements: ['first-kill'] } });
      await core.events.emit('save/global:save', {} as Record<string, never>);

      const core2 = createStubCore();
      const saveManager2 = new SaveManager();
      const adapter2 = new IndexedDBSaveAdapter({ idbStore });
      saveManager2.init(core2);
      await adapter2.init(core2);

      await core2.events.emit('save/global:load', {} as Record<string, never>);

      const { output: get } = core2.events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
        'save/global:get',
        {} as Record<string, never>,
      );
      expect(get.data?.data.achievements).toEqual(['first-kill']);
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops responding to save events after destroy', async () => {
      const localIDB = createMockIDBStore();
      const adapter = new IndexedDBSaveAdapter({ idbStore: localIDB });
      const destroyTestCore = createStubCore();
      const destroyTestSaveManager = new SaveManager();
      destroyTestSaveManager.init(destroyTestCore);
      await adapter.init(destroyTestCore);

      destroyTestCore.events.emitSync('save/slot:set', { id: 'x', patch: { a: 1 } });
      adapter.destroy(destroyTestCore);

      // After destroy, save should not write to IDB.
      localIDB.data.clear();
      await destroyTestCore.events.emit('save/slot:save', { id: 'x' });
      expect(localIDB.data.get('slots')?.has('x')).toBeFalsy();
    });
  });
});
