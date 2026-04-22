import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  SceneEditorTool,
  SceneEditorCommand,
  ScenePlacedObject,
  SceneEditorOpenParams,
  SceneEditorCloseParams,
  SceneEditorToolSetParams,
  SceneEditorActorTypeSelectParams,
  SceneEditorObjectPlaceParams,
  SceneEditorObjectPlaceOutput,
  SceneEditorObjectSelectParams,
  SceneEditorObjectMoveParams,
  SceneEditorObjectRemoveParams,
  SceneEditorUndoParams,
  SceneEditorRedoParams,
  SceneEditorExportOutput,
  SceneEditorStateOutput,
} from '../../types/sceneeditor.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_UNDO_HISTORY = 100;

/** Name assigned to the Tiled-compatible object layer produced by `sceneeditor/export`. */
const EXPORT_LAYER_NAME = 'objects';

// ---------------------------------------------------------------------------
// SceneEditorPlugin
// ---------------------------------------------------------------------------

/**
 * In-engine scene editor plugin.
 *
 * Provides a workflow for placing, moving, and removing scene objects driven
 * exclusively through the {@link EventBus}.
 *
 * ### EventBus API
 *
 * | Event                              | Params / Output                              |
 * |------------------------------------|----------------------------------------------|
 * | `sceneeditor/open`                 | `SceneEditorOpenParams`                      |
 * | `sceneeditor/close`                | `SceneEditorCloseParams`                     |
 * | `sceneeditor/tool:set`             | `SceneEditorToolSetParams`                   |
 * | `sceneeditor/actor-type:select`    | `SceneEditorActorTypeSelectParams`           |
 * | `sceneeditor/object:place`         | `SceneEditorObjectPlaceParams → Output`      |
 * | `sceneeditor/object:select`        | `SceneEditorObjectSelectParams`              |
 * | `sceneeditor/object:move`          | `SceneEditorObjectMoveParams`                |
 * | `sceneeditor/object:remove`        | `SceneEditorObjectRemoveParams`              |
 * | `sceneeditor/undo`                 | `SceneEditorUndoParams`                      |
 * | `sceneeditor/redo`                 | `SceneEditorRedoParams`                      |
 * | `sceneeditor/export`               | `{} → SceneEditorExportOutput`               |
 * | `sceneeditor/state`                | `{} → SceneEditorStateOutput`                |
 * | `sceneeditor/opened`               | `SceneEditorOpenedParams` (notification)     |
 * | `sceneeditor/closed`               | `SceneEditorClosedParams` (notification)     |
 * | `sceneeditor/objects:changed`      | `SceneEditorObjectsChangedParams` (notify)   |
 */
export class SceneEditorPlugin implements EnginePlugin {
  readonly namespace = 'scene-editor';
  readonly dependencies = ['input'] as const;

  // ── Editor state ───────────────────────────────────────────────────────────

  private _core: Core | null = null;

  private _open = false;
  private _tool: SceneEditorTool = 'select';
  private _selectedActorType: string | null = null;
  private _selectedObjectId: string | null = null;

  // ── Objects ───────────────────────────────────────────────────────────────

  private _objects: Map<string, ScenePlacedObject> = new Map();

  // ── Undo / redo stacks ────────────────────────────────────────────────────

  private _undoStack: SceneEditorCommand[] = [];
  private _redoStack: SceneEditorCommand[] = [];

  // ── ID counter ────────────────────────────────────────────────────────────

  private _idCounter = 0;

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    core.events.on(this.namespace, 'sceneeditor/open', this._onOpen);
    core.events.on(this.namespace, 'sceneeditor/close', this._onClose);
    core.events.on(this.namespace, 'sceneeditor/tool:set', this._onToolSet);
    core.events.on(this.namespace, 'sceneeditor/actor-type:select', this._onActorTypeSelect);
    core.events.on(this.namespace, 'sceneeditor/object:place', this._onObjectPlace);
    core.events.on(this.namespace, 'sceneeditor/object:select', this._onObjectSelect);
    core.events.on(this.namespace, 'sceneeditor/object:move', this._onObjectMove);
    core.events.on(this.namespace, 'sceneeditor/object:remove', this._onObjectRemove);
    core.events.on(this.namespace, 'sceneeditor/undo', this._onUndo);
    core.events.on(this.namespace, 'sceneeditor/redo', this._onRedo);
    core.events.on(this.namespace, 'sceneeditor/export', this._onExport);
    core.events.on(this.namespace, 'sceneeditor/state', this._onState);
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._open = false;
    this._tool = 'select';
    this._selectedActorType = null;
    this._selectedObjectId = null;
    this._objects.clear();
    this._undoStack = [];
    this._redoStack = [];
  }

  // ---------------------------------------------------------------------------
  // Editor control handlers
  // ---------------------------------------------------------------------------

  private readonly _onOpen = (_p: SceneEditorOpenParams): void => {
    if (this._open) return;
    this._open = true;
    this._core?.events.emitSync('sceneeditor/opened', {});
  };

  private readonly _onClose = (_p: SceneEditorCloseParams): void => {
    if (!this._open) return;
    this._open = false;
    this._core?.events.emitSync('sceneeditor/closed', {});
  };

  private readonly _onToolSet = (p: SceneEditorToolSetParams): void => {
    this._tool = p.tool;
  };

  private readonly _onActorTypeSelect = (p: SceneEditorActorTypeSelectParams): void => {
    this._selectedActorType = p.actorType;
  };

  private readonly _onObjectPlace = (
    p: SceneEditorObjectPlaceParams,
    output: SceneEditorObjectPlaceOutput,
  ): void => {
    if (!this._open) return;

    const newObj: ScenePlacedObject = {
      id: p.id ?? `obj_${this._idCounter++}`,
      actorType: this._selectedActorType ?? '',
      x: p.x,
      y: p.y,
      properties: p.properties ?? {},
    };

    this._objects.set(newObj.id, newObj);
    this._pushCommand({ edits: [{ type: 'add', prev: null, next: newObj }] });
    this._redoStack = [];
    this._core?.events.emitSync('sceneeditor/objects:changed', { objects: this._getObjectsArray() });
    output.object = newObj;
  };

  private readonly _onObjectSelect = (p: SceneEditorObjectSelectParams): void => {
    this._selectedObjectId = p.id;
  };

  private readonly _onObjectMove = (p: SceneEditorObjectMoveParams): void => {
    const existing = this._objects.get(p.id);
    if (!existing) return;

    const moved: ScenePlacedObject = { ...existing, x: p.x, y: p.y };
    this._objects.set(p.id, moved);
    this._pushCommand({ edits: [{ type: 'move', prev: existing, next: moved }] });
    this._redoStack = [];
    this._core?.events.emitSync('sceneeditor/objects:changed', { objects: this._getObjectsArray() });
  };

  private readonly _onObjectRemove = (p: SceneEditorObjectRemoveParams): void => {
    const existing = this._objects.get(p.id);
    if (!existing) return;

    this._objects.delete(p.id);
    this._pushCommand({ edits: [{ type: 'remove', prev: existing, next: null }] });
    this._redoStack = [];
    if (this._selectedObjectId === p.id) this._selectedObjectId = null;
    this._core?.events.emitSync('sceneeditor/objects:changed', { objects: this._getObjectsArray() });
  };

  private readonly _onUndo = (_p: SceneEditorUndoParams): void => {
    const cmd = this._undoStack.pop();
    if (!cmd) return;

    const reversed = [...cmd.edits].reverse();
    for (const edit of reversed) {
      if (edit.type === 'add') {
        if (edit.next) this._objects.delete(edit.next.id);
      } else if (edit.type === 'remove') {
        if (edit.prev) this._objects.set(edit.prev.id, edit.prev);
      } else if (edit.type === 'move') {
        if (edit.prev) this._objects.set(edit.prev.id, edit.prev);
      }
    }
    this._redoStack.push(cmd);
    this._core?.events.emitSync('sceneeditor/objects:changed', { objects: this._getObjectsArray() });
  };

  private readonly _onRedo = (_p: SceneEditorRedoParams): void => {
    const cmd = this._redoStack.pop();
    if (!cmd) return;

    for (const edit of cmd.edits) {
      if (edit.type === 'add') {
        if (edit.next) this._objects.set(edit.next.id, edit.next);
      } else if (edit.type === 'remove') {
        if (edit.prev) this._objects.delete(edit.prev.id);
      } else if (edit.type === 'move') {
        if (edit.next) this._objects.set(edit.next.id, edit.next);
      }
    }
    this._undoStack.push(cmd);
    this._core?.events.emitSync('sceneeditor/objects:changed', { objects: this._getObjectsArray() });
  };

  private readonly _onExport = (_p: unknown, output: SceneEditorExportOutput): void => {
    const objects = this._getObjectsArray();
    output.objects = objects;
    output.tiledObjectLayer = {
      type: 'objectgroup',
      name: EXPORT_LAYER_NAME,
      objects: objects.map((obj, index) => ({
        id: index + 1,
        name: obj.id,
        type: obj.actorType,
        x: obj.x,
        y: obj.y,
        properties: Object.entries(obj.properties).map(([name, value]) => ({
          name,
          type: 'string' as const,
          value: String(value),
        })),
      })),
    };
  };

  private readonly _onState = (_p: unknown, output: SceneEditorStateOutput): void => {
    output.open = this._open;
    output.tool = this._tool;
    output.selectedActorType = this._selectedActorType;
    output.selectedObjectId = this._selectedObjectId;
    output.canUndo = this._undoStack.length > 0;
    output.canRedo = this._redoStack.length > 0;
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _getObjectsArray(): ScenePlacedObject[] {
    return Array.from(this._objects.values());
  }

  private _pushCommand(cmd: SceneEditorCommand): void {
    this._undoStack.push(cmd);
    if (this._undoStack.length > MAX_UNDO_HISTORY) {
      this._undoStack.shift();
    }
  }
}
