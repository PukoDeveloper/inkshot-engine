import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { ScriptDef, ScriptNode } from '../../types/script.js';
import type {
  ScriptEditorNode,
  ScriptEditorCommand,
  ScriptNodeEditorOpenParams,
  ScriptNodeEditorCloseParams,
  ScriptNodeEditorNodeAddParams,
  ScriptNodeEditorNodeAddOutput,
  ScriptNodeEditorNodeUpdateParams,
  ScriptNodeEditorNodeRemoveParams,
  ScriptNodeEditorConnectParams,
  ScriptNodeEditorUndoParams,
  ScriptNodeEditorRedoParams,
  ScriptNodeEditorExportOutput,
  ScriptNodeEditorCompileParams,
  ScriptNodeEditorStateOutput,
} from '../../types/scriptnodeeditor.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_UNDO_HISTORY = 100;

// ---------------------------------------------------------------------------
// ScriptNodeEditorPlugin
// ---------------------------------------------------------------------------

/**
 * In-engine script node editor plugin.
 *
 * Provides a visual node-graph workflow for authoring scripts driven
 * exclusively through the {@link EventBus}.
 *
 * ### EventBus API
 *
 * | Event                               | Params / Output                              |
 * |-------------------------------------|----------------------------------------------|
 * | `scriptnodeeditor/open`             | `ScriptNodeEditorOpenParams`                 |
 * | `scriptnodeeditor/close`            | `ScriptNodeEditorCloseParams`                |
 * | `scriptnodeeditor/node:add`         | `ScriptNodeEditorNodeAddParams → Output`     |
 * | `scriptnodeeditor/node:update`      | `ScriptNodeEditorNodeUpdateParams`           |
 * | `scriptnodeeditor/node:remove`      | `ScriptNodeEditorNodeRemoveParams`           |
 * | `scriptnodeeditor/node:connect`     | `ScriptNodeEditorConnectParams`              |
 * | `scriptnodeeditor/undo`             | `ScriptNodeEditorUndoParams`                 |
 * | `scriptnodeeditor/redo`             | `ScriptNodeEditorRedoParams`                 |
 * | `scriptnodeeditor/export`           | `{} → ScriptNodeEditorExportOutput`          |
 * | `scriptnodeeditor/compile`          | `ScriptNodeEditorCompileParams`              |
 * | `scriptnodeeditor/state`            | `{} → ScriptNodeEditorStateOutput`           |
 * | `scriptnodeeditor/opened`           | `ScriptNodeEditorOpenedParams` (notify)      |
 * | `scriptnodeeditor/closed`           | `ScriptNodeEditorClosedParams` (notify)      |
 * | `scriptnodeeditor/nodes:changed`    | `ScriptNodeEditorNodesChangedParams` (notify)|
 */
export class ScriptNodeEditorPlugin implements EnginePlugin {
  readonly namespace = 'script-node-editor';
  readonly dependencies = ['script'] as const;
  readonly editorMeta = {
    displayName: 'Script Node Editor',
    icon: 'script-node-editor',
    description: 'Visual node-graph editor for authoring and compiling script definitions.',
    events: [
      'scriptnodeeditor/open', 'scriptnodeeditor/close',
      'scriptnodeeditor/node:add', 'scriptnodeeditor/node:update', 'scriptnodeeditor/node:remove',
      'scriptnodeeditor/node:connect', 'scriptnodeeditor/undo', 'scriptnodeeditor/redo',
      'scriptnodeeditor/export', 'scriptnodeeditor/compile', 'scriptnodeeditor/state',
    ] as const,
    schemas: {
      script: {
        folder: 'scripts',
        displayName: 'Script Definition',
      },
    },
  };

  // ── Editor state ───────────────────────────────────────────────────────────

  private _core: Core | null = null;

  private _open = false;
  private _scriptId: string | null = null;

  // ── Nodes ─────────────────────────────────────────────────────────────────

  private _nodes: Map<string, ScriptEditorNode> = new Map();

  // ── Undo / redo stacks ────────────────────────────────────────────────────

  private _undoStack: ScriptEditorCommand[] = [];
  private _redoStack: ScriptEditorCommand[] = [];

  // ── ID counter ────────────────────────────────────────────────────────────

  private _idCounter = 0;

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    core.events.on(this.namespace, 'scriptnodeeditor/open', this._onOpen);
    core.events.on(this.namespace, 'scriptnodeeditor/close', this._onClose);
    core.events.on(this.namespace, 'scriptnodeeditor/node:add', this._onNodeAdd);
    core.events.on(this.namespace, 'scriptnodeeditor/node:update', this._onNodeUpdate);
    core.events.on(this.namespace, 'scriptnodeeditor/node:remove', this._onNodeRemove);
    core.events.on(this.namespace, 'scriptnodeeditor/node:connect', this._onNodeConnect);
    core.events.on(this.namespace, 'scriptnodeeditor/undo', this._onUndo);
    core.events.on(this.namespace, 'scriptnodeeditor/redo', this._onRedo);
    core.events.on(this.namespace, 'scriptnodeeditor/export', this._onExport);
    core.events.on(this.namespace, 'scriptnodeeditor/compile', this._onCompile);
    core.events.on(this.namespace, 'scriptnodeeditor/state', this._onState);
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._open = false;
    this._scriptId = null;
    this._nodes.clear();
    this._undoStack = [];
    this._redoStack = [];
  }

  // ---------------------------------------------------------------------------
  // Editor control handlers
  // ---------------------------------------------------------------------------

  private readonly _onOpen = (p: ScriptNodeEditorOpenParams): void => {
    this._open = true;
    this._scriptId = p.scriptId ?? null;
    this._core?.events.emitSync('scriptnodeeditor/opened', { scriptId: this._scriptId });
  };

  private readonly _onClose = (_p: ScriptNodeEditorCloseParams): void => {
    this._open = false;
    this._core?.events.emitSync('scriptnodeeditor/closed', {});
  };

  private readonly _onNodeAdd = (
    p: ScriptNodeEditorNodeAddParams,
    output: ScriptNodeEditorNodeAddOutput,
  ): void => {
    const newNode: ScriptEditorNode = {
      id: p.id ?? `node_${this._idCounter++}`,
      cmd: p.cmd,
      x: p.x ?? 0,
      y: p.y ?? 0,
      data: p.data ?? {},
      nextId: null,
    };

    this._nodes.set(newNode.id, newNode);
    this._pushCommand({ edits: [{ type: 'addNode', prev: null, next: newNode }] });
    this._redoStack = [];
    this._core?.events.emitSync('scriptnodeeditor/nodes:changed', { nodes: this._getNodesArray() });
    output.node = newNode;
  };

  private readonly _onNodeUpdate = (p: ScriptNodeEditorNodeUpdateParams): void => {
    const existing = this._nodes.get(p.id);
    if (!existing) return;

    const updated: ScriptEditorNode = {
      ...existing,
      ...(p.cmd !== undefined ? { cmd: p.cmd } : {}),
      ...(p.x !== undefined ? { x: p.x } : {}),
      ...(p.y !== undefined ? { y: p.y } : {}),
      ...(p.data !== undefined ? { data: p.data } : {}),
    };

    this._nodes.set(p.id, updated);
    this._pushCommand({ edits: [{ type: 'updateNode', prev: existing, next: updated }] });
    this._redoStack = [];
    this._core?.events.emitSync('scriptnodeeditor/nodes:changed', { nodes: this._getNodesArray() });
  };

  private readonly _onNodeRemove = (p: ScriptNodeEditorNodeRemoveParams): void => {
    const existing = this._nodes.get(p.id);
    if (!existing) return;

    this._nodes.delete(p.id);

    // Clear any nextId references pointing to this node
    for (const [, node] of this._nodes) {
      if (node.nextId === p.id) {
        this._nodes.set(node.id, { ...node, nextId: null });
      }
    }

    this._pushCommand({ edits: [{ type: 'removeNode', prev: existing, next: null }] });
    this._redoStack = [];
    this._core?.events.emitSync('scriptnodeeditor/nodes:changed', { nodes: this._getNodesArray() });
  };

  private readonly _onNodeConnect = (p: ScriptNodeEditorConnectParams): void => {
    const existing = this._nodes.get(p.fromId);
    if (!existing) return;

    const updated: ScriptEditorNode = { ...existing, nextId: p.toId };
    this._nodes.set(p.fromId, updated);
    this._pushCommand({ edits: [{ type: 'connect', prev: existing, next: updated }] });
    this._redoStack = [];
    this._core?.events.emitSync('scriptnodeeditor/nodes:changed', { nodes: this._getNodesArray() });
  };

  private readonly _onUndo = (_p: ScriptNodeEditorUndoParams): void => {
    const cmd = this._undoStack.pop();
    if (!cmd) return;

    const reversed = [...cmd.edits].reverse();
    for (const edit of reversed) {
      if (edit.type === 'addNode') {
        if (edit.next) this._nodes.delete(edit.next.id);
      } else if (edit.type === 'removeNode') {
        if (edit.prev) this._nodes.set(edit.prev.id, edit.prev);
      } else if (edit.type === 'updateNode' || edit.type === 'connect') {
        if (edit.prev) this._nodes.set(edit.prev.id, edit.prev);
      }
    }
    this._redoStack.push(cmd);
    this._core?.events.emitSync('scriptnodeeditor/nodes:changed', { nodes: this._getNodesArray() });
  };

  private readonly _onRedo = (_p: ScriptNodeEditorRedoParams): void => {
    const cmd = this._redoStack.pop();
    if (!cmd) return;

    for (const edit of cmd.edits) {
      if (edit.type === 'addNode') {
        if (edit.next) this._nodes.set(edit.next.id, edit.next);
      } else if (edit.type === 'removeNode') {
        if (edit.prev) this._nodes.delete(edit.prev.id);
      } else if (edit.type === 'updateNode' || edit.type === 'connect') {
        if (edit.next) this._nodes.set(edit.next.id, edit.next);
      }
    }
    this._undoStack.push(cmd);
    this._core?.events.emitSync('scriptnodeeditor/nodes:changed', { nodes: this._getNodesArray() });
  };

  private readonly _onExport = (_p: unknown, output: ScriptNodeEditorExportOutput): void => {
    output.script = this._nodes.size === 0 ? null : this._compile(this._scriptId ?? 'untitled');
  };

  private readonly _onCompile = (p: ScriptNodeEditorCompileParams): void => {
    const script = this._compile(p.scriptId);
    this._core?.events.emitSync('script/define', { script });
  };

  private readonly _onState = (_p: unknown, output: ScriptNodeEditorStateOutput): void => {
    output.open = this._open;
    output.scriptId = this._scriptId;
    output.nodes = this._getNodesArray();
    output.canUndo = this._undoStack.length > 0;
    output.canRedo = this._redoStack.length > 0;
  };

  // ---------------------------------------------------------------------------
  // Compile algorithm
  // ---------------------------------------------------------------------------

  private _compile(scriptId: string): ScriptDef {
    if (this._nodes.size === 0) return { id: scriptId, nodes: [] };

    // Find all start nodes (not referenced as nextId by any other node)
    const referencedIds = new Set<string>();
    for (const [, node] of this._nodes) {
      if (node.nextId !== null) referencedIds.add(node.nextId);
    }

    const startNodes = Array.from(this._nodes.values()).filter(
      (n) => !referencedIds.has(n.id),
    );

    if (startNodes.length === 0) return { id: scriptId, nodes: [] };

    // Walk from first start node following nextId chains
    const ordered: ScriptNode[] = [];
    const visited = new Set<string>();
    let current: ScriptEditorNode | undefined = startNodes[0];

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const { cmd, data } = current;
      ordered.push({ cmd, ...data });
      current = current.nextId ? this._nodes.get(current.nextId) : undefined;
    }

    return { id: scriptId, nodes: ordered };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _getNodesArray(): ScriptEditorNode[] {
    return Array.from(this._nodes.values());
  }

  private _pushCommand(cmd: ScriptEditorCommand): void {
    this._undoStack.push(cmd);
    if (this._undoStack.length > MAX_UNDO_HISTORY) {
      this._undoStack.shift();
    }
  }
}
