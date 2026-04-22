import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { ScriptNodeEditorPlugin } from '../src/plugins/rpg/ScriptNodeEditorPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  ScriptNodeEditorStateOutput,
  ScriptNodeEditorExportOutput,
  ScriptNodeEditorNodeAddOutput,
  ScriptEditorNode,
} from '../src/types/scriptnodeeditor.js';
import type { ScriptDefineParams } from '../src/types/script.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createCoreStub() {
  const events = new EventBus();
  const core = { events } as unknown as Core;

  // Mock script/define handler (simulates ScriptManager)
  const scriptDefineHandler = vi.fn();
  events.on('_scriptmgr', 'script/define', (p: ScriptDefineParams) => {
    scriptDefineHandler(p);
  });

  const editor = new ScriptNodeEditorPlugin();
  editor.init(core);

  return { core, editor, scriptDefineHandler };
}

function getState(core: Core): ScriptNodeEditorStateOutput {
  const { output } = core.events.emitSync<unknown, ScriptNodeEditorStateOutput>(
    'scriptnodeeditor/state', {},
  );
  return output as ScriptNodeEditorStateOutput;
}

function addNode(
  core: Core,
  cmd: string,
  opts: { x?: number; y?: number; data?: Record<string, unknown>; id?: string } = {},
): ScriptEditorNode {
  const { output } = core.events.emitSync<unknown, ScriptNodeEditorNodeAddOutput>(
    'scriptnodeeditor/node:add', { cmd, ...opts },
  );
  return (output as ScriptNodeEditorNodeAddOutput).node;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScriptNodeEditorPlugin', () => {
  let core: Core;
  let scriptDefineHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ core, scriptDefineHandler } = createCoreStub());
  });

  // ── open / close ──────────────────────────────────────────────────────────

  describe('open / close', () => {
    it('starts closed', () => {
      expect(getState(core).open).toBe(false);
    });

    it('opens via scriptnodeeditor/open', () => {
      core.events.emitSync('scriptnodeeditor/open', {});
      expect(getState(core).open).toBe(true);
    });

    it('closes via scriptnodeeditor/close', () => {
      core.events.emitSync('scriptnodeeditor/open', {});
      core.events.emitSync('scriptnodeeditor/close', {});
      expect(getState(core).open).toBe(false);
    });

    it('emits scriptnodeeditor/opened with scriptId', () => {
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/opened', handler);
      core.events.emitSync('scriptnodeeditor/open', { scriptId: 'intro' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0]).toMatchObject({ scriptId: 'intro' });
    });

    it('emits scriptnodeeditor/opened with null scriptId when not provided', () => {
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/opened', handler);
      core.events.emitSync('scriptnodeeditor/open', {});
      expect(handler.mock.calls[0]?.[0]).toMatchObject({ scriptId: null });
    });

    it('emits scriptnodeeditor/closed', () => {
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/closed', handler);
      core.events.emitSync('scriptnodeeditor/open', {});
      core.events.emitSync('scriptnodeeditor/close', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('stores scriptId in state', () => {
      core.events.emitSync('scriptnodeeditor/open', { scriptId: 'quest-01' });
      expect(getState(core).scriptId).toBe('quest-01');
    });

    it('open with new scriptId replaces previous scriptId', () => {
      core.events.emitSync('scriptnodeeditor/open', { scriptId: 'old' });
      core.events.emitSync('scriptnodeeditor/open', { scriptId: 'new' });
      expect(getState(core).scriptId).toBe('new');
    });
  });

  // ── node:add ──────────────────────────────────────────────────────────────

  describe('node:add', () => {
    it('creates a node with correct fields', () => {
      const node = addNode(core, 'say', { x: 10, y: 20, data: { text: 'Hello' }, id: 'n1' });
      expect(node.id).toBe('n1');
      expect(node.cmd).toBe('say');
      expect(node.x).toBe(10);
      expect(node.y).toBe(20);
      expect(node.data).toEqual({ text: 'Hello' });
      expect(node.nextId).toBeNull();
    });

    it('assigns auto-generated id', () => {
      const node = addNode(core, 'end');
      expect(node.id).toMatch(/^node_\d+$/);
    });

    it('defaults x and y to 0', () => {
      const node = addNode(core, 'end');
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
    });

    it('defaults data to empty object', () => {
      const node = addNode(core, 'end');
      expect(node.data).toEqual({});
    });

    it('increments id counter for multiple nodes', () => {
      const n1 = addNode(core, 'a');
      const n2 = addNode(core, 'b');
      expect(n1.id).not.toBe(n2.id);
    });

    it('emits scriptnodeeditor/nodes:changed', () => {
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      addNode(core, 'say');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('appears in state.nodes', () => {
      addNode(core, 'jump', { id: 'jmp' });
      const state = getState(core);
      expect(state.nodes).toContainEqual(expect.objectContaining({ id: 'jmp', cmd: 'jump' }));
    });
  });

  // ── node:update ───────────────────────────────────────────────────────────

  describe('node:update', () => {
    it('updates cmd', () => {
      addNode(core, 'say', { id: 'n1' });
      core.events.emitSync('scriptnodeeditor/node:update', { id: 'n1', cmd: 'wait' });
      const state = getState(core);
      expect(state.nodes.find((n) => n.id === 'n1')?.cmd).toBe('wait');
    });

    it('updates x and y', () => {
      addNode(core, 'say', { id: 'n1' });
      core.events.emitSync('scriptnodeeditor/node:update', { id: 'n1', x: 50, y: 75 });
      const state = getState(core);
      const node = state.nodes.find((n) => n.id === 'n1');
      expect(node?.x).toBe(50);
      expect(node?.y).toBe(75);
    });

    it('updates data', () => {
      addNode(core, 'say', { id: 'n1', data: { text: 'old' } });
      core.events.emitSync('scriptnodeeditor/node:update', { id: 'n1', data: { text: 'new' } });
      const state = getState(core);
      expect(state.nodes.find((n) => n.id === 'n1')?.data).toEqual({ text: 'new' });
    });

    it('only updates provided fields', () => {
      addNode(core, 'say', { id: 'n1', x: 10, y: 20, data: { text: 'hi' } });
      core.events.emitSync('scriptnodeeditor/node:update', { id: 'n1', x: 99 });
      const state = getState(core);
      const node = state.nodes.find((n) => n.id === 'n1');
      expect(node?.x).toBe(99);
      expect(node?.y).toBe(20); // unchanged
      expect(node?.data).toEqual({ text: 'hi' }); // unchanged
    });

    it('does nothing for non-existent id', () => {
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      core.events.emitSync('scriptnodeeditor/node:update', { id: 'no-such-id', cmd: 'x' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits scriptnodeeditor/nodes:changed', () => {
      addNode(core, 'say', { id: 'n1' });
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      core.events.emitSync('scriptnodeeditor/node:update', { id: 'n1', cmd: 'wait' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── node:remove ───────────────────────────────────────────────────────────

  describe('node:remove', () => {
    it('removes a node', () => {
      addNode(core, 'say', { id: 'n1' });
      core.events.emitSync('scriptnodeeditor/node:remove', { id: 'n1' });
      expect(getState(core).nodes).toHaveLength(0);
    });

    it('clears nextId references pointing to removed node', () => {
      addNode(core, 'say', { id: 'n1' });
      addNode(core, 'end', { id: 'n2' });
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'n1', toId: 'n2' });
      core.events.emitSync('scriptnodeeditor/node:remove', { id: 'n2' });

      const n1 = getState(core).nodes.find((n) => n.id === 'n1');
      expect(n1?.nextId).toBeNull();
    });

    it('does nothing for non-existent id', () => {
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      core.events.emitSync('scriptnodeeditor/node:remove', { id: 'no-such-id' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits scriptnodeeditor/nodes:changed', () => {
      addNode(core, 'say', { id: 'n1' });
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      core.events.emitSync('scriptnodeeditor/node:remove', { id: 'n1' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── node:connect ──────────────────────────────────────────────────────────

  describe('node:connect', () => {
    it('connects two nodes', () => {
      addNode(core, 'say', { id: 'n1' });
      addNode(core, 'end', { id: 'n2' });
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'n1', toId: 'n2' });

      const n1 = getState(core).nodes.find((n) => n.id === 'n1');
      expect(n1?.nextId).toBe('n2');
    });

    it('disconnects by passing null', () => {
      addNode(core, 'say', { id: 'n1' });
      addNode(core, 'end', { id: 'n2' });
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'n1', toId: 'n2' });
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'n1', toId: null });

      const n1 = getState(core).nodes.find((n) => n.id === 'n1');
      expect(n1?.nextId).toBeNull();
    });

    it('does nothing for non-existent fromId', () => {
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'no-such', toId: null });
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits scriptnodeeditor/nodes:changed', () => {
      addNode(core, 'say', { id: 'n1' });
      addNode(core, 'end', { id: 'n2' });
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'n1', toId: 'n2' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── undo / redo ───────────────────────────────────────────────────────────

  describe('undo / redo', () => {
    it('canUndo is false initially', () => {
      expect(getState(core).canUndo).toBe(false);
    });

    it('canUndo is true after adding a node', () => {
      addNode(core, 'say');
      expect(getState(core).canUndo).toBe(true);
    });

    it('undo reverts node:add', () => {
      const node = addNode(core, 'say', { id: 'n1' });
      core.events.emitSync('scriptnodeeditor/undo', {});
      expect(getState(core).nodes).not.toContainEqual(expect.objectContaining({ id: node.id }));
      expect(getState(core).canUndo).toBe(false);
    });

    it('redo re-applies undone node:add', () => {
      const node = addNode(core, 'say', { id: 'n1' });
      core.events.emitSync('scriptnodeeditor/undo', {});
      core.events.emitSync('scriptnodeeditor/redo', {});
      expect(getState(core).nodes).toContainEqual(expect.objectContaining({ id: node.id }));
      expect(getState(core).canRedo).toBe(false);
    });

    it('undo reverts node:remove', () => {
      addNode(core, 'say', { id: 'n1' });
      core.events.emitSync('scriptnodeeditor/node:remove', { id: 'n1' });
      core.events.emitSync('scriptnodeeditor/undo', {});
      expect(getState(core).nodes).toContainEqual(expect.objectContaining({ id: 'n1' }));
    });

    it('undo reverts node:update', () => {
      addNode(core, 'say', { id: 'n1', data: { text: 'original' } });
      core.events.emitSync('scriptnodeeditor/node:update', { id: 'n1', data: { text: 'updated' } });
      core.events.emitSync('scriptnodeeditor/undo', {});
      const node = getState(core).nodes.find((n) => n.id === 'n1');
      expect(node?.data).toEqual({ text: 'original' });
    });

    it('undo reverts node:connect', () => {
      addNode(core, 'say', { id: 'n1' });
      addNode(core, 'end', { id: 'n2' });
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'n1', toId: 'n2' });
      core.events.emitSync('scriptnodeeditor/undo', {});
      const n1 = getState(core).nodes.find((n) => n.id === 'n1');
      expect(n1?.nextId).toBeNull();
    });

    it('redo stack is cleared after new edit', () => {
      addNode(core, 'say');
      core.events.emitSync('scriptnodeeditor/undo', {});
      expect(getState(core).canRedo).toBe(true);
      addNode(core, 'end');
      expect(getState(core).canRedo).toBe(false);
    });

    it('undo emits scriptnodeeditor/nodes:changed', () => {
      addNode(core, 'say');
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      core.events.emitSync('scriptnodeeditor/undo', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('undo does nothing when stack is empty', () => {
      const handler = vi.fn();
      core.events.on('_test', 'scriptnodeeditor/nodes:changed', handler);
      core.events.emitSync('scriptnodeeditor/undo', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── export ────────────────────────────────────────────────────────────────

  describe('export', () => {
    it('returns null script when no nodes', () => {
      const { output } = core.events.emitSync<unknown, ScriptNodeEditorExportOutput>(
        'scriptnodeeditor/export', {},
      );
      expect((output as ScriptNodeEditorExportOutput).script).toBeNull();
    });

    it('compiles a linear chain to ScriptDef', () => {
      addNode(core, 'say', { id: 'n1', data: { text: 'Hello' } });
      addNode(core, 'end', { id: 'n2' });
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'n1', toId: 'n2' });
      core.events.emitSync('scriptnodeeditor/open', { scriptId: 'my-script' });

      const { output } = core.events.emitSync<unknown, ScriptNodeEditorExportOutput>(
        'scriptnodeeditor/export', {},
      );
      const script = (output as ScriptNodeEditorExportOutput).script;
      expect(script).not.toBeNull();
      expect(script?.id).toBe('my-script');
      expect(script?.nodes).toHaveLength(2);
      expect(script?.nodes[0]).toMatchObject({ cmd: 'say', text: 'Hello' });
      expect(script?.nodes[1]).toMatchObject({ cmd: 'end' });
    });

    it('uses untitled as scriptId when none set', () => {
      addNode(core, 'say', { id: 'n1' });
      const { output } = core.events.emitSync<unknown, ScriptNodeEditorExportOutput>(
        'scriptnodeeditor/export', {},
      );
      expect((output as ScriptNodeEditorExportOutput).script?.id).toBe('untitled');
    });

    it('includes data fields in compiled nodes', () => {
      addNode(core, 'choices', { id: 'n1', data: { choices: ['Yes', 'No'], var: 'answer' } });

      const { output } = core.events.emitSync<unknown, ScriptNodeEditorExportOutput>(
        'scriptnodeeditor/export', {},
      );
      const node = (output as ScriptNodeEditorExportOutput).script?.nodes[0];
      expect(node).toMatchObject({ cmd: 'choices', choices: ['Yes', 'No'], var: 'answer' });
    });
  });

  // ── compile ───────────────────────────────────────────────────────────────

  describe('compile', () => {
    it('calls script/define with compiled script', () => {
      addNode(core, 'say', { id: 'n1', data: { text: 'hi' } });
      core.events.emitSync('scriptnodeeditor/compile', { scriptId: 'test-script' });

      expect(scriptDefineHandler).toHaveBeenCalledTimes(1);
      const call = scriptDefineHandler.mock.calls[0]?.[0] as { script: { id: string } };
      expect(call.script.id).toBe('test-script');
    });

    it('compiles chain and registers with script/define', () => {
      addNode(core, 'say', { id: 'n1', data: { text: 'Hello' } });
      addNode(core, 'end', { id: 'n2' });
      core.events.emitSync('scriptnodeeditor/node:connect', { fromId: 'n1', toId: 'n2' });
      core.events.emitSync('scriptnodeeditor/compile', { scriptId: 'compiled' });

      const call = scriptDefineHandler.mock.calls[0]?.[0] as { script: { nodes: unknown[] } };
      expect(call.script.nodes).toHaveLength(2);
    });
  });

  // ── state ─────────────────────────────────────────────────────────────────

  describe('state', () => {
    it('returns full state snapshot', () => {
      core.events.emitSync('scriptnodeeditor/open', { scriptId: 'my-script' });
      addNode(core, 'say', { id: 'n1' });

      const state = getState(core);
      expect(state.open).toBe(true);
      expect(state.scriptId).toBe('my-script');
      expect(state.nodes).toHaveLength(1);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
    });
  });

  // ── destroy ───────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes all event listeners on destroy', () => {
      const { core: c, editor } = createCoreStub();
      editor.destroy(c);

      c.events.emitSync('scriptnodeeditor/open', {});
      const { output } = c.events.emitSync<unknown, ScriptNodeEditorStateOutput>(
        'scriptnodeeditor/state', {},
      );
      expect((output as ScriptNodeEditorStateOutput).open).toBeFalsy();
    });
  });
});
