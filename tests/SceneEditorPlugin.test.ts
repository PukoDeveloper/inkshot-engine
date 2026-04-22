import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SceneEditorPlugin } from '../src/plugins/scene/SceneEditorPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  SceneEditorStateOutput,
  SceneEditorExportOutput,
  SceneEditorObjectPlaceOutput,
  ScenePlacedObject,
} from '../src/types/sceneeditor.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createCoreStub() {
  const events = new EventBus();
  const core = { events } as unknown as Core;

  const editor = new SceneEditorPlugin();
  editor.init(core);

  return { core, editor };
}

function getState(core: Core): SceneEditorStateOutput {
  const { output } = core.events.emitSync<unknown, SceneEditorStateOutput>(
    'sceneeditor/state', {},
  );
  return output as SceneEditorStateOutput;
}

function placeObject(
  core: Core,
  x: number,
  y: number,
  id?: string,
  properties?: Record<string, unknown>,
): ScenePlacedObject {
  const { output } = core.events.emitSync<unknown, SceneEditorObjectPlaceOutput>(
    'sceneeditor/object:place', { x, y, id, properties },
  );
  return (output as SceneEditorObjectPlaceOutput).object;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SceneEditorPlugin', () => {
  let core: Core;

  beforeEach(() => {
    ({ core } = createCoreStub());
  });

  // ── open / close ──────────────────────────────────────────────────────────

  describe('open / close', () => {
    it('starts closed', () => {
      expect(getState(core).open).toBe(false);
    });

    it('opens via sceneeditor/open event', () => {
      core.events.emitSync('sceneeditor/open', {});
      expect(getState(core).open).toBe(true);
    });

    it('closes via sceneeditor/close event', () => {
      core.events.emitSync('sceneeditor/open', {});
      core.events.emitSync('sceneeditor/close', {});
      expect(getState(core).open).toBe(false);
    });

    it('emits sceneeditor/opened notification', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/opened', handler);
      core.events.emitSync('sceneeditor/open', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits sceneeditor/closed notification', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/closed', handler);
      core.events.emitSync('sceneeditor/open', {});
      core.events.emitSync('sceneeditor/close', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('open is idempotent (does not emit twice)', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/opened', handler);
      core.events.emitSync('sceneeditor/open', {});
      core.events.emitSync('sceneeditor/open', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('close is idempotent (does not emit twice)', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/closed', handler);
      core.events.emitSync('sceneeditor/open', {});
      core.events.emitSync('sceneeditor/close', {});
      core.events.emitSync('sceneeditor/close', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── tool selection ────────────────────────────────────────────────────────

  describe('tool selection', () => {
    it('default tool is select', () => {
      expect(getState(core).tool).toBe('select');
    });

    it('sets tool via sceneeditor/tool:set', () => {
      core.events.emitSync('sceneeditor/tool:set', { tool: 'place' });
      expect(getState(core).tool).toBe('place');
    });

    it('can set all tool types', () => {
      for (const tool of ['place', 'select', 'move', 'erase'] as const) {
        core.events.emitSync('sceneeditor/tool:set', { tool });
        expect(getState(core).tool).toBe(tool);
      }
    });
  });

  // ── actor type selection ──────────────────────────────────────────────────

  describe('actor type selection', () => {
    it('default selectedActorType is null', () => {
      expect(getState(core).selectedActorType).toBeNull();
    });

    it('sets actor type via sceneeditor/actor-type:select', () => {
      core.events.emitSync('sceneeditor/actor-type:select', { actorType: 'enemy' });
      expect(getState(core).selectedActorType).toBe('enemy');
    });
  });

  // ── object placement ──────────────────────────────────────────────────────

  describe('object:place', () => {
    it('does not place when editor is closed', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/object:place', { x: 10, y: 20 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('places an object and returns it in output', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 100, 200);
      expect(obj).toBeDefined();
      expect(obj.x).toBe(100);
      expect(obj.y).toBe(200);
    });

    it('assigns auto-generated id', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0);
      expect(obj.id).toMatch(/^obj_\d+$/);
    });

    it('uses provided id when given', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0, 'my-custom-id');
      expect(obj.id).toBe('my-custom-id');
    });

    it('uses selected actor type', () => {
      core.events.emitSync('sceneeditor/open', {});
      core.events.emitSync('sceneeditor/actor-type:select', { actorType: 'npc' });
      const obj = placeObject(core, 0, 0);
      expect(obj.actorType).toBe('npc');
    });

    it('assigns provided properties', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0, undefined, { hp: 100, name: 'guard' });
      expect(obj.properties).toEqual({ hp: 100, name: 'guard' });
    });

    it('assigns empty properties by default', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0);
      expect(obj.properties).toEqual({});
    });

    it('emits sceneeditor/objects:changed', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/open', {});
      placeObject(core, 0, 0);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('increments id counter for multiple objects', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj1 = placeObject(core, 0, 0);
      const obj2 = placeObject(core, 10, 10);
      expect(obj1.id).not.toBe(obj2.id);
    });
  });

  // ── object selection ──────────────────────────────────────────────────────

  describe('object:select', () => {
    it('default selectedObjectId is null', () => {
      expect(getState(core).selectedObjectId).toBeNull();
    });

    it('selects an object by id', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0, 'obj-a');
      core.events.emitSync('sceneeditor/object:select', { id: obj.id });
      expect(getState(core).selectedObjectId).toBe('obj-a');
    });

    it('deselects by passing null', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0);
      core.events.emitSync('sceneeditor/object:select', { id: obj.id });
      core.events.emitSync('sceneeditor/object:select', { id: null });
      expect(getState(core).selectedObjectId).toBeNull();
    });
  });

  // ── object move ───────────────────────────────────────────────────────────

  describe('object:move', () => {
    it('moves an existing object', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 10, 20, 'obj-move');
      core.events.emitSync('sceneeditor/object:move', { id: obj.id, x: 50, y: 60 });

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      const moved = (output as SceneEditorExportOutput).objects.find((o) => o.id === 'obj-move');
      expect(moved?.x).toBe(50);
      expect(moved?.y).toBe(60);
    });

    it('does nothing for non-existent id', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/object:move', { id: 'no-such-id', x: 0, y: 0 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits sceneeditor/objects:changed', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0);
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/object:move', { id: obj.id, x: 5, y: 5 });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── object remove ─────────────────────────────────────────────────────────

  describe('object:remove', () => {
    it('removes an existing object', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0, 'obj-rm');
      core.events.emitSync('sceneeditor/object:remove', { id: obj.id });

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      expect((output as SceneEditorExportOutput).objects).toHaveLength(0);
    });

    it('deselects if the removed object was selected', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0);
      core.events.emitSync('sceneeditor/object:select', { id: obj.id });
      expect(getState(core).selectedObjectId).toBe(obj.id);

      core.events.emitSync('sceneeditor/object:remove', { id: obj.id });
      expect(getState(core).selectedObjectId).toBeNull();
    });

    it('does nothing for non-existent id', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/object:remove', { id: 'no-such-id' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits sceneeditor/objects:changed', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0);
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/object:remove', { id: obj.id });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── undo / redo ───────────────────────────────────────────────────────────

  describe('undo / redo', () => {
    it('canUndo is false initially', () => {
      expect(getState(core).canUndo).toBe(false);
    });

    it('canUndo is true after placing an object', () => {
      core.events.emitSync('sceneeditor/open', {});
      placeObject(core, 0, 0);
      expect(getState(core).canUndo).toBe(true);
    });

    it('undo reverts a place', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 0, 0);
      core.events.emitSync('sceneeditor/undo', {});

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      expect((output as SceneEditorExportOutput).objects).not.toContainEqual(
        expect.objectContaining({ id: obj.id }),
      );
      expect(getState(core).canUndo).toBe(false);
    });

    it('redo re-applies undone place', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 10, 20);
      core.events.emitSync('sceneeditor/undo', {});
      core.events.emitSync('sceneeditor/redo', {});

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      expect((output as SceneEditorExportOutput).objects).toContainEqual(
        expect.objectContaining({ id: obj.id, x: 10, y: 20 }),
      );
      expect(getState(core).canRedo).toBe(false);
    });

    it('undo reverts a move', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 10, 20);
      core.events.emitSync('sceneeditor/object:move', { id: obj.id, x: 50, y: 60 });
      core.events.emitSync('sceneeditor/undo', {});

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      const restored = (output as SceneEditorExportOutput).objects.find((o) => o.id === obj.id);
      expect(restored?.x).toBe(10);
      expect(restored?.y).toBe(20);
    });

    it('undo restores a removed object', () => {
      core.events.emitSync('sceneeditor/open', {});
      const obj = placeObject(core, 5, 5);
      core.events.emitSync('sceneeditor/object:remove', { id: obj.id });
      core.events.emitSync('sceneeditor/undo', {});

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      expect((output as SceneEditorExportOutput).objects).toContainEqual(
        expect.objectContaining({ id: obj.id }),
      );
    });

    it('redo stack is cleared after a new edit', () => {
      core.events.emitSync('sceneeditor/open', {});
      placeObject(core, 0, 0);
      core.events.emitSync('sceneeditor/undo', {});
      expect(getState(core).canRedo).toBe(true);
      placeObject(core, 1, 1);
      expect(getState(core).canRedo).toBe(false);
    });

    it('undo emits sceneeditor/objects:changed', () => {
      core.events.emitSync('sceneeditor/open', {});
      placeObject(core, 0, 0);
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/undo', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('redo emits sceneeditor/objects:changed', () => {
      core.events.emitSync('sceneeditor/open', {});
      placeObject(core, 0, 0);
      core.events.emitSync('sceneeditor/undo', {});
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/redo', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('undo does nothing when stack is empty', () => {
      const handler = vi.fn();
      core.events.on('_test', 'sceneeditor/objects:changed', handler);
      core.events.emitSync('sceneeditor/undo', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── export ────────────────────────────────────────────────────────────────

  describe('export', () => {
    it('returns empty objects when no objects placed', () => {
      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      expect((output as SceneEditorExportOutput).objects).toHaveLength(0);
    });

    it('returns all placed objects', () => {
      core.events.emitSync('sceneeditor/open', {});
      core.events.emitSync('sceneeditor/actor-type:select', { actorType: 'hero' });
      placeObject(core, 10, 20, 'a');
      placeObject(core, 30, 40, 'b');

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      expect((output as SceneEditorExportOutput).objects).toHaveLength(2);
    });

    it('returns valid tiledObjectLayer', () => {
      core.events.emitSync('sceneeditor/open', {});
      core.events.emitSync('sceneeditor/actor-type:select', { actorType: 'enemy' });
      placeObject(core, 100, 200, 'e1', { speed: 5 });

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      const layer = (output as SceneEditorExportOutput).tiledObjectLayer;
      expect(layer.type).toBe('objectgroup');
      expect(layer.objects).toHaveLength(1);
      expect(layer.objects[0]).toMatchObject({
        id: 1,
        name: 'e1',
        type: 'enemy',
        x: 100,
        y: 200,
      });
    });

    it('converts properties to Tiled format', () => {
      core.events.emitSync('sceneeditor/open', {});
      placeObject(core, 0, 0, 'p1', { key: 'val', num: 42 });

      const { output } = core.events.emitSync<unknown, SceneEditorExportOutput>(
        'sceneeditor/export', {},
      );
      const props = (output as SceneEditorExportOutput).tiledObjectLayer.objects[0]?.properties;
      expect(props).toContainEqual({ name: 'key', type: 'string', value: 'val' });
      expect(props).toContainEqual({ name: 'num', type: 'string', value: '42' });
    });
  });

  // ── state ─────────────────────────────────────────────────────────────────

  describe('state', () => {
    it('returns full state snapshot', () => {
      core.events.emitSync('sceneeditor/open', {});
      core.events.emitSync('sceneeditor/tool:set', { tool: 'erase' });
      core.events.emitSync('sceneeditor/actor-type:select', { actorType: 'tree' });
      placeObject(core, 0, 0, 'obj-x');
      core.events.emitSync('sceneeditor/object:select', { id: 'obj-x' });

      const state = getState(core);
      expect(state.open).toBe(true);
      expect(state.tool).toBe('erase');
      expect(state.selectedActorType).toBe('tree');
      expect(state.selectedObjectId).toBe('obj-x');
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
    });
  });

  // ── destroy ───────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes all event listeners on destroy', () => {
      const { core: c, editor } = createCoreStub();
      editor.destroy(c);

      c.events.emitSync('sceneeditor/open', {});
      const { output } = c.events.emitSync<unknown, SceneEditorStateOutput>('sceneeditor/state', {});
      expect((output as SceneEditorStateOutput).open).toBeFalsy();
    });
  });
});
