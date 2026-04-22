# 核心概念

本文件深入說明 inkshot-engine 的三大核心機制：**EventBus**、**Plugin 系統**、**Event Phase**。  
理解這三個概念是使用本引擎的基礎。

---

## 目錄

1. [EventBus — 統一通訊頻道](#1-eventbus--統一通訊頻道)
   - [訂閱事件（on / once）](#11-訂閱事件on--once)
   - [發出事件（emit / emitSync）](#12-發出事件emit--emitsync)
   - [Output 物件](#13-output-物件)
   - [移除監聽器](#14-移除監聽器)
2. [Event Phase — 事件三階段](#2-event-phase--事件三階段)
   - [Phase 運作流程](#21-phase-運作流程)
   - [Flow Control — break / skipPhase](#22-flow-control--break--skipphase)
   - [Priority — 同 Phase 內的執行順序](#23-priority--同-phase-內的執行順序)
3. [Plugin 系統](#3-plugin-系統)
   - [Plugin 介面](#31-plugin-介面)
   - [Dependencies — 依賴宣告與初始化順序](#32-dependencies--依賴宣告與初始化順序)
   - [Plugin 來源（物件 / URL）](#33-plugin-來源物件--url)
4. [核心生命週期事件](#4-核心生命週期事件)
5. [設計原則摘要](#5-設計原則摘要)

---

## 1. EventBus — 統一通訊頻道

inkshot-engine 的所有子系統都透過 **共享的 `EventBus`（`core.events`）** 溝通，不存在跨 Plugin 的直接方法呼叫或 `import` 引用。

```
┌─────────────────────────────────────────────────────────┐
│                         Core                            │
│  ┌──────────┐   events   ┌──────────┐  ┌────────────┐  │
│  │ Renderer │◄──────────►│ EventBus │◄─►│  Plugin N  │  │
│  └──────────┘            └──────────┘  └────────────┘  │
│                               ▲                         │
│                        ┌──────┴──────┐                  │
│                        │  Plugin 1   │                  │
│                        └─────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### 1.1 訂閱事件（on / once）

```ts
// 持續訂閱（回傳取消訂閱函式）
const unsubscribe = core.events.on(
  'myPlugin',           // namespace — 對應 plugin 的 namespace 欄位
  'audio/play',         // 要監聽的事件名稱
  (params, output, control) => {
    // params  — 傳入的參數物件（唯讀）
    // output  — 可寫入回傳值的物件
    // control — Flow control（break / skipPhase）
  }
);

// 取消訂閱
unsubscribe();

// 只觸發一次後自動取消
core.events.once('myPlugin', 'audio/play', (params, output) => {
  console.log('只執行一次');
});
```

**監聽選項：**

| 選項 | 型別 | 預設值 | 說明 |
|------|------|--------|------|
| `phase` | `'before' \| 'main' \| 'after'` | `'main'` | 在哪個 Phase 觸發 |
| `priority` | `number` | `0` | 同 Phase 內的執行優先級（越大越先） |

```ts
// 在 before phase，優先級 100 監聽
core.events.on('myPlugin', 'save/slot:save', handler, {
  phase: 'before',
  priority: 100,
});
```

### 1.2 發出事件（emit / emitSync）

**非同步 `emit`**（推薦用於可能有 async 處理器的事件）：

```ts
const { output, stopped } = await core.events.emit('audio/play', {
  key: 'bgm',
  loop: true,
  volume: 0.8,
});

// output   — 各處理器寫入的回傳值
// stopped  — 是否被 control.break() 中止
```

**同步 `emitSync`**（所有處理器不得回傳 Promise）：

```ts
const { output } = core.events.emitSync<{ instanceId: string }>('audio/play', {
  key: 'sfx-hit',
});
console.log(output.instanceId);
```

> **慣例：** 需要等待結果的操作用 `await emit()`，僅讀取快取或觸發同步狀態變更用 `emitSync()`。

### 1.3 Output 物件

`output` 物件讓處理器可以回傳資料給呼叫端，避免使用全域狀態：

```ts
// Plugin 內的處理器（寫入 output）
core.events.on('myPlugin', 'entity/count:get', (_params, output: { count: number }) => {
  output.count = this._entities.size;
});

// 呼叫端（讀取 output）
const { output } = core.events.emitSync<{ count: number }>('entity/count:get', {});
console.log(output.count); // 42
```

多個處理器可以寫入不同的 `output` 欄位，最後的值會被保留（後者覆蓋前者）。

### 1.4 移除監聽器

```ts
// 移除單一監聽器
const unsub = core.events.on('myPlugin', 'some/event', handler);
unsub();

// 移除整個 namespace 的所有監聽器
// （plugin.destroy() 通常這樣做）
core.events.removeNamespace('myPlugin');
```

---

## 2. Event Phase — 事件三階段

每次 `emit()` 會依序觸發 **三個 Phase**，使用相同的事件基礎名稱：

```
<namespace>/<event>-before  →  <namespace>/<event>  →  <namespace>/<event>-after
        (before)                      (main)                    (after)
```

### 2.1 Phase 運作流程

| Phase | 用途 |
|-------|------|
| `before` | 前置驗證、預處理、或取消後續 Phase |
| `main` | 主要邏輯處理 |
| `after` | 後置作業、通知其他系統、清理 |

**實際範例 — 存檔流程：**

```ts
// before phase：環境 Plugin 從 LocalStorage 讀取原始資料
core.events.on('localStorage', 'save/slot:load', (params, output) => {
  const raw = localStorage.getItem(`save:${params.id}`);
  if (raw) output.raw = JSON.parse(raw);  // SaveManager 在 main phase 使用
}, { phase: 'before' });

// main phase：SaveManager（內建）解析 output.raw 並還原存檔
// （此部分已由 SaveManager 處理）

// after phase：遊戲邏輯在讀檔完成後恢復場景
core.events.on('myGame', 'save/slot:load', async ({ id }) => {
  const slot = core.events.emitSync('save/slot:get', { id }).output.slot;
  await core.events.emit('scene/load', { key: slot.data.currentScene });
}, { phase: 'after' });
```

### 2.2 Flow Control — break / skipPhase

在任何處理器中可使用 `control` 參數控制執行流程：

```ts
core.events.on('myPlugin', 'battle/start-before', (params, output, control) => {
  if (!params.combatants || params.combatants.length < 2) {
    output.error = '至少需要 2 個戰鬥者';
    control.break();      // 中止所有後續 Phase（main 和 after 都不會執行）
  }
});

core.events.on('myPlugin', 'battle/start-before', (params, output, control) => {
  if (isAlreadyInBattle()) {
    control.skipPhase();  // 跳過此 Phase 剩餘的處理器，但 main / after 仍執行
  }
});
```

| 方法 | 效果 |
|------|------|
| `control.break()` | 中止全部後續 Phase（before → 停止，main 和 after 不執行） |
| `control.skipPhase()` | 跳過此 Phase 內剩餘的處理器，下一個 Phase 仍正常執行 |

### 2.3 Priority — 同 Phase 內的執行順序

Priority 數值**越大越先執行**，預設為 `0`：

```ts
// 驗證邏輯需要最先執行（priority: 100）
core.events.on('validation', 'inventory/item:use-before', handler, {
  phase: 'before',
  priority: 100,
});

// 一般邏輯在後（priority: 0，預設）
core.events.on('myGame', 'inventory/item:use-before', anotherHandler, {
  phase: 'before',
});
```

> **慣例：** 框架層級使用 ±1000，業務邏輯使用 ±10 ~ ±100，一般用途保持預設 0。

---

## 3. Plugin 系統

### 3.1 Plugin 介面

每個 Plugin 必須實作 `EnginePlugin` 介面：

```ts
interface EnginePlugin {
  readonly namespace: string;               // 唯一識別符，如 'audio'、'myGame/combat'
  readonly dependencies?: readonly string[]; // 必須先初始化的 namespace 清單
  init(core: Core): void | Promise<void>;   // 初始化（注冊監聽器、載入資源等）
  destroy?(core: Core): void | Promise<void>; // 銷毀（釋放非事件資源）
}
```

**Plugin 行為規範：**

1. **所有事件監聽器在 `init()` 中注冊**，使用自己的 `namespace`
2. **只透過 EventBus 與其他 Plugin 溝通** — 不直接 import 或呼叫其他 Plugin 的方法
3. **在 `destroy()` 中釋放非事件資源** — WebGL 物件、Web Worker、定時器等  
   （EventBus 監聽器由 `core.events.removeNamespace()` 自動清除）
4. **宣告唯一的 `namespace`** — 與其事件前綴完全一致

### 3.2 Dependencies — 依賴宣告與初始化順序

`createEngine` 使用**拓撲排序**確保 Plugin 依正確順序初始化，無論你在 `plugins` 陣列中的排列順序如何：

```ts
class PlayerController implements EnginePlugin {
  readonly namespace = 'playerController';

  // 宣告依賴：entity 和 physics 必須先完成初始化
  readonly dependencies = ['entity', 'physics'] as const;

  init(core: Core) {
    // 此時 EntityManager 和 PhysicsAdapter 已準備好
    core.events.on(this.namespace, 'core/tick', () => {
      // 使用 entity/* 和 physics/* 事件
    });
  }
}

// 排列順序無關緊要，引擎自動依賴排序
await createEngine({
  plugins: [
    new PlayerController(),   // 雖然排第一，但會在 entity 和 physics 之後初始化
    new EntityManager(),
    new KinematicPhysicsAdapter(),
  ],
});
```

**依賴錯誤的處理：**

| 情況 | 結果 |
|------|------|
| 依賴的 namespace 不在 `plugins` 清單中 | `createEngine` 立即拋出錯誤 |
| 循環依賴（A → B → A） | `createEngine` 立即拋出錯誤 |
| 重複的 `namespace` 值 | `createEngine` 立即拋出錯誤 |

**銷毀順序**：`destroy()` 以**初始化的反向順序**呼叫，確保資源釋放的正確性。

### 3.3 Plugin 來源（物件 / URL）

Plugin 可以是物件（類別實例）或 URL 字串（動態 import）：

```ts
await createEngine({
  plugins: [
    new ResourceManager(),                         // 物件形式（推薦）
    'https://cdn.example.com/my-plugin.js',        // URL 形式（動態載入）
  ],
});
```

URL 形式的模組需要將 `default export` 設為 `EnginePlugin` 實例。

---

## 4. 核心生命週期事件

以下事件由引擎自動觸發，無需手動 emit：

| 事件 | 時機 | Payload |
|------|------|---------|
| `core/init` | 所有 Plugin `init()` 完成後 | `{}` |
| `core/start` | 遊戲循環啟動後 | `{}` |
| `core/tick` | 每幀 | `{ delta: number, elapsed: number }` |
| `core/pause` | 呼叫 `core.pause()` | `{}` |
| `core/resume` | 呼叫 `core.resume()` | `{}` |
| `core/destroy` | 呼叫 `core.destroy()` 後、Plugin 銷毀前 | `{}` |

```ts
core.events.on('myPlugin', 'core/tick', ({ delta, elapsed }) => {
  // delta  — 自上一幀的時間（Pixi Ticker 單位，60fps 時 ≈ 1）
  // elapsed — 從遊戲啟動到現在的毫秒數
  update(delta);
});
```

---

## 5. 設計原則摘要

| 原則 | 說明 |
|------|------|
| **EventBus 是唯一通訊管道** | Plugin 之間不直接 import 或呼叫對方 |
| **Plugin 隔離** | 每個 Plugin 有自己的 `namespace`，可隨時卸載 |
| **可測試性** | 任何系統都可以用最小 EventBus 單獨測試，無需啟動完整引擎 |
| **可擴展性** | 第三方 Plugin 可攔截、增強或取消任何內建事件 |
| **資料導向** | 遊戲狀態以純資料物件表示，透過事件讀寫 |

---

## 延伸閱讀

- [自訂 Plugin 開發](./plugin-development.md) — 從頭撰寫一個 Plugin
- [架構設計文件](../ARCHITECTURE.md) — 完整設計哲學與 Style Guide（英文）
- [完整 API 手冊](../README.md) — 所有內建 Plugin 的事件契約（英文）
