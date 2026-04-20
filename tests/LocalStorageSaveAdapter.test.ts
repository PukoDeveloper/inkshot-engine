import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SaveManager } from '../src/plugins/SaveManager.js';
import {
  LocalStorageSaveAdapter,
  type StorageLike,
} from '../src/plugins/LocalStorageSaveAdapter.js';
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

/** In-memory storage mock — implements the StorageLike interface. */
function createMockStorage(): StorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalStorageSaveAdapter', () => {
  let core: Core;
  let storage: ReturnType<typeof createMockStorage>;

  /** Helper: set up a full save stack (SaveManager + adapter). */
  function setup(keyPrefix?: string): void {
    core = createStubCore();
    storage = createMockStorage();

    const saveManager = new SaveManager();
    const adapter = new LocalStorageSaveAdapter({ storage, keyPrefix });
    saveManager.init(core);
    adapter.init(core);
  }

  beforeEach(() => {
    setup();
  });

  // -------------------------------------------------------------------------
  // save/slot:save  →  storage
  // -------------------------------------------------------------------------

  describe('save/slot:save → persists to storage', () => {
    it('writes the slot as JSON after a successful save', async () => {
      core.events.emitSync('save/slot:set', { id: 'slot-1', patch: { gold: 50 } });
      const { output } = await core.events.emit<{ id: string }, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 'slot-1' },
      );

      expect(output.saved).toBe(true);
      const stored = storage.getItem('inkshot:slot:slot-1');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!) as { data: { gold: number } };
      expect(parsed.data.gold).toBe(50);
    });

    it('does not write to storage when the slot does not exist', async () => {
      const { output } = await core.events.emit<{ id: string }, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 'missing' },
      );

      expect(output.saved).toBe(false);
      expect(storage.getItem('inkshot:slot:missing')).toBeNull();
    });

    it('respects a custom keyPrefix', async () => {
      setup('mygame:');
      core.events.emitSync('save/slot:set', { id: 's1', patch: {} });
      await core.events.emit('save/slot:save', { id: 's1' });

      expect(storage.getItem('mygame:slot:s1')).not.toBeNull();
      expect(storage.getItem('inkshot:slot:s1')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // save/slot:load  ←  storage
  // -------------------------------------------------------------------------

  describe('save/slot:load → restores from storage', () => {
    it('reads stored JSON and restores the slot into memory', async () => {
      // Manually pre-populate storage with serialised slot data.
      const serialised = {
        meta: { id: 'slot-2', name: 'Chapter 2', createdAt: 1000, updatedAt: 2000 },
        data: { chapter: 2 },
      };
      storage.setItem('inkshot:slot:slot-2', JSON.stringify(serialised));

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

    it('sets loaded=false when there is no entry in storage', async () => {
      const { output } = await core.events.emit<{ id: string }, SaveSlotLoadOutput>(
        'save/slot:load',
        { id: 'nonexistent' },
      );

      expect(output.loaded).toBe(false);
    });

    it('sets loaded=false when storage contains corrupt JSON', async () => {
      storage.setItem('inkshot:slot:bad', 'NOT_VALID_JSON');

      const { output } = await core.events.emit<{ id: string }, SaveSlotLoadOutput>(
        'save/slot:load',
        { id: 'bad' },
      );

      expect(output.loaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip  (save/slot:set → save/slot:save → save/slot:load)
  // -------------------------------------------------------------------------

  describe('round-trip slot save / load', () => {
    it('persists and fully restores a slot across a fresh memory state', async () => {
      // Write and persist.
      core.events.emitSync('save/slot:set', { id: 'rt', patch: { hp: 80, mp: 40 } });
      await core.events.emit('save/slot:save', { id: 'rt' });

      // Simulate memory loss (destroy SaveManager state and reinit on a fresh core).
      const core2 = createStubCore();
      const saveManager2 = new SaveManager();
      const adapter2 = new LocalStorageSaveAdapter({ storage });
      saveManager2.init(core2);
      adapter2.init(core2);

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
  // save/slot:delete  →  storage
  // -------------------------------------------------------------------------

  describe('save/slot:delete → removes from storage', () => {
    it('removes the persisted key after deleting the slot', async () => {
      core.events.emitSync('save/slot:set', { id: 'del', patch: {} });
      await core.events.emit('save/slot:save', { id: 'del' });

      expect(storage.getItem('inkshot:slot:del')).not.toBeNull();

      const { output } = await core.events.emit<{ id: string }, SaveSlotDeleteOutput>(
        'save/slot:delete',
        { id: 'del' },
      );

      expect(output.deleted).toBe(true);
      expect(storage.getItem('inkshot:slot:del')).toBeNull();
    });

    it('does not throw when deleting a slot that was never persisted', async () => {
      await expect(
        core.events.emit('save/slot:delete', { id: 'never-saved' }),
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // save/global:save  →  storage
  // -------------------------------------------------------------------------

  describe('save/global:save → persists to storage', () => {
    it('writes global data as JSON after a successful save', async () => {
      core.events.emitSync('save/global:set', { patch: { lang: 'zh-TW', volume: 90 } });
      const { output } = await core.events.emit<Record<string, never>, SaveGlobalSaveOutput>(
        'save/global:save',
        {} as Record<string, never>,
      );

      expect(output.saved).toBe(true);
      const stored = storage.getItem('inkshot:global');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!) as { data: { lang: string; volume: number } };
      expect(parsed.data.lang).toBe('zh-TW');
      expect(parsed.data.volume).toBe(90);
    });
  });

  // -------------------------------------------------------------------------
  // save/global:load  ←  storage
  // -------------------------------------------------------------------------

  describe('save/global:load → restores from storage', () => {
    it('reads stored JSON and restores global data into memory', async () => {
      const serialised = { data: { unlocked: true }, updatedAt: 9999 };
      storage.setItem('inkshot:global', JSON.stringify(serialised));

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

    it('sets loaded=false when there is no global entry in storage', async () => {
      const { output } = await core.events.emit<Record<string, never>, SaveGlobalLoadOutput>(
        'save/global:load',
        {} as Record<string, never>,
      );

      expect(output.loaded).toBe(false);
    });

    it('sets loaded=false when global storage contains corrupt JSON', async () => {
      storage.setItem('inkshot:global', '}{CORRUPT}{');

      const { output } = await core.events.emit<Record<string, never>, SaveGlobalLoadOutput>(
        'save/global:load',
        {} as Record<string, never>,
      );

      expect(output.loaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip  (save/global:set → save/global:save → save/global:load)
  // -------------------------------------------------------------------------

  describe('round-trip global save / load', () => {
    it('persists and restores global data across a fresh memory state', async () => {
      core.events.emitSync('save/global:set', { patch: { achievements: ['first-kill'] } });
      await core.events.emit('save/global:save', {} as Record<string, never>);

      const core2 = createStubCore();
      const saveManager2 = new SaveManager();
      const adapter2 = new LocalStorageSaveAdapter({ storage });
      saveManager2.init(core2);
      adapter2.init(core2);

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
      const adapter = new LocalStorageSaveAdapter({ storage });
      const core3 = createStubCore();
      const sm3 = new SaveManager();
      sm3.init(core3);
      adapter.init(core3);

      core3.events.emitSync('save/slot:set', { id: 'x', patch: { a: 1 } });
      adapter.destroy(core3);

      // After destroy, save should not write to storage.
      storage.removeItem('inkshot:slot:x');
      await core3.events.emit('save/slot:save', { id: 'x' });
      expect(storage.getItem('inkshot:slot:x')).toBeNull();
    });
  });
});
