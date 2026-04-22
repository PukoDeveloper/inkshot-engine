// Tool types
export type SceneEditorTool = 'place' | 'select' | 'move' | 'erase';

// A single placed object in the scene
export interface ScenePlacedObject {
  id: string;         // unique placement ID (e.g. uuid or auto-generated)
  actorType: string;  // matches ActorDef.id
  x: number;         // world X position
  y: number;         // world Y position
  properties: Record<string, unknown>; // optional custom props
}

// Command for undo/redo
export interface SceneEditorObjectEdit {
  type: 'add' | 'remove' | 'move';
  prev: ScenePlacedObject | null;
  next: ScenePlacedObject | null;
}
export interface SceneEditorCommand {
  edits: SceneEditorObjectEdit[];
}

// Event params
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SceneEditorOpenParams {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SceneEditorCloseParams {}
export interface SceneEditorToolSetParams { tool: SceneEditorTool; }
export interface SceneEditorActorTypeSelectParams { actorType: string; }
export interface SceneEditorObjectPlaceParams { x: number; y: number; id?: string; properties?: Record<string, unknown>; }
export interface SceneEditorObjectPlaceOutput { object: ScenePlacedObject; }
export interface SceneEditorObjectSelectParams { id: string | null; }
export interface SceneEditorObjectMoveParams { id: string; x: number; y: number; }
export interface SceneEditorObjectRemoveParams { id: string; }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SceneEditorUndoParams {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SceneEditorRedoParams {}
export interface SceneEditorExportOutput {
  objects: ScenePlacedObject[];
  /** Tiled-compatible object layer representation */
  tiledObjectLayer: {
    type: 'objectgroup';
    name: string;
    objects: Array<{
      id: number;
      name: string;
      type: string;
      x: number;
      y: number;
      properties: Array<{ name: string; type: 'string'; value: string }>;
    }>;
  };
}
export interface SceneEditorStateOutput {
  open: boolean;
  tool: SceneEditorTool;
  selectedActorType: string | null;
  selectedObjectId: string | null;
  canUndo: boolean;
  canRedo: boolean;
}
// Notifications
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SceneEditorOpenedParams {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SceneEditorClosedParams {}
export interface SceneEditorObjectsChangedParams { objects: ScenePlacedObject[]; }
