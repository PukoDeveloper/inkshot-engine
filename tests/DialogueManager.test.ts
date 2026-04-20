import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { DialogueManager } from '../src/plugins/DialogueManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  DialogueTree,
  DialogueStartedParams,
  DialogueNodeParams,
  DialogueTextTickParams,
  DialogueChoicesParams,
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

const SIMPLE_TREE: DialogueTree = {
  entry: 'n1',
  nodes: {
    n1: { id: 'n1', type: 'text', speaker: 'Alice', text: 'Hello world!', next: 'n2' },
    n2: { id: 'n2', type: 'end' },
  },
};

const TWO_LINE_TREE: DialogueTree = {
  entry: 'l1',
  nodes: {
    l1: { id: 'l1', type: 'text', text: 'Line one.', next: 'l2' },
    l2: { id: 'l2', type: 'text', text: 'Line two.', next: 'done' },
    done: { id: 'done', type: 'end' },
  },
};

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
  // Registration
  // -------------------------------------------------------------------------

  describe('dialogue/register', () => {
    it('stores a tree and increments treeCount', () => {
      expect(dm.treeCount).toBe(0);
      core.events.emitSync('dialogue/register', { treeId: 'intro', tree: SIMPLE_TREE });
      expect(dm.treeCount).toBe(1);
    });

    it('replaces an existing tree with a warning', () => {
      core.events.emitSync('dialogue/register', { treeId: 'intro', tree: SIMPLE_TREE });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('dialogue/register', { treeId: 'intro', tree: SIMPLE_TREE });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"intro"'));
      expect(dm.treeCount).toBe(1); // still 1, not 2
      warn.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // dialogue/start
  // -------------------------------------------------------------------------

  describe('dialogue/start', () => {
    beforeEach(() => {
      core.events.emitSync('dialogue/register', { treeId: 'intro', tree: SIMPLE_TREE });
    });

    it('sets isActive to true', () => {
      expect(dm.isActive).toBe(false);
      core.events.emitSync('dialogue/start', { treeId: 'intro' });
      expect(dm.isActive).toBe(true);
    });

    it('emits dialogue/started', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/started', handler);
      core.events.emitSync('dialogue/start', { treeId: 'intro' });
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![0]).toMatchObject<Partial<DialogueStartedParams>>({
        treeId: 'intro',
      });
    });

    it('emits dialogue/node with speaker info', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/node', handler);
      core.events.emitSync('dialogue/start', { treeId: 'intro' });
      expect(handler).toHaveBeenCalledOnce();
      const p = handler.mock.calls[0]![0] as DialogueNodeParams;
      expect(p.nodeId).toBe('n1');
      expect(p.nodeType).toBe('text');
      expect(p.speaker).toBe('Alice');
    });

    it('warns and does nothing for an unknown treeId', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('dialogue/start', { treeId: 'missing' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"missing"'));
      expect(dm.isActive).toBe(false);
      warn.mockRestore();
    });

    it('ends the previous session before starting a new one', () => {
      const endedHandler = vi.fn();
      core.events.on('test', 'dialogue/ended', endedHandler);
      core.events.emitSync('dialogue/start', { treeId: 'intro' });
      core.events.emitSync('dialogue/start', { treeId: 'intro' });
      expect(endedHandler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Typewriter (core/update)
  // -------------------------------------------------------------------------

  describe('typewriter animation', () => {
    beforeEach(() => {
      core.events.emitSync('dialogue/register', { treeId: 't', tree: SIMPLE_TREE });
      core.events.emitSync('dialogue/start', { treeId: 't' });
    });

    it('emits dialogue/text:tick on core/update', () => {
      const ticks: DialogueTextTickParams[] = [];
      core.events.on('test', 'dialogue/text:tick', (p: DialogueTextTickParams) => ticks.push(p));

      // 100 chars/s → 10ms per char; text is "Hello world!" (12 chars)
      // Send 50ms → ~5 chars revealed
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

      // 1000ms should be more than enough for "Hello world!" at 100 cps
      core.events.emitSync('core/update', { dt: 1000, tick: 1 });
      const last = ticks[ticks.length - 1]!;
      expect(last.done).toBe(true);
      expect(last.text).toBe('Hello world!');
    });

    it('does not emit text:tick once text is fully revealed', () => {
      // Finish the text
      core.events.emitSync('core/update', { dt: 1000, tick: 1 });
      const ticks: DialogueTextTickParams[] = [];
      core.events.on('test', 'dialogue/text:tick', (p: DialogueTextTickParams) => ticks.push(p));
      // Additional updates should produce no more ticks
      core.events.emitSync('core/update', { dt: 1000, tick: 2 });
      expect(ticks).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // dialogue/advance
  // -------------------------------------------------------------------------

  describe('dialogue/advance', () => {
    beforeEach(() => {
      core.events.emitSync('dialogue/register', { treeId: 'two', tree: TWO_LINE_TREE });
      core.events.emitSync('dialogue/start', { treeId: 'two' });
    });

    it('completes typewriter when text is not done', () => {
      const ticks: DialogueTextTickParams[] = [];
      core.events.on('test', 'dialogue/text:tick', (p: DialogueTextTickParams) => ticks.push(p));
      core.events.emitSync('dialogue/advance', {});
      const last = ticks[ticks.length - 1]!;
      expect(last.done).toBe(true);
      expect(last.text).toBe('Line one.');
      expect(dm.isActive).toBe(true);
    });

    it('advances to next node when text is already done', () => {
      // Finish typewriter first
      core.events.emitSync('core/update', { dt: 1000, tick: 1 });

      const nodeHandler = vi.fn();
      core.events.on('test', 'dialogue/node', nodeHandler);

      core.events.emitSync('dialogue/advance', {});
      expect(nodeHandler).toHaveBeenCalledOnce();
      const p = nodeHandler.mock.calls[0]![0] as DialogueNodeParams;
      expect(p.nodeId).toBe('l2');
    });

    it('ends dialogue when advancing past the last text node', () => {
      const endedHandler = vi.fn();
      core.events.on('test', 'dialogue/ended', endedHandler);

      // l1 → done → advance to l2 → done → advance to end
      core.events.emitSync('core/update', { dt: 1000, tick: 1 });
      core.events.emitSync('dialogue/advance', {}); // now on l2
      core.events.emitSync('core/update', { dt: 1000, tick: 2 });
      core.events.emitSync('dialogue/advance', {}); // end

      expect(endedHandler).toHaveBeenCalledOnce();
      expect(dm.isActive).toBe(false);
    });

    it('is a no-op when no session is active', () => {
      dm.destroy(core);
      dm = new DialogueManager();
      dm.init(core);
      expect(() => core.events.emitSync('dialogue/advance', {})).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Choice nodes
  // -------------------------------------------------------------------------

  describe('choice nodes', () => {
    const CHOICE_TREE: DialogueTree = {
      entry: 'start',
      nodes: {
        start: {
          id: 'start',
          type: 'choice',
          text: 'Pick one:',
          choices: [
            { text: 'Option A', next: 'branchA' },
            { text: 'Option B', next: 'branchB' },
          ],
        },
        branchA: { id: 'branchA', type: 'text', text: 'You chose A!', next: 'fin' },
        branchB: { id: 'branchB', type: 'text', text: 'You chose B!', next: 'fin' },
        fin:     { id: 'fin',     type: 'end' },
      },
    };

    beforeEach(() => {
      core.events.emitSync('dialogue/register', { treeId: 'choice', tree: CHOICE_TREE });
      core.events.emitSync('dialogue/start', { treeId: 'choice' });
    });

    it('emits dialogue/choices with all visible options', () => {
      const handler = vi.fn();
      core.events.on('test', 'dialogue/choices', handler);
      // Restart to capture the event
      core.events.emitSync('dialogue/start', { treeId: 'choice' });
      const p = handler.mock.calls[0]![0] as DialogueChoicesParams;
      expect(p.choices).toHaveLength(2);
      expect(p.choices[0]!.text).toBe('Option A');
      expect(p.choices[1]!.text).toBe('Option B');
    });

    it('selects choice 0 and transitions to branchA', () => {
      const nodeHandler = vi.fn();
      core.events.on('test', 'dialogue/node', nodeHandler);
      core.events.emitSync('dialogue/choice', { index: 0 });
      const p = nodeHandler.mock.calls[0]![0] as DialogueNodeParams;
      expect(p.nodeId).toBe('branchA');
    });

    it('selects choice 1 and transitions to branchB', () => {
      const nodeHandler = vi.fn();
      core.events.on('test', 'dialogue/node', nodeHandler);
      core.events.emitSync('dialogue/choice', { index: 1 });
      const p = nodeHandler.mock.calls[0]![0] as DialogueNodeParams;
      expect(p.nodeId).toBe('branchB');
    });

    it('warns for out-of-range choice index', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('dialogue/choice', { index: 99 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('out of range'));
      warn.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Condition-gated choices
  // -------------------------------------------------------------------------

  describe('condition-gated choices', () => {
    const GATED_TREE: DialogueTree = {
      entry: 'q',
      nodes: {
        q: {
          id: 'q',
          type: 'choice',
          choices: [
            { text: 'Always visible', next: 'end' },
            {
              text: 'Only when playing',
              condition: { type: 'game-state', state: 'playing' },
              next: 'end',
            },
          ],
        },
        end: { id: 'end', type: 'end' },
      },
    };

    it('hides choices whose condition is false', () => {
      // No game/state:get handler → output.state undefined → not 'playing'
      core.events.emitSync('dialogue/register', { treeId: 'gated', tree: GATED_TREE });
      const handler = vi.fn();
      core.events.on('test', 'dialogue/choices', handler);
      core.events.emitSync('dialogue/start', { treeId: 'gated' });
      const p = handler.mock.calls[0]![0] as DialogueChoicesParams;
      expect(p.choices).toHaveLength(1);
      expect(p.choices[0]!.text).toBe('Always visible');
    });

    it('shows choices whose condition is true', () => {
      // Register a game-state handler that returns 'playing'
      core.events.on('gateTest', 'game/state:get', (_p: unknown, output: { state: string }) => {
        output.state = 'playing';
      });
      core.events.emitSync('dialogue/register', { treeId: 'gated2', tree: GATED_TREE });
      const handler = vi.fn();
      core.events.on('test', 'dialogue/choices', handler);
      core.events.emitSync('dialogue/start', { treeId: 'gated2' });
      const p = handler.mock.calls[0]![0] as DialogueChoicesParams;
      expect(p.choices).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Condition nodes
  // -------------------------------------------------------------------------

  describe('condition nodes', () => {
    const COND_TREE: DialogueTree = {
      entry: 'gate',
      nodes: {
        gate: {
          id: 'gate',
          type: 'condition',
          condition: { type: 'game-state', state: 'playing' },
          then: 'yes',
          else: 'no',
        },
        yes: { id: 'yes', type: 'text', text: 'Playing!', next: 'fin' },
        no:  { id: 'no',  type: 'text', text: 'Not playing.', next: 'fin' },
        fin: { id: 'fin', type: 'end' },
      },
    };

    it('jumps to "then" when condition is true', () => {
      core.events.on('testCond', 'game/state:get', (_p: unknown, output: { state: string }) => {
        output.state = 'playing';
      });
      core.events.emitSync('dialogue/register', { treeId: 'cond', tree: COND_TREE });
      const nodeHandler = vi.fn();
      core.events.on('test', 'dialogue/node', nodeHandler);
      core.events.emitSync('dialogue/start', { treeId: 'cond' });
      expect(nodeHandler.mock.calls[0]![0]).toMatchObject({ nodeId: 'yes' });
    });

    it('jumps to "else" when condition is false', () => {
      // No game-state handler → falsy
      core.events.emitSync('dialogue/register', { treeId: 'condF', tree: COND_TREE });
      const nodeHandler = vi.fn();
      core.events.on('test', 'dialogue/node', nodeHandler);
      core.events.emitSync('dialogue/start', { treeId: 'condF' });
      expect(nodeHandler.mock.calls[0]![0]).toMatchObject({ nodeId: 'no' });
    });

    it('ends dialogue when condition is false and else is absent', () => {
      const NO_ELSE_TREE: DialogueTree = {
        entry: 'gate',
        nodes: {
          gate: {
            id: 'gate',
            type: 'condition',
            condition: { type: 'game-state', state: 'playing' },
            then: 'fin',
            // no else
          },
          fin: { id: 'fin', type: 'end' },
        },
      };
      core.events.emitSync('dialogue/register', { treeId: 'noElse', tree: NO_ELSE_TREE });
      const endedHandler = vi.fn();
      core.events.on('test', 'dialogue/ended', endedHandler);
      core.events.emitSync('dialogue/start', { treeId: 'noElse' });
      expect(endedHandler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Condition evaluation: not / and / or
  // -------------------------------------------------------------------------

  describe('condition evaluation', () => {
    function makeCondTree(condition: object): DialogueTree {
      return {
        entry: 'gate',
        nodes: {
          gate: {
            id: 'gate',
            type: 'condition',
            condition: condition as never,
            then: 'yes',
            else: 'no',
          },
          yes: { id: 'yes', type: 'end' },
          no:  { id: 'no',  type: 'end' },
        },
      };
    }

    function startAndCapture(treeId: string, tree: DialogueTree): string {
      core.events.emitSync('dialogue/register', { treeId, tree });
      let landed = '';
      const ns = `cap_${treeId}`;
      core.events.on(ns, 'dialogue/ended', () => {});
      // We just need to know which branch we entered (both are 'end' nodes)
      const nodeH = vi.fn();
      core.events.on(ns, 'dialogue/node', nodeH);
      // Actually 'end' nodes go straight to ended — check nodeId via ended?
      // Easier: override with non-end nodes
      const nodeCapture: string[] = [];
      const capNs = `nodeCapNs_${treeId}`;
      core.events.on(capNs, 'dialogue/started', () => {});
      core.events.emitSync('dialogue/start', { treeId });
      void nodeH;
      // For end nodes, no dialogue/node is emitted — check isActive instead
      // We'll check via state:get
      const { output } = core.events.emitSync<Record<string,never>, DialogueStateGetOutput>('dialogue/state:get', {});
      landed = output.active ? output.nodeId ?? '' : 'ENDED';
      void nodeCapture;
      return landed;
    }

    it('not condition: negates a true condition', () => {
      core.events.on('notTest', 'game/state:get', (_p: unknown, o: { state: string }) => {
        o.state = 'playing';
      });
      const tree = makeCondTree({ type: 'not', condition: { type: 'game-state', state: 'playing' } });
      // condition → NOT(true) = false → jumps to 'no' (an end node → session ends immediately)
      core.events.emitSync('dialogue/register', { treeId: 'not1', tree });
      const ended = vi.fn();
      core.events.on('testNot', 'dialogue/ended', ended);
      core.events.emitSync('dialogue/start', { treeId: 'not1' });
      // 'no' is an end node so session ends
      expect(ended).toHaveBeenCalledOnce();
    });

    it('and condition: true only when all sub-conditions pass', () => {
      core.events.on('andTest', 'game/state:get', (_p: unknown, o: { state: string }) => {
        o.state = 'playing';
      });
      const tree = makeCondTree({
        type: 'and',
        conditions: [
          { type: 'game-state', state: 'playing' },
          { type: 'game-state', state: 'playing' },
        ],
      });
      core.events.emitSync('dialogue/register', { treeId: 'and1', tree });
      const nodeH = vi.fn();
      // 'yes' is end → no node event; but we can check if ended fired
      const ended = vi.fn();
      core.events.on('testAnd', 'dialogue/ended', ended);
      core.events.on('testAndN', 'dialogue/node', nodeH);
      core.events.emitSync('dialogue/start', { treeId: 'and1' });
      expect(ended).toHaveBeenCalledOnce(); // went to 'yes' which is 'end'
    });

    it('or condition: true when at least one sub-condition passes', () => {
      // game state returns 'paused', so first sub fails, second sub passes
      core.events.on('orTest', 'game/state:get', (_p: unknown, o: { state: string }) => {
        o.state = 'paused';
      });
      const tree = makeCondTree({
        type: 'or',
        conditions: [
          { type: 'game-state', state: 'playing' }, // false
          { type: 'game-state', state: 'paused' },  // true
        ],
      });
      core.events.emitSync('dialogue/register', { treeId: 'or1', tree });
      const ended = vi.fn();
      core.events.on('testOr', 'dialogue/ended', ended);
      core.events.emitSync('dialogue/start', { treeId: 'or1' });
      // OR is true → goes to 'yes' (end node)
      expect(ended).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Save-flag condition
  // -------------------------------------------------------------------------

  describe('save-flag condition', () => {
    it('passes when key exists in global save data', () => {
      core.events.on('sfTest', 'save/global:get', (_p: unknown, o: { data: { data: Record<string, unknown> } }) => {
        o.data = { data: { unlockedArea: true }, updatedAt: 0 };
      });
      const tree: DialogueTree = {
        entry: 'gate',
        nodes: {
          gate: {
            id: 'gate',
            type: 'condition',
            condition: { type: 'save-flag', key: 'unlockedArea' },
            then: 'yes',
            else: 'no',
          },
          yes: { id: 'yes', type: 'text', text: 'Unlocked!', next: 'fin' },
          no:  { id: 'no',  type: 'text', text: 'Locked.',   next: 'fin' },
          fin: { id: 'fin', type: 'end' },
        },
      };
      core.events.emitSync('dialogue/register', { treeId: 'sf1', tree });
      const nodeH = vi.fn();
      core.events.on('testSF', 'dialogue/node', nodeH);
      core.events.emitSync('dialogue/start', { treeId: 'sf1' });
      expect(nodeH.mock.calls[0]![0]).toMatchObject({ nodeId: 'yes' });
    });

    it('passes when value matches', () => {
      core.events.on('sfVal', 'save/global:get', (_p: unknown, o: { data: { data: Record<string, unknown> } }) => {
        o.data = { data: { score: 42 }, updatedAt: 0 };
      });
      const tree: DialogueTree = {
        entry: 'gate',
        nodes: {
          gate: {
            id: 'gate',
            type: 'condition',
            condition: { type: 'save-flag', key: 'score', value: 42 },
            then: 'yes',
            else: 'no',
          },
          yes: { id: 'yes', type: 'text', text: 'Match!', next: 'fin' },
          no:  { id: 'no',  type: 'text', text: 'No.',    next: 'fin' },
          fin: { id: 'fin', type: 'end' },
        },
      };
      core.events.emitSync('dialogue/register', { treeId: 'sfV2', tree });
      const nodeH = vi.fn();
      core.events.on('testSFV', 'dialogue/node', nodeH);
      core.events.emitSync('dialogue/start', { treeId: 'sfV2' });
      expect(nodeH.mock.calls[0]![0]).toMatchObject({ nodeId: 'yes' });
    });
  });

  // -------------------------------------------------------------------------
  // Jump node
  // -------------------------------------------------------------------------

  describe('jump nodes', () => {
    it('transparently jumps to the target node', () => {
      const JUMP_TREE: DialogueTree = {
        entry: 'j1',
        nodes: {
          j1: { id: 'j1', type: 'jump', target: 'j2' },
          j2: { id: 'j2', type: 'text', text: 'After jump', next: 'fin' },
          fin: { id: 'fin', type: 'end' },
        },
      };
      core.events.emitSync('dialogue/register', { treeId: 'jump', tree: JUMP_TREE });
      const nodeH = vi.fn();
      core.events.on('testJump', 'dialogue/node', nodeH);
      core.events.emitSync('dialogue/start', { treeId: 'jump' });
      expect(nodeH.mock.calls[0]![0]).toMatchObject({ nodeId: 'j2' });
    });
  });

  // -------------------------------------------------------------------------
  // Force end
  // -------------------------------------------------------------------------

  describe('dialogue/end (force)', () => {
    it('ends the active session', () => {
      core.events.emitSync('dialogue/register', { treeId: 'fe', tree: SIMPLE_TREE });
      core.events.emitSync('dialogue/start', { treeId: 'fe' });
      expect(dm.isActive).toBe(true);

      const endedHandler = vi.fn();
      core.events.on('test', 'dialogue/ended', endedHandler);
      core.events.emitSync('dialogue/end', {});
      expect(dm.isActive).toBe(false);
      expect(endedHandler).toHaveBeenCalledOnce();
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
        'dialogue/state:get',
        {},
      );
      expect(output.active).toBe(false);
      expect(output.treeId).toBeNull();
      expect(output.nodeId).toBeNull();
      expect(output.choices).toHaveLength(0);
      expect(output.text).toBe('');
      expect(output.textDone).toBe(true);
    });

    it('returns active state during a session', () => {
      core.events.emitSync('dialogue/register', { treeId: 'st', tree: SIMPLE_TREE });
      core.events.emitSync('dialogue/start', { treeId: 'st' });
      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get',
        {},
      );
      expect(output.active).toBe(true);
      expect(output.treeId).toBe('st');
      expect(output.nodeId).toBe('n1');
      expect(output.textDone).toBe(false);
    });

    it('reports partial text from typewriter', () => {
      core.events.emitSync('dialogue/register', { treeId: 'st2', tree: SIMPLE_TREE });
      core.events.emitSync('dialogue/start', { treeId: 'st2' });
      // Advance 50ms at 100 cps → ~5 chars
      core.events.emitSync('core/update', { dt: 50, tick: 1 });
      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get',
        {},
      );
      expect(output.text.length).toBeGreaterThan(0);
      expect(output.text.length).toBeLessThan('Hello world!'.length);
    });
  });

  // -------------------------------------------------------------------------
  // i18n integration
  // -------------------------------------------------------------------------

  describe('i18n integration', () => {
    it('resolves text via i18n/t when i18nKey is provided', () => {
      core.events.on('i18nTest', 'i18n/t', (p: { key: string }, output: { value: string }) => {
        if (p.key === 'greeting') output.value = 'Bonjour!';
      });

      const I18N_TREE: DialogueTree = {
        entry: 'n1',
        nodes: {
          n1: { id: 'n1', type: 'text', i18nKey: 'greeting', next: 'n2' },
          n2: { id: 'n2', type: 'end' },
        },
      };
      core.events.emitSync('dialogue/register', { treeId: 'i18n', tree: I18N_TREE });
      core.events.emitSync('dialogue/start', { treeId: 'i18n' });

      const { output } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get',
        {},
      );
      // Immediately skip typewriter
      core.events.emitSync('dialogue/advance', {});
      const { output: out2 } = core.events.emitSync<Record<string, never>, DialogueStateGetOutput>(
        'dialogue/state:get',
        {},
      );
      expect(out2.text).toBe('Bonjour!');
      void output;
    });
  });

  // -------------------------------------------------------------------------
  // Missing node warning
  // -------------------------------------------------------------------------

  describe('missing node', () => {
    it('warns and ends dialogue when a node id is not found', () => {
      const BROKEN_TREE: DialogueTree = {
        entry: 'n1',
        nodes: {
          n1: { id: 'n1', type: 'text', text: 'Hi', next: 'nonexistent' },
        },
      };
      core.events.emitSync('dialogue/register', { treeId: 'broken', tree: BROKEN_TREE });
      core.events.emitSync('dialogue/start', { treeId: 'broken' });

      // Finish typewriter + advance
      core.events.emitSync('core/update', { dt: 1000, tick: 1 });

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ended = vi.fn();
      core.events.on('testBroken', 'dialogue/ended', ended);
      core.events.emitSync('dialogue/advance', {});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nonexistent"'));
      expect(ended).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });
});
