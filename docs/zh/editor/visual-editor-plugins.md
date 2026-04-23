# 可視化場景 / 腳本編輯器插件

本文件說明 `SceneEditorPlugin` 與 `ScriptNodeEditorPlugin` 兩個視覺化編輯器插件的完整 API、使用方式，以及如何與宿主應用程式（Host App，例如 Electron / 自製 Web 編輯器）整合。

---

## 目錄

1. [概覽](#1-概覽)
2. [SceneEditorPlugin（場景物件擺放編輯器）](#2-sceneeditorplugin場景物件擺放編輯器)
   - [啟動與相依插件](#21-啟動與相依插件)
   - [工具模式](#22-工具模式)
   - [EventBus API](#23-eventbus-api)
   - [資料型別](#24-資料型別)
   - [Undo / Redo](#25-undo--redo)
   - [Export — 匯出格式](#26-export--匯出格式)
   - [使用範例](#27-使用範例)
3. [ScriptNodeEditorPlugin（節點式腳本視覺化編輯器）](#3-scriptnodeeditorplugin節點式腳本視覺化編輯器)
   - [啟動與相依插件](#31-啟動與相依插件)
   - [節點結構](#32-節點結構)
   - [EventBus API](#33-eventbus-api)
   - [資料型別](#34-資料型別)
   - [Undo / Redo](#35-undo--redo)
   - [編譯演算法](#36-編譯演算法)
   - [使用範例](#37-使用範例)
4. [整合宿主應用程式](#4-整合宿主應用程式)
5. [相關文件](#5-相關文件)

---

## 1. 概覽

這兩個插件都是**純邏輯插件**，不依賴 Pixi.js，也不自帶 UI。  
它們透過 EventBus 暴露完整的指令集，讓宿主應用程式（例如 Electron / Web 編輯器）自行實作使用介面。

| 插件 | Namespace | 相依 | 功能 |
|------|-----------|------|------|
| `SceneEditorPlugin` | `scene-editor` | `InputManager` | 場景物件擺放、移動、刪除；Tiled 格式匯出 |
| `ScriptNodeEditorPlugin` | `script-node-editor` | `ScriptManager` | 節點圖 → `ScriptDef` 編譯；直接注入 `ScriptManager` |

---

## 2. SceneEditorPlugin（場景物件擺放編輯器）

### 2.1 啟動與相依插件

```ts
import { createEngine, InputManager, SceneEditorPlugin } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [
    new InputManager(),
    new SceneEditorPlugin(),
  ],
});
```

### 2.2 工具模式

`SceneEditorTool = 'place' | 'select' | 'move' | 'erase'`

| 工具 | 說明 |
|------|------|
| `place` | 在指定世界座標擺放一個新物件（依 `_selectedActorType`） |
| `select` | 點選既有物件，設定 `_selectedObjectId` |
| `move` | 移動已存在的物件至新座標 |
| `erase` | 刪除指定 ID 的物件 |

### 2.3 EventBus API

#### 命令型事件（呼叫端 → 插件）

| 事件 | Params | Output | 說明 |
|------|--------|--------|------|
| `sceneeditor/open` | — | — | 開啟編輯器（冪等） |
| `sceneeditor/close` | — | — | 關閉編輯器（冪等） |
| `sceneeditor/tool:set` | `SceneEditorToolSetParams` | — | 切換工具 |
| `sceneeditor/actor-type:select` | `SceneEditorActorTypeSelectParams` | — | 選取要擺放的 actor 類型 |
| `sceneeditor/object:place` | `SceneEditorObjectPlaceParams` | `SceneEditorObjectPlaceOutput` | 擺放物件；回傳 `{ object }` |
| `sceneeditor/object:select` | `SceneEditorObjectSelectParams` | — | 選取物件（傳 `null` 取消選取） |
| `sceneeditor/object:move` | `SceneEditorObjectMoveParams` | — | 移動物件 |
| `sceneeditor/object:remove` | `SceneEditorObjectRemoveParams` | — | 刪除物件 |
| `sceneeditor/undo` | — | — | 撤銷最近一步 |
| `sceneeditor/redo` | — | — | 重做最近一步 |
| `sceneeditor/export` | — | `SceneEditorExportOutput` | 匯出所有物件及 Tiled 格式 |
| `sceneeditor/state` | — | `SceneEditorStateOutput` | 查詢編輯器狀態快照 |

#### 通知型事件（插件 → 呼叫端）

| 事件 | Params | 說明 |
|------|--------|------|
| `sceneeditor/opened` | — | 編輯器已開啟 |
| `sceneeditor/closed` | — | 編輯器已關閉 |
| `sceneeditor/objects:changed` | `SceneEditorObjectsChangedParams` | 物件集合有異動（新增 / 移動 / 刪除 / Undo / Redo） |

### 2.4 資料型別

```ts
/** 場景中已擺放的物件。 */
interface ScenePlacedObject {
  id: string;         // 唯一擺放 ID（自動生成 'obj_N' 或呼叫端指定）
  actorType: string;  // 對應 ActorDef.id
  x: number;          // 世界座標 X
  y: number;          // 世界座標 Y
  properties: Record<string, unknown>; // 自訂屬性
}

/** 狀態快照（透過 sceneeditor/state 取得）。 */
interface SceneEditorStateOutput {
  open: boolean;
  tool: SceneEditorTool;
  selectedActorType: string | null;
  selectedObjectId: string | null;
  canUndo: boolean;
  canRedo: boolean;
}
```

### 2.5 Undo / Redo

每個有影響的操作（place / move / remove）都會推入一個 `SceneEditorCommand` 至 Undo 堆疊（最多 100 步）。  
執行新操作時 Redo 堆疊會被清空。

```ts
core.events.emitSync('sceneeditor/undo', {});   // 撤銷
core.events.emitSync('sceneeditor/redo', {});   // 重做

// 查詢是否可撤銷 / 重做
const { output } = core.events.emitSync('sceneeditor/state', {});
if (output.canUndo) core.events.emitSync('sceneeditor/undo', {});
```

### 2.6 Export — 匯出格式

`sceneeditor/export` 回傳兩種格式：

```ts
interface SceneEditorExportOutput {
  /** 原生物件陣列，可直接序列化或傳入引擎 ActorManager. */
  objects: ScenePlacedObject[];

  /** Tiled 相容的 objectgroup layer，可直接插入 .tmj 檔案。 */
  tiledObjectLayer: {
    type: 'objectgroup';
    name: string;
    objects: Array<{
      id: number;      // 1-based
      name: string;    // = ScenePlacedObject.id
      type: string;    // = ScenePlacedObject.actorType
      x: number;
      y: number;
      properties: Array<{ name: string; type: 'string'; value: string }>;
    }>;
  };
}
```

### 2.7 使用範例

```ts
import {
  createEngine, InputManager, SceneEditorPlugin,
} from '@inkshot/engine';
import type {
  SceneEditorObjectsChangedParams,
  SceneEditorExportOutput,
} from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new InputManager(), new SceneEditorPlugin()],
});

// ── 開啟編輯器、選取 actor 類型 ──────────────────────────────────
core.events.emitSync('sceneeditor/open', {});
core.events.emitSync('sceneeditor/actor-type:select', { actorType: 'chest' });
core.events.emitSync('sceneeditor/tool:set', { tool: 'place' });

// ── 監聽物件變更，同步至 UI ──────────────────────────────────────
core.events.on<SceneEditorObjectsChangedParams>('editor-ui', 'sceneeditor/objects:changed', ({ objects }) => {
  renderObjectList(objects);
});

// ── 擺放物件 ─────────────────────────────────────────────────────
const { output: placed } = core.events.emitSync('sceneeditor/object:place', {
  x: 320, y: 192,
  properties: { locked: true },
});
console.log(placed.object.id); // 'obj_0'

// ── 移動物件 ─────────────────────────────────────────────────────
core.events.emitSync('sceneeditor/object:move', {
  id: placed.object.id,
  x: 400, y: 192,
});

// ── 撤銷移動 ─────────────────────────────────────────────────────
core.events.emitSync('sceneeditor/undo', {});

// ── 匯出（原生格式 + Tiled 格式） ────────────────────────────────
const { output: exp } = core.events.emitSync<unknown, SceneEditorExportOutput>(
  'sceneeditor/export', {}
);
const tmjObjectLayer = exp.tiledObjectLayer; // → 插入 .tmj
const nativeObjects  = exp.objects;          // → 存檔或傳入 ActorManager
```

---

## 3. ScriptNodeEditorPlugin（節點式腳本視覺化編輯器）

### 3.1 啟動與相依插件

```ts
import { createEngine, ScriptManager, ScriptNodeEditorPlugin } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [
    new ScriptManager(),
    new ScriptNodeEditorPlugin(),
  ],
});
```

### 3.2 節點結構

```ts
interface ScriptEditorNode {
  id: string;           // 節點唯一 ID（自動生成 'node_N' 或呼叫端指定）
  cmd: string;          // ScriptManager 命令名稱（例如 'say', 'if', 'end'）
  x: number;            // 視覺畫布 X 座標（供 UI 顯示用）
  y: number;            // 視覺畫布 Y 座標（供 UI 顯示用）
  data: Record<string, unknown>; // 命令的額外欄位（不含 cmd）
  nextId: string | null; // 流程連接至下一個節點（null = 鏈尾）
}
```

### 3.3 EventBus API

#### 命令型事件

| 事件 | Params | Output | 說明 |
|------|--------|--------|------|
| `scriptnodeeditor/open` | `ScriptNodeEditorOpenParams` | — | 開啟編輯器（可選 `scriptId`）|
| `scriptnodeeditor/close` | — | — | 關閉編輯器 |
| `scriptnodeeditor/node:add` | `ScriptNodeEditorNodeAddParams` | `ScriptNodeEditorNodeAddOutput` | 新增節點；回傳 `{ node }` |
| `scriptnodeeditor/node:update` | `ScriptNodeEditorNodeUpdateParams` | — | 更新節點的 cmd / x / y / data（只更新提供的欄位）|
| `scriptnodeeditor/node:remove` | `ScriptNodeEditorNodeRemoveParams` | — | 刪除節點（同時清除其他節點指向它的 `nextId`）|
| `scriptnodeeditor/node:connect` | `ScriptNodeEditorConnectParams` | — | 連接 `fromId → toId`（`toId: null` = 斷開）|
| `scriptnodeeditor/undo` | — | — | 撤銷最近一步 |
| `scriptnodeeditor/redo` | — | — | 重做最近一步 |
| `scriptnodeeditor/export` | — | `ScriptNodeEditorExportOutput` | 編譯節點圖為 `ScriptDef`（不註冊）|
| `scriptnodeeditor/compile` | `ScriptNodeEditorCompileParams` | — | 編譯並呼叫 `script/define` 立即註冊 |
| `scriptnodeeditor/state` | — | `ScriptNodeEditorStateOutput` | 查詢編輯器狀態快照 |

#### 通知型事件

| 事件 | Params | 說明 |
|------|--------|------|
| `scriptnodeeditor/opened` | `ScriptNodeEditorOpenedParams` | 編輯器已開啟 |
| `scriptnodeeditor/closed` | — | 編輯器已關閉 |
| `scriptnodeeditor/nodes:changed` | `ScriptNodeEditorNodesChangedParams` | 節點集合有異動 |

### 3.4 資料型別

```ts
/** 匯出結果（透過 scriptnodeeditor/export 取得）。 */
interface ScriptNodeEditorExportOutput {
  /** 編譯後的 ScriptDef；無節點時為 null。 */
  script: ScriptDef | null;
}

/** 狀態快照（透過 scriptnodeeditor/state 取得）。 */
interface ScriptNodeEditorStateOutput {
  open: boolean;
  scriptId: string | null;
  nodes: ScriptEditorNode[];
  canUndo: boolean;
  canRedo: boolean;
}
```

### 3.5 Undo / Redo

支援四種撤銷類型：

| `ScriptEditorEditType` | 說明 |
|------------------------|------|
| `addNode` | 新增節點（撤銷 = 刪除） |
| `removeNode` | 刪除節點（撤銷 = 還原） |
| `updateNode` | 更新節點欄位（撤銷 = 還原舊值） |
| `connect` | 連接流程（撤銷 = 還原舊 `nextId`） |

堆疊上限為 100 步。

### 3.6 編譯演算法

`scriptnodeeditor/export` 與 `scriptnodeeditor/compile` 使用相同的編譯邏輯：

1. 找出所有**起始節點**（沒有任何其他節點將 `nextId` 指向它的節點）
2. 從第一個起始節點開始，沿 `nextId` 鏈依序走訪
3. 每個節點轉換為：`{ cmd: node.cmd, ...node.data }`
4. 回傳 `{ id: scriptId, nodes: orderedNodes }`

> 若編輯器內沒有節點，`export` 回傳 `script: null`；`compile` 無效果。

### 3.7 使用範例

```ts
import {
  createEngine, ScriptManager, ScriptNodeEditorPlugin,
} from '@inkshot/engine';
import type {
  ScriptNodeEditorNodesChangedParams,
  ScriptNodeEditorExportOutput,
} from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new ScriptManager(), new ScriptNodeEditorPlugin()],
});

// ── 開啟編輯器 ────────────────────────────────────────────────────
core.events.emitSync('scriptnodeeditor/open', { scriptId: 'quest-start' });

// ── 監聽節點變更，同步至 UI ───────────────────────────────────────
core.events.on<ScriptNodeEditorNodesChangedParams>('editor-ui', 'scriptnodeeditor/nodes:changed', ({ nodes }) => {
  renderNodeGraph(nodes);
});

// ── 新增節點 ─────────────────────────────────────────────────────
const { output: say1 } = core.events.emitSync('scriptnodeeditor/node:add', {
  cmd: 'say', data: { text: '任務開始了！' },
  x: 100, y: 100,
});
const { output: setVar } = core.events.emitSync('scriptnodeeditor/node:add', {
  cmd: 'set', data: { var: '$questStarted', value: true },
  x: 300, y: 100,
});
const { output: end } = core.events.emitSync('scriptnodeeditor/node:add', {
  cmd: 'end',
  x: 500, y: 100,
});

// ── 連接流程 ─────────────────────────────────────────────────────
core.events.emitSync('scriptnodeeditor/node:connect', { fromId: say1.node.id,  toId: setVar.node.id });
core.events.emitSync('scriptnodeeditor/node:connect', { fromId: setVar.node.id, toId: end.node.id });

// ── 更新節點內容 ─────────────────────────────────────────────────
core.events.emitSync('scriptnodeeditor/node:update', {
  id: say1.node.id,
  data: { text: '英雄，任務開始了！', speaker: 'Elder' },
});

// ── Undo / Redo ───────────────────────────────────────────────────
core.events.emitSync('scriptnodeeditor/undo', {});  // 撤銷 node:update
core.events.emitSync('scriptnodeeditor/redo', {});  // 重做

// ── 只匯出（不註冊）────────────────────────────────────────────────
const { output: exp } = core.events.emitSync<unknown, ScriptNodeEditorExportOutput>(
  'scriptnodeeditor/export', {}
);
console.log(exp.script?.nodes);
// [
//   { cmd: 'say', text: '英雄，任務開始了！', speaker: 'Elder' },
//   { cmd: 'set', var: '$questStarted', value: true },
//   { cmd: 'end' }
// ]

// ── 編譯並直接注入 ScriptManager ────────────────────────────────
core.events.emitSync('scriptnodeeditor/compile', { scriptId: 'quest-start' });
// ScriptManager 現在可以直接執行 'quest-start'
await core.events.emit('script/run', { scriptId: 'quest-start', instanceId: 'q1' });
```

---

## 4. 整合宿主應用程式

由於兩個插件都是**無 UI 的純邏輯插件**，宿主應用程式負責：

1. **渲染節點圖 / 物件清單** — 訂閱 `sceneeditor/objects:changed` 或 `scriptnodeeditor/nodes:changed`，將資料渲染為 UI
2. **轉發使用者互動** — 當使用者在編輯器 UI 點擊/拖曳時，呼叫對應的事件（例如 `sceneeditor/object:place`）
3. **存檔** — 呼叫 `sceneeditor/export` 或 `scriptnodeeditor/export`，將結果序列化至檔案
4. **快捷鍵** — 在宿主應用程式層實作 Ctrl+Z / Ctrl+Y，呼叫 `undo` / `redo` 事件

### 典型整合流程

```
宿主 UI (Electron / Web)
  │
  ├─ 使用者點擊「擺放物件」
  │   → core.events.emitSync('sceneeditor/object:place', { x, y })
  │
  ├─ 插件更新狀態並發送通知
  │   → 'sceneeditor/objects:changed' { objects: [...] }
  │
  └─ 宿主 UI 收到通知，更新物件清單面板
```

---

## 5. 相關文件

- [`docs/editor/plugin-editor-meta.md`](./plugin-editor-meta.md) — `editorMeta` 欄位格式規範
- [`src/types/sceneeditor.ts`](../../src/types/sceneeditor.ts) — SceneEditorPlugin 完整型別定義
- [`src/types/scriptnodeeditor.ts`](../../src/types/scriptnodeeditor.ts) — ScriptNodeEditorPlugin 完整型別定義
- [`src/plugins/scene/SceneEditorPlugin.ts`](../../src/plugins/scene/SceneEditorPlugin.ts) — 插件實作
- [`src/plugins/rpg/ScriptNodeEditorPlugin.ts`](../../src/plugins/rpg/ScriptNodeEditorPlugin.ts) — 插件實作
- [`docs/roadmap.md`](../roadmap.md) — 功能路線圖（含未來計畫的 DebugPlugin 整合）
