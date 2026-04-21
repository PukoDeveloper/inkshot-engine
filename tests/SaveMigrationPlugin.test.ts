import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SaveManager } from '../src/plugins/save/SaveManager.js';
import { SaveMigrationPlugin } from '../src/plugins/save/SaveMigrationPlugin.js';
import type { StorageLike } from '../src/plugins/save/LocalStorageSaveAdapter.js';
import { LocalStorageSaveAdapter } from '../src/plugins/save/LocalStorageSaveAdapter.js';
import type { Core } from '../src/core/Core.js';
import type {
  SaveSlotGetOutput,
  SaveSlotSaveOutput,
  SaveSlotLoadOutput,
  SaveGlobalGetOutput,
  SaveGlobalSaveOutput,
  SaveGlobalLoadOutput,
} from '../src/types/save.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStorage(): StorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
}

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SaveMigrationPlugin', () => {
  let core: Core;
  let storage: ReturnType<typeof createMockStorage>;

  function setup(currentVersion: number = 1): void {
    core = createStubCore();
    storage = createMockStorage();

    const saveManager = new SaveManager();
    const adapter = new LocalStorageSaveAdapter({ storage });
    const migrator = new SaveMigrationPlugin({
      currentVersion,
      migrations: [
        {
          fromVersion: 0,
          slot: (data) => {
            // v0 → v1: rename `gold` to `coins`
            if (typeof data['gold'] === 'number') {
              data['coins'] = data['gold'];
              delete data['gold'];
            }
            return data;
          },
          global: (data) => {
            // v0 → v1: rename `lang` to `locale`
            if (typeof data['lang'] === 'string') {
              data['locale'] = data['lang'];
              delete data['lang'];
            }
            return data;
          },
        },
      ],
    });

    saveManager.init(core);
    adapter.init(core);
    migrator.init(core);
  }

  beforeEach(() => {
    setup(1);
  });

  // -------------------------------------------------------------------------
  // Version stamping on save
  // -------------------------------------------------------------------------

  describe('version stamping on save', () => {
    it('stamps currentVersion onto slot meta when saving', async () => {
      core.events.emitSync('save/slot:set', { id: 's1', patch: { coins: 100 } });
      const { output } = await core.events.emit<{ id: string }, SaveSlotSaveOutput>(
        'save/slot:save',
        { id: 's1' },
      );

      expect(output.saved).toBe(true);

      const raw = JSON.parse(storage.store['inkshot:slot:s1']!) as {
        meta: { version: number };
      };
      expect(raw.meta.version).toBe(1);
    });

    it('stamps currentVersion onto global data when saving', async () => {
      core.events.emitSync('save/global:set', { patch: { locale: 'zh-TW' } });
      const { output } = await core.events.emit<Record<string, never>, SaveGlobalSaveOutput>(
        'save/global:save',
        {} as Record<string, never>,
      );

      expect(output.saved).toBe(true);

      const raw = JSON.parse(storage.store['inkshot:global']!) as { version: number };
      expect(raw.version).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Migration on load — slot
  // -------------------------------------------------------------------------

  describe('slot migration on load', () => {
    it('applies migration when stored version is lower than currentVersion', async () => {
      // Simulate legacy save data at version 0 (no version field).
      const legacySlot = {
        meta: { id: 'old-slot', name: 'Legacy', createdAt: 1000, updatedAt: 2000 },
        data: { gold: 200, hp: 50 },
      };
      storage.setItem('inkshot:slot:old-slot', JSON.stringify(legacySlot));

      const { output } = await core.events.emit<{ id: string }, SaveSlotLoadOutput>(
        'save/slot:load',
        { id: 'old-slot' },
      );
      expect(output.loaded).toBe(true);

      const { output: get } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'old-slot' },
      );

      // `gold` should have been renamed to `coins`
      expect(get.slot?.data.coins).toBe(200);
      expect(get.slot?.data.gold).toBeUndefined();
      // Other fields are preserved
      expect(get.slot?.data.hp).toBe(50);
    });

    it('does not apply migration when stored version equals currentVersion', async () => {
      const upToDateSlot = {
        meta: { id: 'current', name: 'Current', createdAt: 1000, updatedAt: 2000, version: 1 },
        data: { coins: 100 },
      };
      storage.setItem('inkshot:slot:current', JSON.stringify(upToDateSlot));

      await core.events.emit('save/slot:load', { id: 'current' });

      const { output: get } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'current' },
      );

      expect(get.slot?.data.coins).toBe(100);
      // `gold` field should not have appeared
      expect(get.slot?.data.gold).toBeUndefined();
    });

    it('preserves unrelated data fields during migration', async () => {
      const legacySlot = {
        meta: { id: 'extra', name: 'Extra', createdAt: 0, updatedAt: 0 },
        data: { gold: 5, level: 7, quests: ['a', 'b'] },
      };
      storage.setItem('inkshot:slot:extra', JSON.stringify(legacySlot));

      await core.events.emit('save/slot:load', { id: 'extra' });

      const { output: get } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'extra' },
      );

      expect(get.slot?.data.coins).toBe(5);
      expect(get.slot?.data.level).toBe(7);
      expect(get.slot?.data.quests).toEqual(['a', 'b']);
    });
  });

  // -------------------------------------------------------------------------
  // Migration on load — global
  // -------------------------------------------------------------------------

  describe('global migration on load', () => {
    it('applies migration when stored version is lower than currentVersion', async () => {
      const legacyGlobal = { data: { lang: 'en', volume: 80 }, updatedAt: 1000 };
      storage.setItem('inkshot:global', JSON.stringify(legacyGlobal));

      const { output } = await core.events.emit<Record<string, never>, SaveGlobalLoadOutput>(
        'save/global:load',
        {} as Record<string, never>,
      );
      expect(output.loaded).toBe(true);

      const { output: get } = core.events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
        'save/global:get',
        {} as Record<string, never>,
      );

      // `lang` should have been renamed to `locale`
      expect(get.data?.data.locale).toBe('en');
      expect(get.data?.data.lang).toBeUndefined();
      expect(get.data?.data.volume).toBe(80);
    });

    it('does not apply migration when stored version equals currentVersion', async () => {
      const upToDateGlobal = { data: { locale: 'zh-TW' }, updatedAt: 0, version: 1 };
      storage.setItem('inkshot:global', JSON.stringify(upToDateGlobal));

      await core.events.emit('save/global:load', {} as Record<string, never>);

      const { output: get } = core.events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
        'save/global:get',
        {} as Record<string, never>,
      );

      expect(get.data?.data.locale).toBe('zh-TW');
    });
  });

  // -------------------------------------------------------------------------
  // Multi-step migration
  // -------------------------------------------------------------------------

  describe('multi-step migration chain', () => {
    it('applies all intermediate steps when jumping multiple versions', async () => {
      // Set up: current version = 3, with steps 0→1, 1→2, 2→3
      core = createStubCore();
      storage = createMockStorage();

      const saveManager = new SaveManager();
      const adapter = new LocalStorageSaveAdapter({ storage });
      const migrator = new SaveMigrationPlugin({
        currentVersion: 3,
        migrations: [
          {
            fromVersion: 0,
            slot: (data) => {
              data['step1'] = true;
              return data;
            },
          },
          {
            fromVersion: 1,
            slot: (data) => {
              data['step2'] = true;
              return data;
            },
          },
          {
            fromVersion: 2,
            slot: (data) => {
              data['step3'] = true;
              return data;
            },
          },
        ],
      });

      saveManager.init(core);
      adapter.init(core);
      migrator.init(core);

      // Slot at version 0 (no version field)
      const v0Slot = {
        meta: { id: 'chain', name: 'Chain', createdAt: 0, updatedAt: 0 },
        data: { original: 'yes' },
      };
      storage.setItem('inkshot:slot:chain', JSON.stringify(v0Slot));

      await core.events.emit('save/slot:load', { id: 'chain' });

      const { output: get } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'chain' },
      );

      expect(get.slot?.data.original).toBe('yes');
      expect(get.slot?.data.step1).toBe(true);
      expect(get.slot?.data.step2).toBe(true);
      expect(get.slot?.data.step3).toBe(true);
    });

    it('only runs missing steps when starting from an intermediate version', async () => {
      core = createStubCore();
      storage = createMockStorage();

      const saveManager = new SaveManager();
      const adapter = new LocalStorageSaveAdapter({ storage });
      const migrator = new SaveMigrationPlugin({
        currentVersion: 3,
        migrations: [
          {
            fromVersion: 0,
            slot: (data) => {
              data['step1'] = true;
              return data;
            },
          },
          {
            fromVersion: 1,
            slot: (data) => {
              data['step2'] = true;
              return data;
            },
          },
          {
            fromVersion: 2,
            slot: (data) => {
              data['step3'] = true;
              return data;
            },
          },
        ],
      });

      saveManager.init(core);
      adapter.init(core);
      migrator.init(core);

      // Slot at version 2 — only step3 should run
      const v2Slot = {
        meta: { id: 'partial', name: 'Partial', createdAt: 0, updatedAt: 0, version: 2 },
        data: { original: 'yes' },
      };
      storage.setItem('inkshot:slot:partial', JSON.stringify(v2Slot));

      await core.events.emit('save/slot:load', { id: 'partial' });

      const { output: get } = core.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'partial' },
      );

      expect(get.slot?.data.step1).toBeUndefined();
      expect(get.slot?.data.step2).toBeUndefined();
      expect(get.slot?.data.step3).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip: save (stamps version) → load (migration skipped)
  // -------------------------------------------------------------------------

  describe('round-trip save/load with migration stamping', () => {
    it('stamps version on save and skips migration on subsequent load', async () => {
      core.events.emitSync('save/slot:set', { id: 'v1slot', patch: { coins: 99 } });
      await core.events.emit('save/slot:save', { id: 'v1slot' });

      // Check version was stamped
      const raw = JSON.parse(storage.store['inkshot:slot:v1slot']!) as {
        meta: { version: number };
        data: { coins: number };
      };
      expect(raw.meta.version).toBe(1);

      // Reload — migration should NOT run (version already current)
      const core2 = createStubCore();
      const sm2 = new SaveManager();
      const adapter2 = new LocalStorageSaveAdapter({ storage });
      const migrator2 = new SaveMigrationPlugin({
        currentVersion: 1,
        migrations: [
          {
            fromVersion: 0,
            slot: (data) => {
              // This should NOT run because data is already at version 1
              data['migrated'] = true;
              return data;
            },
          },
        ],
      });
      sm2.init(core2);
      adapter2.init(core2);
      migrator2.init(core2);

      await core2.events.emit('save/slot:load', { id: 'v1slot' });

      const { output: get } = core2.events.emitSync<{ id: string }, SaveSlotGetOutput>(
        'save/slot:get',
        { id: 'v1slot' },
      );

      expect(get.slot?.data.coins).toBe(99);
      expect(get.slot?.data.migrated).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops responding to events after destroy', async () => {
      const migrator = new SaveMigrationPlugin({
        currentVersion: 1,
        migrations: [],
      });
      const destroyTestCore = createStubCore();
      const destroyTestSaveManager = new SaveManager();
      const destroyTestStorage = createMockStorage();
      const destroyTestAdapter = new LocalStorageSaveAdapter({ storage: destroyTestStorage });
      destroyTestSaveManager.init(destroyTestCore);
      destroyTestAdapter.init(destroyTestCore);
      migrator.init(destroyTestCore);
      migrator.destroy(destroyTestCore);

      destroyTestCore.events.emitSync('save/slot:set', { id: 'y', patch: { a: 1 } });
      await destroyTestCore.events.emit('save/slot:save', { id: 'y' });

      // After destroy, version is NOT stamped (migration plugin is inactive)
      const raw = JSON.parse(destroyTestStorage.store['inkshot:slot:y']!) as {
        meta: { version?: number };
      };
      expect(raw.meta.version).toBeUndefined();
    });
  });
});
