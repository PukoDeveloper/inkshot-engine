# 自訂 Plugin 開發指南

本指南說明如何從頭撰寫一個 inkshot-engine Plugin，涵蓋完整的開發流程：結構設計、事件命名、型別定義、測試，以及發布到 `src/index.ts`。

---

## 目錄

1. [Plugin 最小結構](#1-plugin-最小結構)
2. [事件命名規範](#2-事件命名規範)
3. [Output 型別設計](#3-output-型別設計)
4. [完整範例：CounterPlugin](#4-完整範例counterplugin)
   - [型別定義](#41-型別定義)
   - [Plugin 實作](#42-plugin-實作)
   - [測試](#43-測試)
   - [公開 API](#44-公開-api)
5. [依賴其他 Plugin](#5-依賴其他-plugin)
6. [非同步操作](#6-非同步操作)
7. [使用 Event Phase 擴充行為](#7-使用-event-phase-擴充行為)
8. [資源與副作用清理](#8-資源與副作用清理)
9. [Plugin 開發規範摘要](#9-plugin-開發規範摘要)

---

## 1. Plugin 最小結構

每個 Plugin 是一個實作 `EnginePlugin` 介面的 class：

```ts
// src/plugins/MyPlugin.ts
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';

export class MyPlugin implements EnginePlugin {
  readonly namespace = 'myPlugin';     // 唯一識別符，與事件前綴一致

  // 可選：若需依賴其他 Plugin，在此宣告
  // readonly dependencies = ['entity', 'assets'] as const;

  init(core: Core): void {
    // ① 初始化內部狀態
    // ② 注冊所有事件監聽器
    core.events.on(this.namespace, 'myPlugin/do-something', (params, output) => {
      output.result = 'done';
    });
  }

  destroy(core: Core): void {
    // 釋放非事件資源（WebGL 物件、Web Worker、定時器等）
    // EventBus 監聽器由 core.events.removeNamespace(this.namespace) 自動清除
  }
}
```

> **注意：** Plugin 檔案放在 `src/plugins/`（通用）或 `src/plugins/rpg/`（RPG 專用）。

---

## 2. 事件命名規範

所有事件使用 `<namespace>/<event-name>` 格式：

```
audio/play          ← 命令（consumer 向 plugin 發出指示）
audio/played        ← 通知（plugin 向外廣播結果）
save/slot:save      ← 命令，帶有子資源指定
save/slot:saved     ← 通知
entity/position:get ← 查詢（有回傳值的讀取操作）
```

| 類型 | 命名模式 | 範例 |
|------|---------|------|
| 命令（Consumer → Plugin） | 動詞形式 | `audio/play`, `scene/load`, `inventory/item:use` |
| 通知（Plugin → 外部廣播） | 過去式 | `audio/played`, `scene/changed`, `inventory/item:used` |
| 查詢（有回傳值） | `:get` 結尾 | `save/slot:get`, `entity/position:get`, `timer/cooldown` |

---

## 3. Output 型別設計

### Params 型別（輸入）

欄位使用 `readonly`，防止處理器意外修改：

```ts
// src/types/myPlugin.ts
export interface MyPluginDoSomethingParams {
  readonly id: string;
  readonly value?: number;
}
```

### Output 型別（回傳）

欄位**不**使用 `readonly`，因為處理器需要寫入：

```ts
export interface MyPluginDoSomethingOutput {
  result: string;
  processed: boolean;
}
```

### 通知 Payload

通知事件（廣播）的參數也使用 `readonly`：

```ts
export interface MyPluginDoneParams {
  readonly id: string;
  readonly result: string;
}
```

---

## 4. 完整範例：CounterPlugin

以下以一個**計數器 Plugin** 為例，展示完整的開發流程。

### 4.1 型別定義

```ts
// src/types/counter.ts

/** 增加計數 */
export interface CounterIncrementParams {
  readonly id: string;
  readonly amount?: number;  // 預設 1
}
export interface CounterIncrementOutput {
  value: number;
}

/** 取得計數值 */
export interface CounterGetParams {
  readonly id: string;
}
export interface CounterGetOutput {
  value: number;
  found: boolean;
}

/** 重置計數 */
export interface CounterResetParams {
  readonly id: string;
}

/** 廣播：計數達到門檻 */
export interface CounterThresholdReachedParams {
  readonly id: string;
  readonly value: number;
  readonly threshold: number;
}
```

### 4.2 Plugin 實作

```ts
// src/plugins/CounterPlugin.ts
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  CounterIncrementParams,
  CounterIncrementOutput,
  CounterGetParams,
  CounterGetOutput,
  CounterResetParams,
  CounterThresholdReachedParams,
} from '../types/counter.js';

export class CounterPlugin implements EnginePlugin {
  readonly namespace = 'counter';

  private _counters = new Map<string, number>();
  private _thresholds = new Map<string, number>();
  private _core!: Core;

  /**
   * 設定門檻值：當計數達到此值時廣播通知
   * @example
   * plugin.setThreshold('kills', 100); // 擊殺 100 次時觸發通知
   */
  setThreshold(id: string, threshold: number): void {
    this._thresholds.set(id, threshold);
  }

  init(core: Core): void {
    this._core = core;

    // 增加計數
    core.events.on(
      this.namespace,
      'counter/increment',
      (params: CounterIncrementParams, output: CounterIncrementOutput) => {
        const current = this._counters.get(params.id) ?? 0;
        const next = current + (params.amount ?? 1);
        this._counters.set(params.id, next);
        output.value = next;

        // 檢查是否達到門檻
        const threshold = this._thresholds.get(params.id);
        if (threshold !== undefined && next >= threshold) {
          core.events.emitSync<CounterThresholdReachedParams>('counter/threshold:reached', {
            id: params.id,
            value: next,
            threshold,
          });
        }
      },
    );

    // 查詢計數值
    core.events.on(
      this.namespace,
      'counter/value:get',
      (params: CounterGetParams, output: CounterGetOutput) => {
        const value = this._counters.get(params.id);
        output.found = value !== undefined;
        output.value = value ?? 0;
      },
    );

    // 重置計數
    core.events.on(this.namespace, 'counter/reset', (params: CounterResetParams) => {
      this._counters.delete(params.id);
    });
  }

  destroy(_core: Core): void {
    this._counters.clear();
    this._thresholds.clear();
    // EventBus 監聽器由 removeNamespace('counter') 自動清除
  }
}
```

### 4.3 測試

```ts
// tests/CounterPlugin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Core } from '../src/core/Core.js';
import { EventBus } from '../src/core/EventBus.js';
import { CounterPlugin } from '../src/plugins/CounterPlugin.js';

describe('CounterPlugin', () => {
  let core: Core;
  let plugin: CounterPlugin;

  beforeEach(() => {
    const events = new EventBus();
    core = { events } as unknown as Core;
    plugin = new CounterPlugin();
    plugin.init(core);
  });

  describe('counter/increment', () => {
    it('從 0 開始累計', () => {
      const { output } = core.events.emitSync<{ value: number }>('counter/increment', {
        id: 'kills',
      });
      expect(output.value).toBe(1);
    });

    it('支援自訂增量', () => {
      core.events.emitSync('counter/increment', { id: 'score', amount: 100 });
      const { output } = core.events.emitSync<{ value: number }>('counter/increment', {
        id: 'score',
        amount: 50,
      });
      expect(output.value).toBe(150);
    });
  });

  describe('counter/value:get', () => {
    it('回傳正確的計數值', () => {
      core.events.emitSync('counter/increment', { id: 'steps' });
      core.events.emitSync('counter/increment', { id: 'steps' });

      const { output } = core.events.emitSync<{ value: number; found: boolean }>(
        'counter/value:get',
        { id: 'steps' },
      );
      expect(output.found).toBe(true);
      expect(output.value).toBe(2);
    });

    it('不存在的 id 回傳 found: false', () => {
      const { output } = core.events.emitSync<{ value: number; found: boolean }>(
        'counter/value:get',
        { id: 'nonexistent' },
      );
      expect(output.found).toBe(false);
      expect(output.value).toBe(0);
    });
  });

  describe('counter/reset', () => {
    it('重置計數為 0', () => {
      core.events.emitSync('counter/increment', { id: 'deaths', amount: 5 });
      core.events.emitSync('counter/reset', { id: 'deaths' });

      const { output } = core.events.emitSync<{ found: boolean }>('counter/value:get', {
        id: 'deaths',
      });
      expect(output.found).toBe(false);
    });
  });

  describe('門檻通知', () => {
    it('達到門檻時廣播 counter/threshold:reached', () => {
      plugin.setThreshold('kills', 3);

      const reached: unknown[] = [];
      core.events.on('test', 'counter/threshold:reached', (params) => {
        reached.push(params);
      });

      core.events.emitSync('counter/increment', { id: 'kills' });
      core.events.emitSync('counter/increment', { id: 'kills' });
      expect(reached).toHaveLength(0);

      core.events.emitSync('counter/increment', { id: 'kills' });
      expect(reached).toHaveLength(1);
    });
  });
});
```

### 4.4 公開 API

新增 Plugin 後，在 `src/index.ts` 加入 export：

```ts
// src/index.ts（新增）
export { CounterPlugin } from './plugins/CounterPlugin.js';
export type {
  CounterIncrementParams,
  CounterIncrementOutput,
  CounterGetParams,
  CounterGetOutput,
  CounterResetParams,
  CounterThresholdReachedParams,
} from './types/counter.js';
```

---

## 5. 依賴其他 Plugin

若 Plugin 在執行期間需要使用其他 Plugin 提供的事件，必須在 `dependencies` 中明確宣告：

```ts
export class QuestPlugin implements EnginePlugin {
  readonly namespace = 'quest';

  // 需要在 entity、store（VariableStoreManager）之後初始化
  readonly dependencies = ['entity', 'store'] as const;

  init(core: Core): void {
    core.events.on(this.namespace, 'quest/complete', (params) => {
      // 現在可以安全使用 store/* 和 entity/* 事件
      core.events.emitSync('store/set', {
        namespace: 'quest',
        key: `${params.questId}.completed`,
        value: true,
      });
    });
  }
}
```

> `createEngine` 的拓撲排序會確保 `EntityManager` 和 `VariableStoreManager` 的 `init()` 先完成。

---

## 6. 非同步操作

需要非同步操作（網路請求、檔案讀取等）時，在處理器中使用 `async/await`，並讓呼叫端使用 `await core.events.emit()`：

```ts
// Plugin 內部
core.events.on(this.namespace, 'quest/load', async (params, output) => {
  const data = await fetch(`/data/quests/${params.questId}.json`).then(r => r.json());
  output.quest = data;
  output.loaded = true;
});

// 呼叫端
const { output } = await core.events.emit<{ quest: QuestData; loaded: boolean }>(
  'quest/load',
  { questId: 'main-quest-01' },
);
if (output.loaded) startQuest(output.quest);
```

---

## 7. 使用 Event Phase 擴充行為

利用 `before` / `after` Phase 讓其他 Plugin 可以安全地掛鉤到你的事件流程：

```ts
// Plugin A：在 before phase 提供 Hook（讓外部可以驗證或取消）
core.events.on(this.namespace, 'inventory/item:use-before', (params, output, control) => {
  // 預留給其他 Plugin 實作驗證邏輯
  // 例如：檢查是否有效果免疫的 buff
});

// Plugin A：main phase — 主要邏輯
core.events.on(this.namespace, 'inventory/item:use', (params, output) => {
  // 執行使用道具的效果
  output.used = true;
});

// Plugin A：after phase — 廣播通知
core.events.on(this.namespace, 'inventory/item:use-after', (params) => {
  // 廣播通知 UI 更新
  core.events.emitSync('ui/inventory:refresh', {});
});

// Plugin B（外部）：在 before phase 加入免疫檢查
core.events.on('statusPlugin', 'inventory/item:use-before', (params, _output, control) => {
  const { output: status } = core.events.emitSync('stats/status:has', {
    actorId: params.actorId,
    statusId: 'item-seal',
  });
  if (status.active) {
    control.break(); // 封印狀態：取消使用道具
  }
});
```

---

## 8. 資源與副作用清理

在 `destroy()` 中清理所有非事件資源：

```ts
export class AudioPlugin implements EnginePlugin {
  readonly namespace = 'audio';
  private _audioCtx: AudioContext | null = null;
  private _workers: Worker[] = [];
  private _timers: ReturnType<typeof setInterval>[] = [];

  init(core: Core): void {
    this._audioCtx = new AudioContext();
    // ...
  }

  destroy(_core: Core): void {
    // 關閉 AudioContext
    this._audioCtx?.close();
    this._audioCtx = null;

    // 終止 Worker
    this._workers.forEach(w => w.terminate());
    this._workers = [];

    // 清除定時器
    this._timers.forEach(id => clearInterval(id));
    this._timers = [];

    // 注意：EventBus 監聽器由 core.events.removeNamespace('audio') 自動處理
    // 不需要手動取消訂閱
  }
}
```

---

## 9. Plugin 開發規範摘要

| 項目 | 規範 |
|------|------|
| **檔案位置** | 通用 Plugin → `src/plugins/PascalCase.ts`；RPG 專用 → `src/plugins/rpg/PascalCase.ts` |
| **型別位置** | `src/types/<pluginName>.ts`（與實作分離） |
| **namespace** | 短小寫，與事件前綴完全一致 |
| **事件命名** | 命令用動詞，通知用過去式，查詢用 `:get` 結尾 |
| **Params 欄位** | 使用 `readonly` |
| **Output 欄位** | 不使用 `readonly` |
| **跨 Plugin 通訊** | 只透過 EventBus，不直接 import 其他 Plugin |
| **依賴宣告** | 在 `dependencies` 中列出所有執行期依賴 |
| **公開 API** | 在 `src/index.ts` 加入 export |
| **測試** | 放於 `tests/<PluginName>.test.ts` |
| **JSDoc** | 所有公開方法和型別加上 JSDoc（含 `@example`）|

---

## 延伸閱讀

- [核心概念](./core-concepts.md) — EventBus 和 Phase 的完整說明
- [架構設計文件](../../ARCHITECTURE.md) — 詳細的設計哲學和 Style Guide（英文）
- [開發貢獻指引](../../CONTRIBUTING.md) — PR 流程、測試規範、版本發布
