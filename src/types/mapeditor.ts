import type { TilemapData } from './tilemap.js';

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

/**
 * The active drawing / selection tool in the tilemap editor.
 *
 * | Value         | Behaviour                                                        |
 * |---------------|------------------------------------------------------------------|
 * | `'paint'`     | Place the selected tile on pointer-down and pointer-drag.        |
 * | `'erase'`     | Clear cells (set tile ID to `0`) on pointer-down and drag.       |
 * | `'fill'`      | BFS flood-fill all connected cells sharing the target tile ID.   |
 * | `'rect-fill'` | Fill a rectangular region from drag-start to drag-end.           |
 * | `'rect-select'` | Select a rectangular region; supports copy / paste.            |
 */
export type MapEditorTool = 'paint' | 'erase' | 'fill' | 'rect-fill' | 'rect-select';

// ---------------------------------------------------------------------------
// Command (used internally for undo/redo)
// ---------------------------------------------------------------------------

/** A single atomic tile-change recorded for undo/redo. */
export interface MapEditorTileEdit {
  layerIndex: number;
  col: number;
  row: number;
  prevTileId: number;
  nextTileId: number;
}

/**
 * A composite command groups one or more {@link MapEditorTileEdit}s into a
 * single undoable action (e.g. a rect-fill or flood-fill).
 */
export interface MapEditorCommand {
  edits: MapEditorTileEdit[];
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/** Params for `mapeditor/open`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MapEditorOpenParams {}

/** Params for `mapeditor/close`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MapEditorCloseParams {}

/** Params for `mapeditor/tool:set`. */
export interface MapEditorToolSetParams {
  /** The tool to activate. */
  tool: MapEditorTool;
}

/** Params for `mapeditor/tile:select`. */
export interface MapEditorTileSelectParams {
  /** Global tile ID to use as the paint / fill tile. Use `0` to select "empty". */
  tileId: number;
}

/** Params for `mapeditor/layer:select`. */
export interface MapEditorLayerSelectParams {
  /** Zero-based index of the layer to make active for editing. */
  layerIndex: number;
}

/** Output for `mapeditor/export`. */
export interface MapEditorExportOutput {
  /**
   * A deep copy of the current {@link TilemapData}.
   *
   * The layer `data` arrays are cloned so subsequent edits do not mutate the
   * exported snapshot.
   */
  mapData: TilemapData;
}

/** Params for `mapeditor/undo`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MapEditorUndoParams {}

/** Params for `mapeditor/redo`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MapEditorRedoParams {}

/** Output for `mapeditor/state` (pull query). */
export interface MapEditorStateOutput {
  /** Whether the editor is currently open / active. */
  open: boolean;
  /** Currently active drawing tool. */
  tool: MapEditorTool;
  /** Global tile ID selected in the palette. */
  selectedTileId: number;
  /** Zero-based index of the currently active layer. */
  activeLayerIndex: number;
  /** Whether there are commands available to undo. */
  canUndo: boolean;
  /** Whether there are commands available to redo. */
  canRedo: boolean;
}

// ---------------------------------------------------------------------------
// Notification params
// ---------------------------------------------------------------------------

/** Notification emitted when the editor is opened. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MapEditorOpenedParams {}

/** Notification emitted when the editor is closed. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MapEditorClosedParams {}

/**
 * Notification emitted after one or more tiles are changed by editor tools.
 *
 * Batches all edits from a single pointer gesture or fill operation so that
 * listeners can refresh overlays or external state without per-cell overhead.
 */
export interface MapEditorTilesChangedParams {
  /** Every tile edit performed in the current command. */
  edits: MapEditorTileEdit[];
}
