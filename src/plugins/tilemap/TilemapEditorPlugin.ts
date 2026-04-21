import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { TilemapData } from '../../types/tilemap.js';
import type {
  InputPointerDownParams,
  InputPointerUpParams,
  InputPointerMoveParams,
  InputKeyDownParams,
} from '../../types/input.js';
import type { CameraStateOutput } from '../../types/rendering.js';
import type {
  MapEditorTool,
  MapEditorCommand,
  MapEditorTileEdit,
  MapEditorOpenParams,
  MapEditorCloseParams,
  MapEditorToolSetParams,
  MapEditorTileSelectParams,
  MapEditorLayerSelectParams,
  MapEditorExportOutput,
  MapEditorUndoParams,
  MapEditorRedoParams,
  MapEditorStateOutput,
} from '../../types/mapeditor.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of commands kept in the undo history. */
const MAX_UNDO_HISTORY = 100;

// ---------------------------------------------------------------------------
// TilemapEditorPlugin
// ---------------------------------------------------------------------------

/**
 * In-engine tilemap editor plugin.
 *
 * Provides a complete tile-editing workflow driven exclusively through the
 * {@link EventBus} and existing engine plugins — no core modifications needed.
 *
 * ### Features
 * - **Pencil** — paint the selected tile on pointer-down and pointer-drag.
 * - **Eraser** — clear cells on pointer-down and pointer-drag.
 * - **Flood Fill** — BFS bucket fill replacing all connected cells that share
 *   the target tile ID.
 * - **Rect Fill** — fill a rectangular region from drag-start to drag-end.
 * - **Rect Select** — select a rectangular region; supports copy and paste.
 * - **Undo / Redo** — full command-stack with configurable history depth.
 *   Batched operations (Rect Fill, Flood Fill) are a single undoable command.
 * - **Export** — snapshot the current `TilemapData` as a deep-cloned object
 *   ready for serialisation.
 * - **Camera awareness** — pointer coordinates are converted from canvas space
 *   to world space using the camera state when a `camera` plugin is present.
 *
 * ### EventBus API
 *
 * | Event                     | Params / Output                         |
 * |---------------------------|-----------------------------------------|
 * | `mapeditor/open`          | `MapEditorOpenParams`                   |
 * | `mapeditor/close`         | `MapEditorCloseParams`                  |
 * | `mapeditor/tool:set`      | `MapEditorToolSetParams`                |
 * | `mapeditor/tile:select`   | `MapEditorTileSelectParams`             |
 * | `mapeditor/layer:select`  | `MapEditorLayerSelectParams`            |
 * | `mapeditor/undo`          | `MapEditorUndoParams`                   |
 * | `mapeditor/redo`          | `MapEditorRedoParams`                   |
 * | `mapeditor/export`        | `{} → MapEditorExportOutput`            |
 * | `mapeditor/state`         | `{} → MapEditorStateOutput`             |
 * | `mapeditor/opened`        | `MapEditorOpenedParams` (notification)  |
 * | `mapeditor/closed`        | `MapEditorClosedParams` (notification)  |
 * | `mapeditor/tiles:changed` | `MapEditorTilesChangedParams` (notify)  |
 *
 * ### Keyboard shortcuts (active while editor is open)
 * | Keys         | Action                     |
 * |--------------|----------------------------|
 * | `KeyZ` + Ctrl | Undo                      |
 * | `KeyY` + Ctrl | Redo                      |
 *
 * @example
 * ```ts
 * import { createEngine, TilemapManager, InputManager, TilemapEditorPlugin } from '@inkshot/engine';
 *
 * const { core } = await createEngine({
 *   plugins: [new TilemapManager(), new InputManager(), new TilemapEditorPlugin()],
 * });
 *
 * // Load a tilemap first, then:
 * core.events.emitSync('mapeditor/open', {});
 * core.events.emitSync('mapeditor/tool:set', { tool: 'paint' });
 * core.events.emitSync('mapeditor/tile:select', { tileId: 3 });
 * ```
 */
export class TilemapEditorPlugin implements EnginePlugin {
  readonly namespace = 'mapeditor';
  readonly dependencies = ['tilemap', 'input'] as const;

  // ── Editor state ───────────────────────────────────────────────────────────

  private _core: Core | null = null;

  private _open = false;
  private _tool: MapEditorTool = 'paint';
  private _selectedTileId = 1;
  private _activeLayerIndex = 0;

  // ── Pointer drag state ────────────────────────────────────────────────────

  private _isPointerDown = false;

  /** Canvas-space coordinates where the current drag started. */
  private _dragStartCanvas: { x: number; y: number } | null = null;

  /**
   * Tile coordinates where the current drag started.
   * Used for rect-fill / rect-select tools.
   */
  private _dragStartTile: { col: number; row: number } | null = null;

  /**
   * Set of tile coordinate keys (`"col:row"`) that have already been painted
   * in the current stroke.  Prevents redundant `setTile` calls when the
   * pointer lingers over the same cell.
   */
  private _paintedThisStroke: Set<string> = new Set();

  /** Edits accumulated during the current pointer stroke. */
  private _currentStrokeEdits: MapEditorTileEdit[] = [];

  // ── Rect-select clipboard ─────────────────────────────────────────────────

  private _clipboard: { cols: number; rows: number; data: number[] } | null = null;

  // ── Undo / redo stacks ────────────────────────────────────────────────────

  private _undoStack: MapEditorCommand[] = [];
  private _redoStack: MapEditorCommand[] = [];

  // ── TilemapManager reference (obtained via tilemap/get-tile on init) ──────

  /** Cached tilemap data snapshot refreshed on tilemap/loaded. */
  private _mapData: TilemapData | null = null;

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    // Cache map data whenever a tilemap is loaded / unloaded
    core.events.on(this.namespace, 'tilemap/loaded', this._onTilemapLoaded);
    core.events.on(this.namespace, 'tilemap/unloaded', this._onTilemapUnloaded);

    // Editor control events
    core.events.on(this.namespace, 'mapeditor/open', this._onOpen);
    core.events.on(this.namespace, 'mapeditor/close', this._onClose);
    core.events.on(this.namespace, 'mapeditor/tool:set', this._onToolSet);
    core.events.on(this.namespace, 'mapeditor/tile:select', this._onTileSelect);
    core.events.on(this.namespace, 'mapeditor/layer:select', this._onLayerSelect);
    core.events.on(this.namespace, 'mapeditor/undo', this._onUndo);
    core.events.on(this.namespace, 'mapeditor/redo', this._onRedo);
    core.events.on(this.namespace, 'mapeditor/export', this._onExport);
    core.events.on(this.namespace, 'mapeditor/state', this._onState);

    // Input events (handled only when editor is open)
    core.events.on(this.namespace, 'input/pointer:down', this._onPointerDown);
    core.events.on(this.namespace, 'input/pointer:up', this._onPointerUp);
    core.events.on(this.namespace, 'input/pointer:move', this._onPointerMove);
    core.events.on(this.namespace, 'input/key:down', this._onKeyDown);
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._mapData = null;
    this._undoStack = [];
    this._redoStack = [];
  }

  // ---------------------------------------------------------------------------
  // Public direct API
  // ---------------------------------------------------------------------------

  /** Open the editor programmatically. */
  open(): void {
    this._doOpen();
  }

  /** Close the editor programmatically. */
  close(): void {
    this._doClose();
  }

  /** Set the active tool. */
  setTool(tool: MapEditorTool): void {
    this._tool = tool;
  }

  /** Select a tile ID for painting. */
  selectTile(tileId: number): void {
    this._selectedTileId = tileId;
  }

  /** Select a layer by index. */
  selectLayer(layerIndex: number): void {
    this._activeLayerIndex = layerIndex;
  }

  /** Undo the most recent command. Returns `true` if something was undone. */
  undo(): boolean {
    return this._doUndo();
  }

  /** Redo the most recently undone command. Returns `true` if something was redone. */
  redo(): boolean {
    return this._doRedo();
  }

  /**
   * Export the current tilemap data as a deep clone.
   * Returns `null` when no map is loaded.
   */
  exportMapData(): TilemapData | null {
    return this._mapData ? this._cloneMapData(this._mapData) : null;
  }

  // ---------------------------------------------------------------------------
  // Tilemap lifecycle listeners
  // ---------------------------------------------------------------------------

  private readonly _onTilemapLoaded = (params: { mapData: TilemapData }): void => {
    this._mapData = params.mapData;
    // Reset layer selection to stay in bounds
    this._activeLayerIndex = 0;
    // Clear undo history — it no longer applies to the new map
    this._undoStack = [];
    this._redoStack = [];
    this._clipboard = null;
  };

  private readonly _onTilemapUnloaded = (): void => {
    this._mapData = null;
    this._undoStack = [];
    this._redoStack = [];
    this._clipboard = null;
  };

  // ---------------------------------------------------------------------------
  // Editor control handlers
  // ---------------------------------------------------------------------------

  private readonly _onOpen = (_p: MapEditorOpenParams): void => { this._doOpen(); };
  private readonly _onClose = (_p: MapEditorCloseParams): void => { this._doClose(); };

  private readonly _onToolSet = (params: MapEditorToolSetParams): void => {
    this._tool = params.tool;
  };

  private readonly _onTileSelect = (params: MapEditorTileSelectParams): void => {
    this._selectedTileId = params.tileId;
  };

  private readonly _onLayerSelect = (params: MapEditorLayerSelectParams): void => {
    this._activeLayerIndex = params.layerIndex;
  };

  private readonly _onUndo = (_p: MapEditorUndoParams): void => { this._doUndo(); };
  private readonly _onRedo = (_p: MapEditorRedoParams): void => { this._doRedo(); };

  private readonly _onExport = (_p: unknown, output: MapEditorExportOutput): void => {
    const clone = this.exportMapData();
    if (clone) output.mapData = clone;
  };

  private readonly _onState = (_p: unknown, output: MapEditorStateOutput): void => {
    output.open = this._open;
    output.tool = this._tool;
    output.selectedTileId = this._selectedTileId;
    output.activeLayerIndex = this._activeLayerIndex;
    output.canUndo = this._undoStack.length > 0;
    output.canRedo = this._redoStack.length > 0;
  };

  // ---------------------------------------------------------------------------
  // Pointer handlers
  // ---------------------------------------------------------------------------

  private readonly _onPointerDown = (params: InputPointerDownParams): void => {
    if (!this._open || !this._mapData || params.button !== 0) return;

    this._isPointerDown = true;
    this._dragStartCanvas = { x: params.x, y: params.y };
    this._paintedThisStroke.clear();
    this._currentStrokeEdits = [];

    const tile = this._canvasToTile(params.x, params.y);
    if (!tile) return;

    this._dragStartTile = tile;

    // Single-click tools: apply immediately on pointer-down
    switch (this._tool) {
      case 'paint':
        this._applyPaint(tile.col, tile.row, this._selectedTileId);
        break;
      case 'erase':
        this._applyPaint(tile.col, tile.row, 0);
        break;
      case 'fill':
        this._applyFloodFill(tile.col, tile.row, this._selectedTileId);
        break;
      // rect-fill and rect-select are committed on pointer-up
    }
  };

  private readonly _onPointerMove = (params: InputPointerMoveParams): void => {
    if (!this._open || !this._isPointerDown || !this._mapData) return;

    const tile = this._canvasToTile(params.x, params.y);
    if (!tile) return;

    // Drag tools: continue painting as the pointer moves
    switch (this._tool) {
      case 'paint':
        this._applyPaint(tile.col, tile.row, this._selectedTileId);
        break;
      case 'erase':
        this._applyPaint(tile.col, tile.row, 0);
        break;
      // fill / rect-fill / rect-select: committed on pointer-up, nothing to do here
    }
  };

  private readonly _onPointerUp = (params: InputPointerUpParams): void => {
    if (!this._open || !this._mapData || params.button !== 0) return;

    const tile = this._canvasToTile(params.x, params.y);

    if (tile && this._dragStartTile) {
      switch (this._tool) {
        case 'rect-fill':
          this._applyRectFill(
            this._dragStartTile.col,
            this._dragStartTile.row,
            tile.col,
            tile.row,
            this._selectedTileId,
          );
          break;
        case 'rect-select':
          this._applyRectSelect(
            this._dragStartTile.col,
            this._dragStartTile.row,
            tile.col,
            tile.row,
          );
          break;
      }
    }

    // Commit the stroke as a single undo command
    if (this._currentStrokeEdits.length > 0) {
      const edits = [...this._currentStrokeEdits];
      this._pushCommand({ edits });
      this._core?.events.emitSync('mapeditor/tiles:changed', { edits });
    }

    this._isPointerDown = false;
    this._dragStartCanvas = null;
    this._dragStartTile = null;
    this._paintedThisStroke.clear();
    this._currentStrokeEdits = [];
  };

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  private readonly _onKeyDown = (params: InputKeyDownParams): void => {
    if (!this._open) return;
    if (params.code === 'KeyZ' && this._isCtrlHeld()) this._doUndo();
    if (params.code === 'KeyY' && this._isCtrlHeld()) this._doRedo();
  };

  // ---------------------------------------------------------------------------
  // Tool implementations
  // ---------------------------------------------------------------------------

  /**
   * Paint a single tile cell — records an edit only if the tile actually changes
   * and the cell hasn't been painted yet in this stroke.
   */
  private _applyPaint(col: number, row: number, tileId: number): void {
    const key = `${col}:${row}`;
    if (this._paintedThisStroke.has(key)) return;
    this._paintedThisStroke.add(key);

    const prevId = this._getTile(this._activeLayerIndex, col, row);
    if (prevId === tileId) return;

    this._setTile(this._activeLayerIndex, col, row, tileId);
    this._currentStrokeEdits.push({
      layerIndex: this._activeLayerIndex,
      col,
      row,
      prevTileId: prevId,
      nextTileId: tileId,
    });
  }

  /**
   * BFS flood-fill: replace all contiguous cells at `(col, row)` that share
   * the same tile ID with `fillTileId`.
   */
  private _applyFloodFill(col: number, row: number, fillTileId: number): void {
    if (!this._mapData) return;

    const targetId = this._getTile(this._activeLayerIndex, col, row);
    if (targetId === fillTileId) return; // already the desired colour

    const { mapWidth, mapHeight } = this._mapData;
    const edits: MapEditorTileEdit[] = [];
    const visited = new Set<number>();
    const queue: [number, number][] = [[col, row]];

    while (queue.length > 0) {
      const entry = queue.shift()!;
      const c = entry[0];
      const r = entry[1];

      if (c < 0 || c >= mapWidth || r < 0 || r >= mapHeight) continue;
      const idx = r * mapWidth + c;
      if (visited.has(idx)) continue;
      visited.add(idx);

      if (this._getTile(this._activeLayerIndex, c, r) !== targetId) continue;

      this._setTile(this._activeLayerIndex, c, r, fillTileId);
      edits.push({
        layerIndex: this._activeLayerIndex,
        col: c,
        row: r,
        prevTileId: targetId,
        nextTileId: fillTileId,
      });

      queue.push([c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]);
    }

    if (edits.length > 0) {
      this._currentStrokeEdits.push(...edits);
    }
  }

  /**
   * Fill every cell in the rectangle defined by the two corner tile coordinates
   * with `fillTileId`.
   */
  private _applyRectFill(
    col1: number,
    row1: number,
    col2: number,
    row2: number,
    fillTileId: number,
  ): void {
    if (!this._mapData) return;

    const minCol = Math.max(0, Math.min(col1, col2));
    const maxCol = Math.min(this._mapData.mapWidth - 1, Math.max(col1, col2));
    const minRow = Math.max(0, Math.min(row1, row2));
    const maxRow = Math.min(this._mapData.mapHeight - 1, Math.max(row1, row2));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const prevId = this._getTile(this._activeLayerIndex, c, r);
        if (prevId === fillTileId) continue;
        this._setTile(this._activeLayerIndex, c, r, fillTileId);
        this._currentStrokeEdits.push({
          layerIndex: this._activeLayerIndex,
          col: c,
          row: r,
          prevTileId: prevId,
          nextTileId: fillTileId,
        });
      }
    }
  }

  /**
   * Copy the rectangular region into the clipboard.
   * The clipboard can later be pasted via `mapeditor/paste`.
   */
  private _applyRectSelect(
    col1: number,
    row1: number,
    col2: number,
    row2: number,
  ): void {
    if (!this._mapData) return;

    const minCol = Math.max(0, Math.min(col1, col2));
    const maxCol = Math.min(this._mapData.mapWidth - 1, Math.max(col1, col2));
    const minRow = Math.max(0, Math.min(row1, row2));
    const maxRow = Math.min(this._mapData.mapHeight - 1, Math.max(row1, row2));

    const cols = maxCol - minCol + 1;
    const rows = maxRow - minRow + 1;
    const data: number[] = [];

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        data.push(this._getTile(this._activeLayerIndex, c, r));
      }
    }

    this._clipboard = { cols, rows, data };
  }

  /**
   * Paste the clipboard contents starting at the given tile coordinate.
   * Each pasted cell is recorded as an individual edit in the current command.
   */
  pasteAt(col: number, row: number): void {
    if (!this._mapData || !this._clipboard) return;

    const { cols, rows, data } = this._clipboard;
    const edits: MapEditorTileEdit[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const destCol = col + c;
        const destRow = row + r;
        const tileId = data[r * cols + c] ?? 0;
        const prevId = this._getTile(this._activeLayerIndex, destCol, destRow);
        if (prevId === tileId) continue;
        this._setTile(this._activeLayerIndex, destCol, destRow, tileId);
        edits.push({
          layerIndex: this._activeLayerIndex,
          col: destCol,
          row: destRow,
          prevTileId: prevId,
          nextTileId: tileId,
        });
      }
    }

    if (edits.length > 0) {
      this._pushCommand({ edits });
      this._core?.events.emitSync('mapeditor/tiles:changed', { edits });
    }
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  private _doUndo(): boolean {
    const cmd = this._undoStack.pop();
    if (!cmd) return false;

    // Apply edits in reverse order
    for (let i = cmd.edits.length - 1; i >= 0; i--) {
      const edit = cmd.edits[i]!;
      this._setTile(edit.layerIndex, edit.col, edit.row, edit.prevTileId);
    }

    this._redoStack.push(cmd);
    this._core?.events.emitSync('mapeditor/tiles:changed', { edits: cmd.edits });
    return true;
  }

  private _doRedo(): boolean {
    const cmd = this._redoStack.pop();
    if (!cmd) return false;

    for (const edit of cmd.edits) {
      this._setTile(edit.layerIndex, edit.col, edit.row, edit.nextTileId);
    }

    this._undoStack.push(cmd);
    this._core?.events.emitSync('mapeditor/tiles:changed', { edits: cmd.edits });
    return true;
  }

  /**
   * Push a command onto the undo stack, capping the stack at
   * {@link MAX_UNDO_HISTORY} entries.  Clears the redo stack on every new
   * user action.
   */
  private _pushCommand(cmd: MapEditorCommand): void {
    this._redoStack = [];
    this._undoStack.push(cmd);
    if (this._undoStack.length > MAX_UNDO_HISTORY) {
      this._undoStack.shift();
    }
  }

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert canvas (viewport) coordinates to tile grid coordinates.
   *
   * When a camera is available (`camera/state` returns valid data), the
   * conversion accounts for camera position, zoom.  Otherwise, canvas
   * coordinates are treated directly as world coordinates.
   *
   * Returns `null` when no map is loaded or the coordinates are out of bounds.
   */
  private _canvasToTile(canvasX: number, canvasY: number): { col: number; row: number } | null {
    if (!this._mapData) return null;

    let worldX = canvasX;
    let worldY = canvasY;

    // Try to obtain camera state for world-space conversion
    const camResult = this._core?.events.emitSync<unknown, CameraStateOutput>(
      'camera/state',
      {},
    );

    const camOutput = camResult?.output as CameraStateOutput | undefined;
    if (
      camOutput &&
      typeof camOutput.x === 'number' &&
      typeof camOutput.zoom === 'number' &&
      camOutput.zoom > 0 &&
      typeof camOutput.viewportWidth === 'number' &&
      typeof camOutput.viewportHeight === 'number'
    ) {
      const vpW = camOutput.viewportWidth;
      const vpH = camOutput.viewportHeight;
      worldX = (canvasX - vpW / 2) / camOutput.zoom + camOutput.x;
      worldY = (canvasY - vpH / 2) / camOutput.zoom + camOutput.y;
    }

    const col = Math.floor(worldX / this._mapData.tileWidth);
    const row = Math.floor(worldY / this._mapData.tileHeight);

    if (
      col < 0 ||
      col >= this._mapData.mapWidth ||
      row < 0 ||
      row >= this._mapData.mapHeight
    ) {
      return null;
    }

    return { col, row };
  }

  // ---------------------------------------------------------------------------
  // Tilemap bridge helpers
  // ---------------------------------------------------------------------------

  private _getTile(layerIndex: number, col: number, row: number): number {
    const result = this._core?.events.emitSync<
      { layerIndex: number; col: number; row: number },
      { tileId: number }
    >('tilemap/get-tile', { layerIndex, col, row });
    return result?.output?.tileId ?? 0;
  }

  private _setTile(layerIndex: number, col: number, row: number, tileId: number): void {
    this._core?.events.emitSync('tilemap/set-tile', { layerIndex, col, row, tileId });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _doOpen(): void {
    if (this._open) return;
    this._open = true;
    this._core?.events.emitSync('mapeditor/opened', {});
  }

  private _doClose(): void {
    if (!this._open) return;
    // Finalise any incomplete stroke
    if (this._currentStrokeEdits.length > 0) {
      this._pushCommand({ edits: [...this._currentStrokeEdits] });
      this._currentStrokeEdits = [];
    }
    this._isPointerDown = false;
    this._dragStartCanvas = null;
    this._dragStartTile = null;
    this._paintedThisStroke.clear();
    this._open = false;
    this._core?.events.emitSync('mapeditor/closed', {});
  }

  /** Returns `true` when either Control key is currently held. */
  private _isCtrlHeld(): boolean {
    const result = this._core?.events.emitSync<{ code: string }, { pressed: boolean }>(
      'input/key:pressed',
      { code: 'ControlLeft' },
    );
    if (result?.output?.pressed) return true;
    const result2 = this._core?.events.emitSync<{ code: string }, { pressed: boolean }>(
      'input/key:pressed',
      { code: 'ControlRight' },
    );
    return result2?.output?.pressed === true;
  }

  /** Deep-clone a `TilemapData` so exported data is not mutated by later edits. */
  private _cloneMapData(data: TilemapData): TilemapData {
    return {
      ...data,
      tilesets: data.tilesets.map((ts) => ({ ...ts })),
      layers: data.layers.map((layer) => ({
        ...layer,
        data: [...layer.data],
      })),
      autotileGroups: data.autotileGroups?.map((g) => ({
        ...g,
        memberTileIds: [...g.memberTileIds],
        tileMap: { ...g.tileMap },
      })),
    };
  }
}
