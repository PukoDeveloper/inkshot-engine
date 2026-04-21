import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SettingsManager } from '../src/plugins/SettingsManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  SettingsGetOutput,
  SettingsGetAllOutput,
  SettingsSaveOutput,
  SettingsLoadOutput,
  SettingsChangedParams,
} from '../src/types/settings.js';
import type {
  SaveGlobalGetOutput,
  SaveGlobalSaveOutput,
  SaveGlobalLoadOutput,
} from '../src/types/save.js';

/** Create a minimal Core stub that only exposes the EventBus. */
function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

describe('SettingsManager', () => {
  let core: Core;
  let manager: SettingsManager;

  beforeEach(() => {
    core = createStubCore();
    manager = new SettingsManager({
      defaults: {
        'volume.master': 1,
        'volume.bgm': 0.8,
        'volume.sfx': 1,
        locale: 'en',
        keyBindings: { jump: ['Space'] },
        fullscreen: false,
      },
    });
    manager.init(core);
  });

  // -------------------------------------------------------------------------
  // settings/get
  // -------------------------------------------------------------------------

  describe('settings/get', () => {
    it('returns the default value for a known key', () => {
      const { output } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'locale' },
      );
      expect(output.found).toBe(true);
      expect(output.value).toBe('en');
    });

    it('returns not found for an unknown key', () => {
      const { output } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'nonexistent' },
      );
      expect(output.found).toBe(false);
      expect(output.value).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // settings/get-all
  // -------------------------------------------------------------------------

  describe('settings/get-all', () => {
    it('returns a shallow copy of all settings', () => {
      const { output } = core.events.emitSync<Record<string, never>, SettingsGetAllOutput>(
        'settings/get-all',
        {},
      );
      expect(output.settings).toMatchObject({
        'volume.master': 1,
        'volume.bgm': 0.8,
        locale: 'en',
      });
    });

    it('returns a copy, not a live reference', () => {
      const { output } = core.events.emitSync<Record<string, never>, SettingsGetAllOutput>(
        'settings/get-all',
        {},
      );
      output.settings.locale = 'fr';

      const { output: out2 } = core.events.emitSync<Record<string, never>, SettingsGetAllOutput>(
        'settings/get-all',
        {},
      );
      expect(out2.settings.locale).toBe('en');
    });
  });

  // -------------------------------------------------------------------------
  // settings/set
  // -------------------------------------------------------------------------

  describe('settings/set', () => {
    it('merges the patch into the settings store', () => {
      core.events.emitSync('settings/set', { patch: { locale: 'zh-TW', fullscreen: true } });

      const { output } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'locale' },
      );
      expect(output.value).toBe('zh-TW');

      const { output: fs } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'fullscreen' },
      );
      expect(fs.value).toBe(true);
    });

    it('preserves keys not included in the patch', () => {
      core.events.emitSync('settings/set', { patch: { locale: 'fr' } });
      const { output } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'volume.master' },
      );
      expect(output.value).toBe(1);
    });

    it('emits settings/changed with the patch', () => {
      const changed: SettingsChangedParams[] = [];
      core.events.on('test', 'settings/changed', (p: SettingsChangedParams) => changed.push(p));

      core.events.emitSync('settings/set', { patch: { locale: 'ja' } });

      expect(changed).toHaveLength(1);
      expect(changed[0]!.changes).toEqual({ locale: 'ja' });
    });

    it('allows adding brand-new keys not in defaults', () => {
      core.events.emitSync('settings/set', { patch: { graphicsQuality: 'high' } });
      const { output } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'graphicsQuality' },
      );
      expect(output.value).toBe('high');
      expect(output.found).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // settings/reset
  // -------------------------------------------------------------------------

  describe('settings/reset', () => {
    it('resets a single key to its default', () => {
      core.events.emitSync('settings/set', { patch: { locale: 'ja' } });
      core.events.emitSync('settings/reset', { key: 'locale' });

      const { output } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'locale' },
      );
      expect(output.value).toBe('en');
    });

    it('deletes a key that has no default when reset individually', () => {
      core.events.emitSync('settings/set', { patch: { graphicsQuality: 'ultra' } });
      core.events.emitSync('settings/reset', { key: 'graphicsQuality' });

      const { output } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'graphicsQuality' },
      );
      expect(output.found).toBe(false);
    });

    it('resets all settings when no key is provided', () => {
      core.events.emitSync('settings/set', {
        patch: { locale: 'fr', 'volume.bgm': 0.1, graphicsQuality: 'low' },
      });

      core.events.emitSync('settings/reset', {});

      const { output: locOut } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'locale' },
      );
      expect(locOut.value).toBe('en');

      const { output: volOut } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'volume.bgm' },
      );
      expect(volOut.value).toBe(0.8);

      const { output: gfxOut } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'graphicsQuality' },
      );
      expect(gfxOut.found).toBe(false);
    });

    it('emits settings/changed after a full reset', () => {
      const changed: SettingsChangedParams[] = [];
      core.events.on('test', 'settings/changed', (p: SettingsChangedParams) => changed.push(p));

      core.events.emitSync('settings/reset', {});

      expect(changed).toHaveLength(1);
      expect(changed[0]!.changes).toMatchObject({ locale: 'en' });
    });
  });

  // -------------------------------------------------------------------------
  // settings/save and settings/load
  // -------------------------------------------------------------------------

  describe('settings/save + settings/load', () => {
    it('saves settings into the global save bag and loads them back', async () => {
      // Minimal SaveManager stub: holds in-memory global data.
      let globalData: Record<string, unknown> = {};

      core.events.on('stub', 'save/global:set', (params: { patch: Record<string, unknown> }) => {
        Object.assign(globalData, params.patch);
      });

      core.events.on('stub', 'save/global:save', (_params: unknown, output: SaveGlobalSaveOutput) => {
        output.saved = true;
      }, { phase: 'after' });

      core.events.on('stub', 'save/global:load', (_params: unknown, output: SaveGlobalLoadOutput) => {
        output.raw = { data: globalData, updatedAt: Date.now() };
      }, { phase: 'before' });

      core.events.on('stub', 'save/global:load', (_params: unknown, output: SaveGlobalLoadOutput) => {
        if (output.raw) {
          globalData = output.raw.data;
          output.loaded = true;
        }
      });

      core.events.on('stub', 'save/global:get', (_params: unknown, output: SaveGlobalGetOutput) => {
        output.data = { data: globalData, updatedAt: 0 };
      });

      // Change a setting then save.
      core.events.emitSync('settings/set', { patch: { locale: 'zh-TW', 'volume.bgm': 0.3 } });
      const { output: saveOut } = await core.events.emit<Record<string, never>, SettingsSaveOutput>(
        'settings/save',
        {},
      );
      expect(saveOut.saved).toBe(true);

      // Reset to defaults, then load.
      core.events.emitSync('settings/reset', {});

      const { output: loadOut } = await core.events.emit<Record<string, never>, SettingsLoadOutput>(
        'settings/load',
        {},
      );
      expect(loadOut.loaded).toBe(true);

      const { output: locOut } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'locale' },
      );
      expect(locOut.value).toBe('zh-TW');

      const { output: volOut } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'volume.bgm' },
      );
      expect(volOut.value).toBe(0.3);
    });

    it('sets loaded=false when global save has no settings data', async () => {
      core.events.on('stub', 'save/global:load', (_params: unknown, output: SaveGlobalLoadOutput) => {
        // No raw provided — simulates missing save.
        output.loaded = false;
      });

      core.events.on('stub', 'save/global:get', (_params: unknown, output: SaveGlobalGetOutput) => {
        output.data = { data: {}, updatedAt: 0 };
      });

      const { output } = await core.events.emit<Record<string, never>, SettingsLoadOutput>(
        'settings/load',
        {},
      );
      expect(output.loaded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('removes all listeners on destroy', () => {
      manager.destroy(core);
      // After destroy, settings/set and settings/get have no listeners.
      // emitSync returns an empty output object since no handler populates it.
      core.events.emitSync('settings/set', { patch: { locale: 'fr' } });
      const { output } = core.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'locale' },
      );
      // Handler is gone — output fields are never written, so undefined/falsy.
      expect(output.found).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------------
  // Constructor options — no defaults
  // -------------------------------------------------------------------------

  describe('no defaults', () => {
    it('works without any defaults provided', () => {
      const core2 = createStubCore();
      const m = new SettingsManager();
      m.init(core2);

      core2.events.emitSync('settings/set', { patch: { foo: 'bar' } });
      const { output } = core2.events.emitSync<{ key: string }, SettingsGetOutput>(
        'settings/get',
        { key: 'foo' },
      );
      expect(output.value).toBe('bar');
    });
  });

  // -------------------------------------------------------------------------
  // Bridges
  // -------------------------------------------------------------------------

  describe('audio bridge', () => {
    it('forwards volume.master changes to audio/volume', () => {
      const calls: unknown[] = [];
      core.events.on('test', 'audio/volume', (p: unknown) => calls.push(p));

      core.events.emitSync('settings/set', { patch: { 'volume.master': 0.5 } });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ volume: 0.5 });
    });

    it('forwards volume.<category> changes to audio/volume with category', () => {
      const calls: unknown[] = [];
      core.events.on('test', 'audio/volume', (p: unknown) => calls.push(p));

      core.events.emitSync('settings/set', { patch: { 'volume.bgm': 0.3 } });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ category: 'bgm', volume: 0.3 });
    });

    it('does not fire audio bridge for non-volume keys', () => {
      const calls: unknown[] = [];
      core.events.on('test', 'audio/volume', (p: unknown) => calls.push(p));

      core.events.emitSync('settings/set', { patch: { locale: 'fr' } });

      expect(calls).toHaveLength(0);
    });

    it('can be disabled via bridges.audio = false', () => {
      const core2 = createStubCore();
      const m = new SettingsManager({
        defaults: { 'volume.master': 1 },
        bridges: { audio: false },
      });
      m.init(core2);

      const calls: unknown[] = [];
      core2.events.on('test', 'audio/volume', (p: unknown) => calls.push(p));

      core2.events.emitSync('settings/set', { patch: { 'volume.master': 0.3 } });

      expect(calls).toHaveLength(0);
    });
  });

  describe('locale bridge', () => {
    it('forwards locale changes to i18n/set-locale', async () => {
      const calls: unknown[] = [];
      core.events.on('test', 'i18n/set-locale', (p: unknown) => calls.push(p));

      core.events.emitSync('settings/set', { patch: { locale: 'zh-TW' } });
      // The locale bridge is async (void emit); allow microtasks to flush.
      await Promise.resolve();

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ locale: 'zh-TW' });
    });

    it('does not forward non-string locale values', async () => {
      const calls: unknown[] = [];
      core.events.on('test', 'i18n/set-locale', (p: unknown) => calls.push(p));

      core.events.emitSync('settings/set', { patch: { locale: 42 } });
      await Promise.resolve();

      expect(calls).toHaveLength(0);
    });

    it('can be disabled via bridges.locale = false', async () => {
      const core2 = createStubCore();
      const m = new SettingsManager({ bridges: { locale: false } });
      m.init(core2);

      const calls: unknown[] = [];
      core2.events.on('test', 'i18n/set-locale', (p: unknown) => calls.push(p));

      core2.events.emitSync('settings/set', { patch: { locale: 'fr' } });
      await Promise.resolve();

      expect(calls).toHaveLength(0);
    });
  });

  describe('inputBindings bridge', () => {
    it('forwards keyBindings to input/action:bind per entry', () => {
      const calls: unknown[] = [];
      core.events.on('test', 'input/action:bind', (p: unknown) => calls.push(p));

      core.events.emitSync('settings/set', {
        patch: { keyBindings: { jump: ['Space', 'ArrowUp'], attack: ['KeyZ'] } },
      });

      expect(calls).toHaveLength(2);
      expect(calls).toContainEqual({ action: 'jump', codes: ['Space', 'ArrowUp'] });
      expect(calls).toContainEqual({ action: 'attack', codes: ['KeyZ'] });
    });

    it('ignores keyBindings entries whose codes are not arrays', () => {
      const calls: unknown[] = [];
      core.events.on('test', 'input/action:bind', (p: unknown) => calls.push(p));

      core.events.emitSync('settings/set', {
        // 'invalid' is a string, not an array — should be skipped
        patch: { keyBindings: { jump: ['Space'], invalid: 'KeyX' } },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ action: 'jump', codes: ['Space'] });
    });

    it('can be disabled via bridges.inputBindings = false', () => {
      const core2 = createStubCore();
      const m = new SettingsManager({ bridges: { inputBindings: false } });
      m.init(core2);

      const calls: unknown[] = [];
      core2.events.on('test', 'input/action:bind', (p: unknown) => calls.push(p));

      core2.events.emitSync('settings/set', {
        patch: { keyBindings: { jump: ['Space'] } },
      });

      expect(calls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Bridge fires on reset too
  // -------------------------------------------------------------------------

  describe('bridges fire on reset', () => {
    it('audio bridge fires after reset', () => {
      const calls: unknown[] = [];
      core.events.on('test', 'audio/volume', (p: unknown) => calls.push(p));

      core.events.emitSync('settings/set', { patch: { 'volume.master': 0.3 } });
      calls.length = 0;

      core.events.emitSync('settings/reset', { key: 'volume.master' });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ volume: 1 }); // reset to default
    });
  });

  // -------------------------------------------------------------------------
  // Custom saveKey
  // -------------------------------------------------------------------------

  describe('custom saveKey', () => {
    it('persists settings under the configured saveKey', async () => {
      const core2 = createStubCore();
      const m = new SettingsManager({
        defaults: { theme: 'dark' },
        saveKey: 'prefs',
      });
      m.init(core2);

      let capturedPatch: Record<string, unknown> = {};
      core2.events.on('stub', 'save/global:set', (params: { patch: Record<string, unknown> }) => {
        capturedPatch = params.patch;
      });
      core2.events.on('stub', 'save/global:save', (_p: unknown, out: SaveGlobalSaveOutput) => {
        out.saved = true;
      }, { phase: 'after' });

      await core2.events.emit('settings/save', {});

      expect(capturedPatch).toHaveProperty('prefs');
      expect((capturedPatch.prefs as Record<string, unknown>).theme).toBe('dark');
    });
  });
});
