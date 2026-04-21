import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SaveManager } from '../src/plugins/save/SaveManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  SaveSlotGetOutput,
  SaveSlotListOutput,
  SaveSlotSaveOutput,
  SaveSlotLoadOutput,
  SaveSlotDeleteOutput,
  SaveGlobalGetOutput,
  SaveGlobalSaveOutput,
  SaveGlobalLoadOutput,
} from '../src/types/save.js';

/** Create a minimal Core stub that only exposes the EventBus. */
function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

describe('SaveManager', () => {
  let core: Core;
  let save: SaveManager;

  beforeEach(() => {
    core = createStubCore();
    save = new SaveManager();
    save.init(core);
  });

  // -------------------------------------------------------------------------
  // Slot: set + get
  // -------------------------------------------------------------------------

  describe('save/slot:set + save/slot:get', () => {
    it('creates a new slot when it does not exist', () => {
      core.events.emitSync('save/slot:set', { id: 's1', patch: { gold: 100 } });

      const { output } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 's1' },
      );

      expect(output.slot).toBeDefined();
      expect(output.slot!.data.gold).toBe(100);
      expect(output.slot!.meta.id).toBe('s1');
      expect(output.slot!.meta.name).toBe('s1'); // default name = id
    });

    it('shallow-merges patch into an existing slot', () => {
      core.events.emitSync('save/slot:set', { id: 's1', patch: { gold: 100, hp: 50 } });
      core.events.emitSync('save/slot:set', { id: 's1', patch: { gold: 200 } });

      const { output } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 's1' },
      );

      expect(output.slot!.data.gold).toBe(200);
      expect(output.slot!.data.hp).toBe(50);
    });

    it('supports a custom name on creation', () => {
      core.events.emitSync('save/slot:set', {
        id: 's1',
        patch: {},
        name: 'My Save',
      });

      const { output } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 's1' },
      );

      expect(output.slot!.meta.name).toBe('My Save');
    });

    it('returns undefined for a non-existent slot', () => {
      const { output } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'nope' },
      );

      expect(output.slot).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Slot: list
  // -------------------------------------------------------------------------

  describe('save/slot:list', () => {
    it('returns metadata for all slots', () => {
      core.events.emitSync('save/slot:set', { id: 's1', patch: { a: 1 } });
      core.events.emitSync('save/slot:set', { id: 's2', patch: { b: 2 } });

      const { output } = core.events.emitSync<Record<string, never>, SaveSlotListOutput>(
        'save/slot:list',
        {} as Record<string, never>,
      );

      expect(output.slots).toHaveLength(2);
      expect(output.slots.map((s) => s.id)).toEqual(['s1', 's2']);
    });

    it('returns an empty array when no slots exist', () => {
      const { output } = core.events.emitSync<Record<string, never>, SaveSlotListOutput>(
        'save/slot:list',
        {} as Record<string, never>,
      );

      expect(output.slots).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Slot: save (serialise)
  // -------------------------------------------------------------------------

  describe('save/slot:save', () => {
    it('serialises a deep-cloned snapshot of the slot', () => {
      core.events.emitSync('save/slot:set', { id: 's1', patch: { gold: 100 } });

      const { output } = core.events.emitSync<{ id: string }, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 's1' },
      );

      expect(output.data).toBeDefined();
      expect(output.data!.data.gold).toBe(100);

      // Must be a deep clone — mutating it should not affect the live slot.
      output.data!.data.gold = 999;
      const { output: live } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 's1' },
      );
      expect(live.slot!.data.gold).toBe(100);
    });

    it('returns saved=false and data=undefined for a missing slot', () => {
      const { output } = core.events.emitSync<{ id: string }, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 'nope' },
      );

      expect(output.data).toBeUndefined();
      expect(output.saved).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Slot: load (restore)
  // -------------------------------------------------------------------------

  describe('save/slot:load', () => {
    it('restores a slot from output.raw provided in the before phase', async () => {
      const rawSlot = {
        meta: { id: 'restored', name: 'Restored', createdAt: 1000, updatedAt: 2000 },
        data: { level: 5 },
      };

      // Simulate an environment plugin setting output.raw in the before phase.
      core.events.on('env', 'save/slot:load', (_p, output: SaveSlotLoadOutput) => {
        output.raw = rawSlot;
      }, { phase: 'before' });

      await core.events.emit('save/slot:load', { id: 'restored' });

      const { output } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'restored' },
      );

      expect(output.slot).toBeDefined();
      expect(output.slot!.data.level).toBe(5);
    });

    it('sets loaded=false when no raw data is provided', async () => {
      const { output } = await core.events.emit<{ id: string }, SaveSlotLoadOutput>(
        'save/slot:load',
        { id: 'empty' },
      );

      expect(output.loaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Slot: delete
  // -------------------------------------------------------------------------

  describe('save/slot:delete', () => {
    it('removes an existing slot', () => {
      core.events.emitSync('save/slot:set', { id: 's1', patch: {} });

      const { output } = core.events.emitSync<{ id: string }, SaveSlotDeleteOutput>(
        'save/slot:delete',
        { id: 's1' },
      );

      expect(output.deleted).toBe(true);

      const { output: get } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 's1' },
      );
      expect(get.slot).toBeUndefined();
    });

    it('returns deleted=false for a non-existent slot', () => {
      const { output } = core.events.emitSync<{ id: string }, SaveSlotDeleteOutput>(
        'save/slot:delete',
        { id: 'nope' },
      );

      expect(output.deleted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Global data
  // -------------------------------------------------------------------------

  describe('save/global:set + save/global:get', () => {
    it('shallow-merges data into the global store', () => {
      core.events.emitSync('save/global:set', { patch: { volume: 80 } });
      core.events.emitSync('save/global:set', { patch: { lang: 'en' } });

      const { output } = core.events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
        'save/global:get',
        {} as Record<string, never>,
      );

      expect(output.data!.data).toEqual({ volume: 80, lang: 'en' });
    });
  });

  describe('save/global:save', () => {
    it('serialises a deep-cloned snapshot of global data', () => {
      core.events.emitSync('save/global:set', { patch: { key: 'val' } });

      const { output } = core.events.emitSync<Record<string, never>, SaveGlobalSaveOutput>(
        'save/global:save',
        {} as Record<string, never>,
      );

      expect(output.data!.data.key).toBe('val');

      // Verify it's a deep clone.
      output.data!.data.key = 'mutated';
      const { output: live } = core.events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
        'save/global:get',
        {} as Record<string, never>,
      );
      expect(live.data!.data.key).toBe('val');
    });
  });

  describe('save/global:load', () => {
    it('restores global data from output.raw', async () => {
      const rawGlobal = { data: { restored: true }, updatedAt: 5000 };

      core.events.on('env', 'save/global:load', (_p, output: SaveGlobalLoadOutput) => {
        output.raw = rawGlobal;
      }, { phase: 'before' });

      const { output } = await core.events.emit('save/global:load', {});

      expect(output.loaded).toBe(true);

      const { output: get } = core.events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
        'save/global:get',
        {} as Record<string, never>,
      );
      expect(get.data!.data.restored).toBe(true);
    });

    it('sets loaded=false when no raw data is provided', async () => {
      const { output } = await core.events.emit<Record<string, never>, SaveGlobalLoadOutput>(
        'save/global:load',
        {} as Record<string, never>,
      );

      expect(output.loaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('clears all slots and stops responding to events', () => {
      core.events.emitSync('save/slot:set', { id: 's1', patch: {} });
      save.destroy(core);

      const { output } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 's1' },
      );
      // Handler was removed, output stays empty.
      expect(output.slot).toBeUndefined();
    });
  });
});
