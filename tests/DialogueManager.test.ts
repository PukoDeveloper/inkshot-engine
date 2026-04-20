import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { DialogueManager } from '../src/plugins/DialogueManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  DialogueNodeParams,
  DialogueTextTickParams,
  DialogueChoicesParams,
  DialogueAdvancedParams,
  DialogueChoiceMadeParams,
  DialogueStartedParams,
  DialogueEndedParams,
  DialogueStateGetOutput,
} from '../src/types/dialogue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCoreStub(): Core {
  const events = new EventBus();
  return { events } as unknown as Core;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DialogueManager', () => {
  let core: Core;
  let dm: DialogueManager;

  beforeEach(() => {
    core = createCoreStub();
    dm   = new DialogueManager({ defaultCharsPerSecond: 100 });
    dm.init(core);
  });

  afterEach(() => {
    dm.destroy(core);
  });

  // -------------------------------------------------------------------------
  // dialogue/show-text
  // -------------------------------------------------------------------------

  describe('dialogue/show-text', () => {
    it('opens a session and sets isActive', () => {
      expect(dm.isActive).toBe(false);
      core.events.emitSync('dialogue/show-text', { text: 'Hello!', speaker: 'Alice' });
      expect(dm.isActive).toBe(true);
    });

    it('emits dialogue/started on first call', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/started', handler);
      core.events.emitSync('dialogue/show-text', { text: 'Hi' });
      expect(handler).toHaveBeenCalledOnce();
    });

    it('does NOT re-emit dialogue/started when session is already active', () => {
      core.events.emitSync('dialogue/show-text', { text: 'First' });
      const handler = vi.fn();
      core.events.on('test', 'dialogue/started', handler);
      core.events.emitSync('dialogue/show-text', { text: 'Second' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits dialogue/node with speaker and portrait', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/node', handler);
      core.events.emitSync('dialogue/show-text', {
        text: 'Hi',
        speaker: 'Bob',
        portrait: 'bob.png',
      });
      expect(handler).toHaveBeenCalledOnce();
      const p = handler.mock.calls[0]![0] as DialogueNodeParams;
      expect(p.speaker).toBe('Bob');
      expect(p.portrait).toBe('bob.png');
    });

    it('starts the typewriter (textDone = false)', () => {
      core.events.emitSync('dialogue/show-text', { text: 'Hi there' });
      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get', {},
      );
      expect(output.textDone).toBe(false);
    });

    it('resolves text via i18n/t when i18nKey is provided', () => {
      core.events.on('i18n', 'i18n/t', (p: { key: string }, out: { value: string }) => {
        if (p.key === 'hello') out.value = 'Bonjour!';
      });
      core.events.emitSync('dialogue/show-text', { i18nKey: 'hello' });
      // skip typewriter
      core.events.emitSync('dialogue/advance', {});
      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get', {},
      );
      expect(output.text).toBe('Bonjour!');
    });

    it('resolves speaker via speakerI18nKey', () => {
      core.events.on('i18n', 'i18n/t', (p: { key: string }, out: { value: string }) => {
        if (p.key === 'npc.alice') out.value = 'Alice';
      });
      const handler = vi.fn();
      core.events.on('test', 'dialogue/node', handler);
      core.events.emitSync('dialogue/show-text', { text: 'Hi', speakerI18nKey: 'npc.alice' });
      expect((handler.mock.calls[0]![0] as DialogueNodeParams).speaker).toBe('Alice');
    });
  });

  // -------------------------------------------------------------------------
  // Typewriter (core/update)
  // -------------------------------------------------------------------------

  describe('typewriter animation', () => {
    beforeEach(() => {
      core.events.emitSync('dialogue/show-text', { text: 'Hello world!' }); // 12 chars
    });

    it('emits dialogue/text:tick on core/update', () => {
      const ticks: DialogueTextTickParams[] = [];
      core.events.on('test', 'dialogue/text:tick', (p: DialogueTextTickParams) => ticks.push(p));

      // 100 chars/s → 10 ms/char; 50 ms → ~5 chars
      core.events.emitSync('core/update', { dt: 50, tick: 1 });
      expect(ticks.length).toBeGreaterThan(0);
      const last = ticks[ticks.length - 1]!;
      expect(last.done).toBe(false);
      expect(last.text.length).toBeGreaterThan(0);
      expect(last.text.length).toBeLessThan('Hello world!'.length);
    });

    it('marks done:true once all characters are revealed', () => {
      const ticks: DialogueTextTickParams[] = [];
      core.events.on('test', 'dialogue/text:tick', (p: DialogueTextTickParams) => ticks.push(p));
      core.events.emitSync('core/update', { dt: 1000, tick: 1 });
      const last = ticks[ticks.length - 1]!;
      expect(last.done).toBe(true);
      expect(last.text).toBe('Hello world!');
    });

    it('does not emit text:tick once text is fully revealed', () => {
      core.events.emitSync('core/update', { dt: 1000, tick: 1 });
      const ticks: DialogueTextTickParams[] = [];
      core.events.on('test', 'dialogue/text:tick', (p: DialogueTextTickParams) => ticks.push(p));
      core.events.emitSync('core/update', { dt: 1000, tick: 2 });
      expect(ticks).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // dialogue/advance
  // -------------------------------------------------------------------------

  describe('dialogue/advance', () => {
    beforeEach(() => {
      core.events.emitSync('dialogue/show-text', { text: 'Line one.' });
    });

    it('completes typewriter when text is not done', () => {
      const ticks: DialogueTextTickParams[] = [];
      core.events.on('test', 'dialogue/text:tick', (p: DialogueTextTickParams) => ticks.push(p));
      core.events.emitSync('dialogue/advance', {});
      const last = ticks[ticks.length - 1]!;
      expect(last.done).toBe(true);
      expect(last.text).toBe('Line one.');
    });

    it('emits dialogue/advanced when text is already done', () => {
      core.events.emitSync('core/update', { dt: 1000, tick: 1 }); // finish typewriter
      const handler = vi.fn();
      core.events.on('test', 'dialogue/advanced', handler);
      core.events.emitSync('dialogue/advance', {});
      expect(handler).toHaveBeenCalledOnce();
    });

    it('does NOT emit dialogue/advanced while typewriter is running', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/advanced', handler);
      core.events.emitSync('dialogue/advance', {}); // skips typewriter
      expect(handler).not.toHaveBeenCalled();
    });

    it('is a no-op when no session is active', () => {
      dm.destroy(core);
      dm = new DialogueManager();
      dm.init(core);
      expect(() => core.events.emitSync('dialogue/advance', {})).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // dialogue/show-choices
  // -------------------------------------------------------------------------

  describe('dialogue/show-choices', () => {
    it('opens a session if not already active', () => {
      expect(dm.isActive).toBe(false);
      core.events.emitSync('dialogue/show-choices', {
        choices: [{ text: 'Yes', index: 0 }, { text: 'No', index: 1 }],
      });
      expect(dm.isActive).toBe(true);
    });

    it('emits dialogue/choices with the provided list', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/choices', handler);
      core.events.emitSync('dialogue/show-choices', {
        choices: [
          { text: 'Option A', index: 0 },
          { text: 'Option B', index: 1 },
        ],
      });
      const p = handler.mock.calls[0]![0] as DialogueChoicesParams;
      expect(p.choices).toHaveLength(2);
      expect(p.choices[0]!.text).toBe('Option A');
      expect(p.choices[1]!.text).toBe('Option B');
    });

    it('reports choices in state:get', () => {
      core.events.emitSync('dialogue/show-choices', {
        choices: [{ text: 'A', index: 0 }],
      });
      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get', {},
      );
      expect(output.choices).toHaveLength(1);
      expect(output.choices[0]!.text).toBe('A');
    });
  });

  // -------------------------------------------------------------------------
  // dialogue/choice
  // -------------------------------------------------------------------------

  describe('dialogue/choice', () => {
    beforeEach(() => {
      core.events.emitSync('dialogue/show-choices', {
        choices: [
          { text: 'Option A', index: 0 },
          { text: 'Option B', index: 1 },
        ],
      });
    });

    it('emits dialogue/choice:made with the selected index', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/choice:made', handler);
      core.events.emitSync('dialogue/choice', { index: 1 });
      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0]![0] as DialogueChoiceMadeParams).index).toBe(1);
    });

    it('warns for out-of-range choice index', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('dialogue/choice', { index: 99 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('out of range'));
      warn.mockRestore();
    });

    it('is a no-op when no session is active', () => {
      core.events.emitSync('dialogue/end', {});
      expect(() => core.events.emitSync('dialogue/choice', { index: 0 })).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // dialogue/end
  // -------------------------------------------------------------------------

  describe('dialogue/end', () => {
    it('ends the active session and emits dialogue/ended', () => {
      core.events.emitSync('dialogue/show-text', { text: 'Hi' });
      expect(dm.isActive).toBe(true);

      const handler = vi.fn();
      core.events.on('test', 'dialogue/ended', handler);
      core.events.emitSync('dialogue/end', {});
      expect(dm.isActive).toBe(false);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('is a no-op when no session is active', () => {
      expect(() => core.events.emitSync('dialogue/end', {})).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // dialogue/state:get
  // -------------------------------------------------------------------------

  describe('dialogue/state:get', () => {
    it('returns inactive state when no session is running', () => {
      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get', {},
      );
      expect(output.active).toBe(false);
      expect(output.choices).toHaveLength(0);
      expect(output.text).toBe('');
      expect(output.textDone).toBe(true);
    });

    it('returns active state during a text line', () => {
      core.events.emitSync('dialogue/show-text', { text: 'Hello!' });
      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get', {},
      );
      expect(output.active).toBe(true);
      expect(output.textDone).toBe(false);
    });

    it('reports partial text from typewriter', () => {
      core.events.emitSync('dialogue/show-text', { text: 'Hello world!' });
      core.events.emitSync('core/update', { dt: 50, tick: 1 }); // ~5 chars
      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get', {},
      );
      expect(output.text.length).toBeGreaterThan(0);
      expect(output.text.length).toBeLessThan('Hello world!'.length);
    });
  });

  // -------------------------------------------------------------------------
  // Speed override
  // -------------------------------------------------------------------------

  describe('speed override', () => {
    it('uses custom speed when provided in show-text', () => {
      core.events.emitSync('dialogue/show-text', {
        text: 'Fast text',
        speed: 1000, // 1 char/ms — effectively instant
      });
      const ticks: DialogueTextTickParams[] = [];
      core.events.on('test', 'dialogue/text:tick', (p: DialogueTextTickParams) => ticks.push(p));
      core.events.emitSync('core/update', { dt: 10, tick: 1 });
      const last = ticks[ticks.length - 1]!;
      expect(last.done).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Session auto-open on show-choices
  // -------------------------------------------------------------------------

  describe('session lifecycle', () => {
    it('emits dialogue/started when show-choices opens a new session', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/started', handler);
      core.events.emitSync('dialogue/show-choices', {
        choices: [{ text: 'Hi', index: 0 }],
      });
      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not re-open session when switching from text to choices', () => {
      core.events.emitSync('dialogue/show-text', { text: 'Choose:' });
      const handler = vi.fn();
      core.events.on('test', 'dialogue/started', handler);
      core.events.emitSync('dialogue/show-choices', {
        choices: [{ text: 'A', index: 0 }],
      });
      expect(handler).not.toHaveBeenCalled();
      expect(dm.isActive).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Type exports (compile-time only — these assertions just verify imports)
  // -------------------------------------------------------------------------

  it('exports expected types (compilation check)', () => {
    const _started: DialogueStartedParams = {};
    const _ended: DialogueEndedParams = {};
    const _advanced: DialogueAdvancedParams = {};
    void _started; void _ended; void _advanced;
    expect(true).toBe(true);
  });
});
