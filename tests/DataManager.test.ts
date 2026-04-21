import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { DataManager } from '../src/plugins/data/DataManager.js';
import type { Core } from '../src/core/Core.js';
import type { DataLoadOutput, DataGetOutput, DataGetAllOutput, DataUnloadOutput } from '../src/types/data.js';

function createStubCore(dataRoot = '/'): Core {
  return { events: new EventBus(), dataRoot } as unknown as Core;
}

describe('DataManager', () => {
  let core: Core;
  let dm: DataManager;

  beforeEach(() => {
    core = createStubCore('/assets/');
    dm = new DataManager();
    dm.init(core);
  });

  // -------------------------------------------------------------------------
  // data/load — inline entries
  // -------------------------------------------------------------------------

  describe('data/load (inline entries)', () => {
    it('loads a collection from inline entries', async () => {
      const { output } = await core.events.emit<
        { collection: string; entries: Record<string, unknown> },
        DataLoadOutput
      >('data/load', {
        collection: 'items',
        entries: { sword: { atk: 15 }, shield: { def: 10 } },
      });

      expect(output.loaded).toBe(true);
      expect(output.collection).toBe('items');
      expect(output.count).toBe(2);
    });

    it('merges additional entries into an existing collection', async () => {
      await core.events.emit('data/load', {
        collection: 'items',
        entries: { sword: { atk: 15 } },
      });
      await core.events.emit('data/load', {
        collection: 'items',
        entries: { shield: { def: 10 } },
      });

      const { output } = core.events.emitSync<{ collection: string }, DataGetAllOutput>(
        'data/getAll', { collection: 'items' },
      );

      expect(output.found).toBe(true);
      expect(Object.keys(output.entries)).toHaveLength(2);
      expect(output.entries['sword']).toEqual({ atk: 15 });
      expect(output.entries['shield']).toEqual({ def: 10 });
    });

    it('later load overwrites duplicate IDs', async () => {
      await core.events.emit('data/load', {
        collection: 'items',
        entries: { sword: { atk: 10 } },
      });
      await core.events.emit('data/load', {
        collection: 'items',
        entries: { sword: { atk: 99 } },
      });

      const { output } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'items', id: 'sword' },
      );

      expect(output.found).toBe(true);
      expect((output.data as { atk: number }).atk).toBe(99);
    });

    it('returns loaded: false and logs an error when neither file nor entries is supplied', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const { output } = await core.events.emit<{ collection: string }, DataLoadOutput>(
        'data/load', { collection: 'items' } as { collection: string },
      );

      expect(output.loaded).toBe(false);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // data/load — via fetch (mocked)
  // -------------------------------------------------------------------------

  describe('data/load (file / fetch)', () => {
    it('loads a collection from a JSON URL', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fireball: { cost: 10, dmg: 50 }, heal: { cost: 8, restore: 40 } }),
      } as Response);

      const { output } = await core.events.emit<{ collection: string; file: string }, DataLoadOutput>(
        'data/load', { collection: 'skills', file: 'data/skills.json' },
      );

      expect(fetchMock).toHaveBeenCalledWith('/assets/data/skills.json');
      expect(output.loaded).toBe(true);
      expect(output.collection).toBe('skills');
      expect(output.count).toBe(2);

      fetchMock.mockRestore();
    });

    it('resolves an absolute URL unchanged', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ goblin: {} }),
      } as Response);

      await core.events.emit('data/load', {
        collection: 'enemies',
        file: 'https://cdn.example.com/enemies.json',
      });

      expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/enemies.json');
      fetchMock.mockRestore();
    });

    it('returns loaded: false and logs an error on fetch failure', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const { output } = await core.events.emit<{ collection: string; file: string }, DataLoadOutput>(
        'data/load', { collection: 'items', file: 'missing.json' },
      );

      expect(output.loaded).toBe(false);
      expect(errorSpy).toHaveBeenCalled();

      fetchMock.mockRestore();
      errorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // data/get
  // -------------------------------------------------------------------------

  describe('data/get', () => {
    beforeEach(async () => {
      await core.events.emit('data/load', {
        collection: 'items',
        entries: { sword: { atk: 15 }, potion: { hp: 50 } },
      });
    });

    it('returns the correct entry for a known collection + id', () => {
      const { output } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'items', id: 'sword' },
      );

      expect(output.found).toBe(true);
      expect(output.data).toEqual({ atk: 15 });
    });

    it('returns found: false for an unknown id within a known collection', () => {
      const { output } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'items', id: 'nonexistent' },
      );

      expect(output.found).toBe(false);
      expect(output.data).toBeUndefined();
    });

    it('returns found: false for an unknown collection', () => {
      const { output } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'skills', id: 'fireball' },
      );

      expect(output.found).toBe(false);
    });

    it('does not mix entries across different collections', async () => {
      await core.events.emit('data/load', {
        collection: 'skills',
        entries: { fireball: { cost: 10 } },
      });

      // 'fireball' exists in 'skills' but not in 'items'
      const { output } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'items', id: 'fireball' },
      );

      expect(output.found).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // data/getAll
  // -------------------------------------------------------------------------

  describe('data/getAll', () => {
    it('returns all entries for a loaded collection', async () => {
      await core.events.emit('data/load', {
        collection: 'enemies',
        entries: { goblin: { hp: 20 }, dragon: { hp: 500 } },
      });

      const { output } = core.events.emitSync<{ collection: string }, DataGetAllOutput>(
        'data/getAll', { collection: 'enemies' },
      );

      expect(output.found).toBe(true);
      expect(Object.keys(output.entries)).toHaveLength(2);
      expect(output.entries['goblin']).toEqual({ hp: 20 });
      expect(output.entries['dragon']).toEqual({ hp: 500 });
    });

    it('returns found: false and empty entries for an unknown collection', () => {
      const { output } = core.events.emitSync<{ collection: string }, DataGetAllOutput>(
        'data/getAll', { collection: 'nonexistent' },
      );

      expect(output.found).toBe(false);
      expect(output.entries).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // data/unload
  // -------------------------------------------------------------------------

  describe('data/unload', () => {
    it('removes a loaded collection from memory', async () => {
      await core.events.emit('data/load', {
        collection: 'quests',
        entries: { main: { title: "Hero's Journey" } },
      });

      const { output: unloadOutput } = core.events.emitSync<{ collection: string }, DataUnloadOutput>(
        'data/unload', { collection: 'quests' },
      );
      expect(unloadOutput.unloaded).toBe(true);

      // Collection should no longer exist
      const { output: getAll } = core.events.emitSync<{ collection: string }, DataGetAllOutput>(
        'data/getAll', { collection: 'quests' },
      );
      expect(getAll.found).toBe(false);
    });

    it('returns unloaded: false for a non-existent collection', () => {
      const { output } = core.events.emitSync<{ collection: string }, DataUnloadOutput>(
        'data/unload', { collection: 'nonexistent' },
      );
      expect(output.unloaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple collections — explicit name isolation
  // -------------------------------------------------------------------------

  describe('collection isolation', () => {
    it('keeps separate entries for different collection names', async () => {
      await core.events.emit('data/load', {
        collection: 'items',
        entries: { sword: { atk: 15 } },
      });
      await core.events.emit('data/load', {
        collection: 'skills',
        entries: { fireball: { cost: 10 } },
      });

      const { output: item } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'items', id: 'sword' },
      );
      const { output: skill } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'skills', id: 'fireball' },
      );

      expect(item.found).toBe(true);
      expect(skill.found).toBe(true);

      // Cross-collection lookup should not find anything
      const { output: cross } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'items', id: 'fireball' },
      );
      expect(cross.found).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('clears all collections and stops responding to events', async () => {
      await core.events.emit('data/load', {
        collection: 'items',
        entries: { sword: { atk: 15 } },
      });

      dm.destroy(core);

      // Handler removed — output remains at defaults.
      const { output } = core.events.emitSync<{ collection: string; id: string }, DataGetOutput>(
        'data/get', { collection: 'items', id: 'sword' },
      );
      expect(output.found).toBeUndefined();
      expect(output.data).toBeUndefined();
    });
  });
});
