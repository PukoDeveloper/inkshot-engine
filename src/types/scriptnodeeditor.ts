import type { ScriptDef } from './script.js';

// A node in the visual graph
export interface ScriptEditorNode {
  id: string;          // unique node ID in the editor
  cmd: string;         // ScriptManager command name
  x: number;           // visual canvas position
  y: number;           // visual canvas position
  data: Record<string, unknown>; // command-specific fields (excluding cmd)
  nextId: string | null; // flow connection to the next node (null = end of chain)
}

// Command for undo/redo
export type ScriptEditorEditType = 'addNode' | 'removeNode' | 'updateNode' | 'connect';
export interface ScriptEditorEdit {
  type: ScriptEditorEditType;
  prev: ScriptEditorNode | null;
  next: ScriptEditorNode | null;
}
export interface ScriptEditorCommand {
  edits: ScriptEditorEdit[];
}

// Event params / outputs
export interface ScriptNodeEditorOpenParams {
  /** Optional script ID to pre-populate the editor with an existing ScriptDef. */
  scriptId?: string;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ScriptNodeEditorCloseParams {}
export interface ScriptNodeEditorNodeAddParams {
  cmd: string;
  x?: number;
  y?: number;
  data?: Record<string, unknown>;
  id?: string;
}
export interface ScriptNodeEditorNodeAddOutput { node: ScriptEditorNode; }
export interface ScriptNodeEditorNodeUpdateParams {
  id: string;
  cmd?: string;
  x?: number;
  y?: number;
  data?: Record<string, unknown>;
}
export interface ScriptNodeEditorNodeRemoveParams { id: string; }
export interface ScriptNodeEditorConnectParams {
  /** The source node ID. */
  fromId: string;
  /** The target node ID, or `null` to disconnect. */
  toId: string | null;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ScriptNodeEditorUndoParams {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ScriptNodeEditorRedoParams {}
export interface ScriptNodeEditorExportOutput {
  /** The compiled ScriptDef. `null` when the editor has no nodes. */
  script: ScriptDef | null;
}
export interface ScriptNodeEditorCompileParams {
  /** The script ID to assign to the compiled ScriptDef. */
  scriptId: string;
}
export interface ScriptNodeEditorStateOutput {
  open: boolean;
  scriptId: string | null;
  nodes: ScriptEditorNode[];
  canUndo: boolean;
  canRedo: boolean;
}
// Notifications
export interface ScriptNodeEditorOpenedParams { scriptId: string | null; }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ScriptNodeEditorClosedParams {}
export interface ScriptNodeEditorNodesChangedParams { nodes: ScriptEditorNode[]; }
