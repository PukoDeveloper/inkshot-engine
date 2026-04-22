# inkshot-engine 開發指引 (Contributing Guide)

歡迎參與 **inkshot-engine** 的開發！本文件說明如何設置開發環境、程式碼風格規範、Plugin 開發規範，以及提交流程。

---

## 目錄

1. [環境設置](#1-環境設置)
2. [專案結構](#2-專案結構)
3. [開發流程](#3-開發流程)
4. [程式碼風格規範](#4-程式碼風格規範)
5. [Plugin 開發規範](#5-plugin-開發規範)
6. [TypeScript 型別規範](#6-typescript-型別規範)
7. [測試規範](#7-測試規範)
8. [提交與 PR 規範](#8-提交與-pr-規範)
9. [版本發布](#9-版本發布)

---

## 1. 環境設置

### 必要工具

- **Node.js** v20 或更新版本
- **npm** v10 或更新版本（隨 Node.js 附帶）

### 安裝步驟

```bash
# 1. 複製（clone）此儲存庫
git clone https://github.com/PukoDeveloper/inkshot-engine.git
cd inkshot-engine

# 2. 安裝依賴
npm install

# 3. 建置（可選，用於驗證型別正確性）
npm run build

# 4. 執行測試，確認環境正常
npm test
```

### 常用指令

| 指令 | 說明 |
|------|------|
| `npm run build` | 執行 TypeScript 編譯，輸出至 `dist/` |
| `npm run build:watch` | 監聽模式，檔案變更時自動重新編譯 |
| `npm run build:bundle` | 以 Rolldown 將引擎（含 pixi.js）打包為單一 ESM 檔案 `dist/engine.bundle.js`，供瀏覽器直接使用（不需 Node.js） |
| `npm run typecheck` | 僅執行型別檢查，不產生輸出檔案 |
| `npm test` | 執行所有測試（Vitest） |
| `npm run test:watch` | 監聽模式，測試會隨程式碼變更即時重新執行 |

---

## 2. 專案結構

```
inkshot-engine/
├── src/
│   ├── core/               ← 核心模組（Core、EventBus、WorkerBridge、sortPlugins）
│   ├── plugins/            ← 通用引擎插件
│   │   ├── rpg/            ← RPG / 敘事遊戲專用插件
│   │   └── save/           ← 存檔相關插件與適配器
│   ├── rendering/          ← 渲染管線（Renderer、Camera、PostFxPipeline 等）
│   ├── rpg/                ← RPG 工廠函式與資料載入器（createRpgEngine、loadRpgData）
│   ├── types/              ← 所有公開型別定義（按系統分檔）
│   ├── workers/            ← Web Worker 腳本
│   ├── createEngine.ts     ← 主要公開進入點
│   └── index.ts            ← 全域 re-export
├── editor/                 ← 瀏覽器直接執行的範例頁面（不需 Node.js）
│   ├── index.html          ← Import Map 入口頁（引擎 + 插件共用單一 bundle）
│   └── main.js             ← 遊戲進入點範例
├── tests/                  ← 測試檔案（Vitest）
├── docs/                   ← 補充文件
├── rolldown.bundle.config.js ← Rolldown 打包設定（build:bundle）
├── ARCHITECTURE.md         ← 架構與風格指南（詳細）
├── CONTRIBUTING.md         ← 本文件
├── README.md               ← 快速入門
└── TODO.md                 ← 功能清單與待實作項目
```

### 新增檔案的位置規則

| 類型 | 放置位置 | 命名規則 |
|------|---------|---------|
| 通用引擎插件 | `src/plugins/` | `PascalCase.ts`（如 `AudioManager.ts`） |
| RPG 專用插件 | `src/plugins/rpg/` | `PascalCase.ts` |
| 核心模組 | `src/core/` | `PascalCase.ts` |
| 型別定義 | `src/types/` | `camelCase.ts`（如 `audio.ts`） |
| 測試 | `tests/` | `*.test.ts` |

---

## 3. 開發流程

### 分支策略

- **`main`** — 穩定版本，僅接受經過審查的 PR
- **功能分支** — 從 `main` 切出，命名格式：`feat/<功能名稱>`、`fix/<修復名稱>`、`docs/<文件名稱>`

```bash
# 建立功能分支
git checkout -b feat/my-new-plugin

# 開發完成後推送
git push origin feat/my-new-plugin
```

### 一般開發步驟

1. 建立分支
2. 撰寫程式碼與型別定義
3. 在 `src/index.ts` 中加入 re-export（如有公開 API）
4. 撰寫測試（`tests/`）
5. 執行 `npm run typecheck` 確認無型別錯誤
6. 執行 `npm test` 確認測試通過
7. 提交並建立 PR

---

## 4. 程式碼風格規範

本專案遵循 ARCHITECTURE.md 中描述的設計哲學。以下是關鍵規範摘要：

### 4.1 事件命名

所有 EventBus 事件使用 `<namespace>/<event-name>` 格式：

```
audio/play          ← 命令（command）
audio/played        ← 通知（broadcast）
save/slot:save      ← 命令，帶有子資源指定
save/slot:saved     ← 通知
```

- **namespace** 應為簡短小寫識別符，與 Plugin 的 `namespace` 欄位一致
- 命令（consumer 發送給 plugin）使用動詞形式，如 `play`、`load`、`define`
- 通知（plugin 廣播給外部）使用過去式，如 `played`、`loaded`、`defined`
- 查詢（有回傳值的讀取操作）以 `:get` 結尾，如 `save/slot:get`

### 4.2 Plugin 結構

每個 Plugin 應為一個 class，實作 `EnginePlugin` 介面：

```ts
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';

export class MyPlugin implements EnginePlugin {
  readonly namespace = 'myPlugin';
  readonly dependencies = ['entity'] as const; // 依賴的 namespace 列表

  init(core: Core): void {
    // 所有事件監聽器在此註冊
    core.events.on(this.namespace, 'myPlugin/do-something', (params, output) => {
      // 處理事件
    });
  }

  destroy(core: Core): void {
    // 釋放資源（移除監聽器由 core.events.removeNamespace 處理）
  }
}
```

### 4.3 事件 Phase 使用

每個 `emit()` 會觸發三個 phase：`before → main → after`：

```ts
// 在 before phase 驗證或取消
core.events.on('myPlugin', 'myPlugin/action-before', (params, output, control) => {
  if (!isValid(params)) control.break(); // 取消後續所有 phase
});

// 在 main phase 處理主要邏輯
core.events.on('myPlugin', 'myPlugin/action', (params, output) => {
  output.result = doWork(params);
});

// 在 after phase 處理後置作業（通知其他系統等）
core.events.on('myPlugin', 'myPlugin/action-after', (params) => {
  notifyOthers(params);
});
```

### 4.4 Output 物件

處理器可透過 `output` 物件回傳資料給呼叫者，優先使用此方式而非全域狀態：

```ts
core.events.on('myPlugin', 'myPlugin/data:get', (_params, output: MyDataOutput) => {
  output.value = this._data;
});

// 呼叫端
const { output } = core.events.emitSync<MyDataOutput>('myPlugin/data:get', {});
console.log(output.value);
```

### 4.5 非同步事件

需要非同步操作時，使用 `emit()` 而非 `emitSync()`：

```ts
// 非同步處理器（Plugin 內部）
core.events.on('myPlugin', 'myPlugin/load', async (params, output) => {
  output.data = await fetchData(params.url);
});

// 呼叫端
const { output } = await core.events.emit('myPlugin/load', { url: '/data.json' });
```

### 4.6 一般程式碼規範

- 使用 **ES Module** 語法（`import`/`export`），引入路徑需加 `.js` 副檔名
- 所有公開 API 必須有 **JSDoc** 文件（包含 `@example`）
- 使用 `readonly` 修飾符於 interface 欄位，表示不可變資料
- 優先使用 `const` 和不可變資料結構
- 避免在 Plugin 之間直接 `import`，所有通訊應透過 EventBus

---

## 5. Plugin 開發規範

### 5.1 Plugin 最小結構

```ts
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';

export class ExamplePlugin implements EnginePlugin {
  readonly namespace = 'example';

  // 如需依賴其他 Plugin，在此宣告
  // readonly dependencies = ['entity', 'assets'] as const;

  init(core: Core): void {
    // 1. 在此初始化內部狀態
    // 2. 在此註冊所有事件監聽器
  }

  destroy(core: Core): void {
    // 釋放非事件資源（WebGL objects、Web Workers、定時器等）
    // EventBus 監聽器由 core.events.removeNamespace(this.namespace) 自動清除
  }
}
```

### 5.2 在 src/index.ts 公開 Plugin

新增 Plugin 後，需要在 `src/index.ts` 加入 export：

```ts
// src/index.ts
export { ExamplePlugin } from './plugins/ExamplePlugin.js';
export type {
  ExampleDoSomethingParams,
  ExampleDoSomethingOutput,
} from './types/example.js';
```

### 5.3 型別定義位置

為 Plugin 定義的所有公開型別應放置於 `src/types/<pluginName>.ts`，避免在 Plugin 實作檔案中同時定義型別與實作邏輯。

### 5.4 依賴宣告

若 Plugin 在 `init()` 或執行期間依賴其他 Plugin，必須在 `dependencies` 中明確宣告：

```ts
export class MyPhysicsPlugin implements EnginePlugin {
  readonly namespace = 'myPhysics';
  // entity 必須先完成初始化
  readonly dependencies = ['entity'] as const;
}
```

`createEngine` 會自動依據 `dependencies` 拓撲排序，確保初始化順序正確。

---

## 6. TypeScript 型別規範

### 6.1 Params / Output 型別命名

事件的 params 和 output 型別遵循固定命名模式：

```ts
// 命令事件
export interface AudioPlayParams { ... }      // params（輸入）
export interface AudioPlayOutput { ... }      // output（回傳）

// 通知事件
export interface AudioPlayedParams { ... }    // 通知的 payload
```

### 6.2 使用 readonly

所有 Params 型別的欄位應標記為 `readonly`：

```ts
export interface AudioPlayParams {
  readonly key: string;
  readonly loop?: boolean;
  readonly volume?: number;
}
```

Output 型別的欄位則 **不** 使用 `readonly`（因為處理器需要寫入）：

```ts
export interface AudioPlayOutput {
  instanceId: string;
  playing: boolean;
}
```

### 6.3 避免 any

避免使用 `any`；若需要任意型別，優先使用 `unknown` 並搭配型別防衛（type guard）。

---

## 7. 測試規範

本專案使用 **Vitest** 進行測試。

### 7.1 測試檔案位置

所有測試放置於 `tests/` 目錄，命名為 `<PluginName>.test.ts`。

### 7.2 測試工具設置

由於引擎使用 Pixi.js（需要 Canvas），測試環境使用 `jsdom`，並透過 `vitest.config.ts` 設定。大多數 Plugin 測試不需要實際渲染，可直接測試 EventBus 互動。

### 7.3 基本測試範例

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Core } from '../src/core/Core.js';
import { EventBus } from '../src/core/EventBus.js';
import { MyPlugin } from '../src/plugins/MyPlugin.js';

describe('MyPlugin', () => {
  let core: Core;
  let plugin: MyPlugin;

  beforeEach(async () => {
    // 建立最小化的 Core（不啟動 Pixi.js）
    const events = new EventBus();
    core = { events } as unknown as Core;
    plugin = new MyPlugin();
    await plugin.init(core);
  });

  it('should handle my-event', async () => {
    const { output } = await core.events.emit<{ result: string }>(
      'myPlugin/my-event',
      { input: 'test' },
    );
    expect(output.result).toBe('expected-value');
  });
});
```

### 7.4 測試覆蓋範圍

每個新 Plugin 至少應涵蓋以下測試：

- 每個命令事件的正常路徑（happy path）
- 邊界情況（空輸入、無效 ID 等）
- 破壞性操作（重複定義、刪除不存在的項目等）

---

## 8. 提交與 PR 規範

### 8.1 Commit 訊息格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 規範：

```
<type>(<scope>): <短描述>

[可選的詳細說明]
```

常用 type：

| Type | 說明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 錯誤修復 |
| `docs` | 文件變更 |
| `refactor` | 重構（不影響功能） |
| `test` | 新增或修改測試 |
| `chore` | 建置工具、依賴更新等 |

範例：

```
feat(audio): add spatial audio support for 3D positioning
fix(save): handle missing slot gracefully in slot:load
docs: add JSON data format reference
test(battle): add edge case tests for combatant defeat
```

### 8.2 PR 規範

提交 PR 時請確認：

- [ ] `npm run typecheck` 無錯誤
- [ ] `npm test` 所有測試通過
- [ ] 新功能已附上測試
- [ ] 公開 API 已更新至 `src/index.ts`
- [ ] 相關文件已更新（README、ARCHITECTURE 等）
- [ ] PR 描述清楚說明改動內容與原因

---

## 9. 版本發布

本專案遵循 [Semantic Versioning](https://semver.org/)：

- **PATCH**（`0.x.Y`）— 向後相容的錯誤修復
- **MINOR**（`0.X.0`）— 向後相容的新功能
- **MAJOR**（`X.0.0`）— 破壞性變更（Breaking Change）

發布前必須：

1. 更新 `package.json` 中的 `version`
2. 執行完整測試套件 `npm test`
3. 執行建置 `npm run build` 並確認 `dist/` 目錄正確
4. 在 GitHub 建立 Release tag（格式：`v0.x.y`）
