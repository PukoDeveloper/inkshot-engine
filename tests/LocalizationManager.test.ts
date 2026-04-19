import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { LocalizationManager } from '../src/plugins/LocalizationManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  I18nLoadOutput,
  I18nSetLocaleOutput,
  I18nTOutput,
  I18nInterpolateOutput,
  I18nGetLocalesOutput,
} from '../src/types/i18n.js';

function createStubCore(dataRoot = '/'): Core {
  return { events: new EventBus(), dataRoot } as unknown as Core;
}

describe('LocalizationManager', () => {
  let core: Core;
  let i18n: LocalizationManager;

  beforeEach(() => {
    core = createStubCore();
    i18n = new LocalizationManager();
    i18n.init(core);
  });

  // -------------------------------------------------------------------------
  // i18n/load — inline data
  // -------------------------------------------------------------------------

  describe('i18n/load (inline data)', () => {
    it('loads a flat locale from inline data', async () => {
      const { output } = await core.events.emit<
        { locale: string; data: Record<string, string> },
        I18nLoadOutput
      >('i18n/load', {
        locale: 'en',
        data: { 'menu.start': 'Start Game', 'menu.quit': 'Quit' },
      });

      expect(output.loaded).toBe(true);
      expect(output.locale).toBe('en');
    });

    it('loads and flattens nested locale data', async () => {
      await core.events.emit('i18n/load', {
        locale: 'en',
        data: {
          menu: { start: 'Start Game', quit: 'Quit' },
        },
      });
      await core.events.emit('i18n/set-locale', { locale: 'en' });

      const { output } = core.events.emitSync<{ key: string }, I18nTOutput>(
        'i18n/t',
        { key: 'menu.start' },
      );
      expect(output.value).toBe('Start Game');
    });

    it('merges additional data into an existing locale', async () => {
      await core.events.emit('i18n/load', {
        locale: 'en',
        data: { 'a': 'Alpha' },
      });
      await core.events.emit('i18n/load', {
        locale: 'en',
        data: { 'b': 'Beta' },
      });
      await core.events.emit('i18n/set-locale', { locale: 'en' });

      const { output: a } = core.events.emitSync<{ key: string }, I18nTOutput>('i18n/t', { key: 'a' });
      const { output: b } = core.events.emitSync<{ key: string }, I18nTOutput>('i18n/t', { key: 'b' });

      expect(a.value).toBe('Alpha');
      expect(b.value).toBe('Beta');
    });
  });

  // -------------------------------------------------------------------------
  // i18n/set-locale
  // -------------------------------------------------------------------------

  describe('i18n/set-locale', () => {
    it('switches the active locale', async () => {
      await core.events.emit('i18n/load', { locale: 'en', data: { greeting: 'Hello' } });
      await core.events.emit('i18n/load', { locale: 'ja', data: { greeting: 'こんにちは' } });

      await core.events.emit('i18n/set-locale', { locale: 'ja' });

      const { output } = core.events.emitSync<{ key: string }, I18nTOutput>(
        'i18n/t',
        { key: 'greeting' },
      );
      expect(output.value).toBe('こんにちは');
    });

    it('provides previous and current locale in output', async () => {
      await core.events.emit('i18n/load', { locale: 'en', data: {} });
      await core.events.emit('i18n/load', { locale: 'ja', data: {} });

      await core.events.emit('i18n/set-locale', { locale: 'en' });
      const { output } = await core.events.emit<{ locale: string }, I18nSetLocaleOutput>(
        'i18n/set-locale',
        { locale: 'ja' },
      );

      expect(output.previous).toBe('en');
      expect(output.current).toBe('ja');
    });

    it('throws when setting an unloaded locale', async () => {
      await expect(
        core.events.emit('i18n/set-locale', { locale: 'nope' }),
      ).rejects.toThrow(/not been loaded/);
    });
  });

  // -------------------------------------------------------------------------
  // i18n/t — translation lookup
  // -------------------------------------------------------------------------

  describe('i18n/t', () => {
    beforeEach(async () => {
      await core.events.emit('i18n/load', {
        locale: 'en',
        data: {
          'greeting': 'Hello',
          'hud.gold': 'Gold: {{amount}}',
          'multi': '{{a}} and {{b}}',
        },
      });
      await core.events.emit('i18n/set-locale', { locale: 'en' });
    });

    it('returns the translation for a known key', () => {
      const { output } = core.events.emitSync<{ key: string }, I18nTOutput>(
        'i18n/t',
        { key: 'greeting' },
      );
      expect(output.value).toBe('Hello');
      expect(output.found).toBe(true);
    });

    it('returns the key itself for an unknown key', () => {
      const { output } = core.events.emitSync<{ key: string }, I18nTOutput>(
        'i18n/t',
        { key: 'missing.key' },
      );
      expect(output.value).toBe('missing.key');
      expect(output.found).toBe(false);
    });

    it('substitutes {{var}} placeholders', () => {
      const { output } = core.events.emitSync<{ key: string; vars?: Record<string, string> }, I18nTOutput>(
        'i18n/t',
        { key: 'hud.gold', vars: { amount: '500' } },
      );
      expect(output.value).toBe('Gold: 500');
    });

    it('leaves unknown {{var}} placeholders intact', () => {
      const { output } = core.events.emitSync<{ key: string; vars?: Record<string, string> }, I18nTOutput>(
        'i18n/t',
        { key: 'hud.gold', vars: {} },
      );
      expect(output.value).toBe('Gold: {{amount}}');
    });

    it('substitutes multiple variables', () => {
      const { output } = core.events.emitSync<{ key: string; vars?: Record<string, string> }, I18nTOutput>(
        'i18n/t',
        { key: 'multi', vars: { a: 'X', b: 'Y' } },
      );
      expect(output.value).toBe('X and Y');
    });
  });

  // -------------------------------------------------------------------------
  // i18n/interpolate — token interpolation
  // -------------------------------------------------------------------------

  describe('i18n/interpolate', () => {
    beforeEach(async () => {
      await core.events.emit('i18n/load', {
        locale: 'en',
        data: { 'menu.start': 'Start Game' },
      });
      await core.events.emit('i18n/set-locale', { locale: 'en' });
    });

    it('replaces {i18n:key} tokens with translations', () => {
      const { output } = core.events.emitSync<{ text: string }, I18nInterpolateOutput>(
        'i18n/interpolate',
        { text: 'Press Enter: {i18n:menu.start}' },
      );
      expect(output.result).toBe('Press Enter: Start Game');
    });

    it('leaves unknown tokens intact', () => {
      const { output } = core.events.emitSync<{ text: string }, I18nInterpolateOutput>(
        'i18n/interpolate',
        { text: '{unknown:token}' },
      );
      expect(output.result).toBe('{unknown:token}');
    });

    it('provides a replace() helper for custom token namespaces', () => {
      // Simulate a settings plugin handling its own tokens.
      core.events.on('settings', 'i18n/interpolate', (_p, output: I18nInterpolateOutput) => {
        output.replace('{setting:volume}', '80');
      });

      const { output } = core.events.emitSync<{ text: string }, I18nInterpolateOutput>(
        'i18n/interpolate',
        { text: 'Vol: {setting:volume} — {i18n:menu.start}' },
      );
      expect(output.result).toBe('Vol: 80 — Start Game');
    });
  });

  // -------------------------------------------------------------------------
  // i18n/get-locales
  // -------------------------------------------------------------------------

  describe('i18n/get-locales', () => {
    it('lists loaded locales and the active one', async () => {
      await core.events.emit('i18n/load', { locale: 'en', data: {} });
      await core.events.emit('i18n/load', { locale: 'ja', data: {} });
      await core.events.emit('i18n/set-locale', { locale: 'ja' });

      const { output } = core.events.emitSync<Record<string, never>, I18nGetLocalesOutput>(
        'i18n/get-locales',
        {} as Record<string, never>,
      );

      expect(output.available).toContain('en');
      expect(output.available).toContain('ja');
      expect(output.current).toBe('ja');
    });

    it('returns null current when no locale is set', () => {
      const { output } = core.events.emitSync<Record<string, never>, I18nGetLocalesOutput>(
        'i18n/get-locales',
        {} as Record<string, never>,
      );

      expect(output.current).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('clears all catalogues and stops responding to events', async () => {
      await core.events.emit('i18n/load', { locale: 'en', data: { a: 'A' } });
      await core.events.emit('i18n/set-locale', { locale: 'en' });

      i18n.destroy(core);

      // Handler removed — output remains empty.
      const { output } = core.events.emitSync<{ key: string }, I18nTOutput>(
        'i18n/t',
        { key: 'a' },
      );
      expect(output.value).toBeUndefined();
    });
  });
});
