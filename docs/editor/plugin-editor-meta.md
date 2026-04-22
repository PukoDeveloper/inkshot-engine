# Plugin `editorMeta` 欄位規範

本文件記錄 `EnginePlugin.editorMeta` 的**建議資料格式**，以及主定義（schemas）與擴充機制（schemaExtensions）的設計慣例。

> **重要：** `editorMeta` 的型別是 `Record<string, unknown>` —— 引擎本身**完全不讀取、不驗證**這個物件。它是一個純粹的透傳容器，格式由插件作者自訂，編輯器負責解析與消費。本文件只是為了讓插件作者和編輯器開發者對齊格式慣例，**不構成強制約束**。

---

## 目錄

1. [背景與設計目標](#1-背景與設計目標)
2. [頂層建議欄位](#2-頂層建議欄位)
3. [schemas — 主資料結構定義](#3-schemas--主資料結構定義)
   - [欄位型別一覽](#31-欄位型別一覽)
   - [陣列與巢狀物件](#32-陣列與巢狀物件)
   - [跨集合參照（ref）](#33-跨集合參照ref)
   - [列舉選項（enum）](#34-列舉選項enum)
   - [隱藏欄位（hidden）](#35-隱藏欄位hidden)
4. [schemaExtensions — 擴充其他插件的 schema](#4-schemaextensions--擴充其他插件的-schema)
   - [擴充格式](#41-擴充格式)
   - [擴充套疊規則](#42-擴充套疊規則)
5. [events — 宣告可用的事件清單](#5-events--宣告可用的事件清單)
6. [scenes — 宣告場景類型（選用）](#6-scenes--宣告場景類型選用)
7. [完整範例：內建插件的 editorMeta 示意](#7-完整範例內建插件的-editormeta-示意)
   - [SceneManager](#71-scenemanager)
   - [DataManager（搭配 items 資料集）](#72-datamanager搭配-items-資料集)
   - [ActorManager](#73-actormanager)
   - [擴充插件：魔法系統替 items 加欄位](#74-擴充插件魔法系統替-items-加欄位)
8. [編輯器解析慣例](#8-編輯器解析慣例)
9. [設計決策紀錄](#9-設計決策紀錄)

---

## 1. 背景與設計目標

Inkshot 視覺編輯器需要從各插件收集以下資訊以提供 UI：

- 該插件管理哪些**資料集合**，每個集合的欄位長什麼樣子？
- 哪些**事件命令**可以在腳本節點或快捷面板中使用？
- 哪些**場景類型**由該插件提供？

直接把這些資訊寫死在編輯器裡會造成引擎與編輯器的緊耦合。因此改為由插件透過 `editorMeta` **主動宣告**，編輯器動態讀取，達成解耦。

### 設計原則

| 原則 | 說明 |
|------|------|
| **引擎不感知** | 引擎永遠不讀取 `editorMeta`，格式變更不影響引擎行為 |
| **插件自定義** | 沒有任何保留 key，插件可以加任何自訂欄位 |
| **慣例勝於強制** | 本文件只是慣例，插件不遵守也不會報錯 |
| **編輯器負責解析** | 編輯器決定哪些 key 有意義、如何顯示 |

---

## 2. 頂層建議欄位

```ts
editorMeta: {
  // ─── 顯示資訊 ────────────────────────────────────────────
  displayName?: string;    // 在編輯器 UI 顯示的名稱，例如 'Scene Manager'
  description?: string;   // 一句話說明用途
  icon?:        string;   // 圖示識別碼（由編輯器定義識別碼集合）

  // ─── 資料格式 ────────────────────────────────────────────
  schemas?:          Record<string, SchemaObjectDef>;  // 本插件定義的資料集合 schema
  schemaExtensions?: SchemaExtension[];               // 對其他插件 schema 的擴充

  // ─── 功能宣告 ────────────────────────────────────────────
  events?: string[];             // 可在腳本/面板中使用的事件清單
  scenes?:   SceneTypeDef[];       // 本插件提供的場景類型（如有）

  // ─── 任意自訂欄位 ─────────────────────────────────────────
  [key: string]: unknown;          // 插件可自由加入其他鍵，編輯器可按需解析
}
```

---

## 3. schemas — 主資料結構定義

`schemas` 宣告「本插件管理的資料集合之欄位結構」。鍵值為集合名稱（與 `data/load` 的 `collection` 對應），值為 `EditorSchema` 物件。

### 格式

```ts
schemas: {
  [collectionName: string]: EditorSchema;
}

interface EditorSchema {
  displayName?: string;          // 編輯器顯示名稱
  icon?:        string;          // 圖示識別碼
  folder?:      string;          // 檔案存放資料夾（相對於專案根目錄）
  field?:       SchemaObjectDef; // 欄位結構定義（選用）
  [key: string]: unknown;        // 自訂額外屬性
}

interface SchemaObjectDef {
  type: 'object';
  label?:       string;          // 編輯器顯示名稱
  description?: string;
  properties:   Record<string, SchemaFieldDef>;
}

type SchemaFieldDef =
  | { type: 'string';  label?: string; description?: string; hidden?: boolean; default?: string }
  | { type: 'number';  label?: string; description?: string; hidden?: boolean; default?: number; min?: number; max?: number }
  | { type: 'boolean'; label?: string; description?: string; hidden?: boolean; default?: boolean }
  | { type: 'enum';    label?: string; description?: string; hidden?: boolean; options: string[]; default?: string }
  | { type: 'ref';     label?: string; description?: string; hidden?: boolean; ref: string }
  | { type: 'array';   label?: string; description?: string; hidden?: boolean; items: SchemaFieldDef }
  | { type: 'object';  label?: string; description?: string; hidden?: boolean; properties: Record<string, SchemaFieldDef> };
```

### 3.1 欄位型別一覽

| `type`    | 說明 | 額外屬性 |
|-----------|------|---------|
| `string`  | 單行文字 | `default` |
| `number`  | 數值 | `default`, `min`, `max` |
| `boolean` | 布林值 | `default` |
| `enum`    | 固定選項（下拉） | `options`, `default` |
| `ref`     | 參照另一個集合的 entry ID | `ref`（集合名稱） |
| `array`   | 陣列，元素類型由 `items` 指定 | `items` |
| `object`  | 巢狀物件 | `properties` |

### 3.2 陣列與巢狀物件

```ts
schemas: {
  enemies: {
    displayName: '敵人',
    folder: 'data',
    field: {
      type: 'object',
      properties: {
        name:   { type: 'string', label: '名稱' },
        hp:     { type: 'number', label: 'HP', default: 100, min: 1 },
        drops:  {
          type: 'array',
          label: '掉落物',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'ref', ref: 'items', label: '道具' },
              rate:   { type: 'number', label: '機率', min: 0, max: 1, default: 0.1 },
            },
          },
        },
      },
    },
  },
}
```

### 3.3 跨集合參照（ref）

`{ type: 'ref', ref: 'items' }` 告訴編輯器：這個欄位的值是 `items` 集合中某個 entry 的 ID。編輯器可以渲染成下拉選單，動態列出 `items` 集合的所有 key。

```ts
properties: {
  weaponId: { type: 'ref', ref: 'items',  label: '武器' },
  skillId:  { type: 'ref', ref: 'skills', label: '技能' },
}
```

### 3.4 列舉選項（enum）

```ts
properties: {
  element: {
    type: 'enum',
    label: '屬性',
    options: ['fire', 'water', 'wind', 'earth'],
    default: 'fire',
  },
}
```

### 3.5 隱藏欄位（hidden）

若某個欄位僅供引擎內部使用、不應在編輯器 UI 顯示，可加 `hidden: true`：

```ts
properties: {
  _internalVersion: { type: 'number', hidden: true },
}
```

---

## 4. schemaExtensions — 擴充其他插件的 schema

`schemaExtensions` 讓一個插件宣告「我要替某個已存在的 schema 加上額外欄位」，無需修改原始插件。

### 4.1 擴充格式

```ts
interface SchemaExtension {
  target:      string;                               // 被擴充的集合名稱
  properties:  Record<string, SchemaFieldDef>;       // 新增的欄位
  description?: string;                             // 說明為什麼需要這些欄位
}
```

### 4.2 擴充套疊規則（編輯器應遵守）

1. **合併策略**：擴充欄位與原始 schema 欄位**合併（merge）**，不取代整個 schema。
2. **後者優先**：若多個插件對同一欄位名稱有不同定義，後載入的插件覆蓋先前的。
3. **移除機制**：若擴充欄位設為 `null`，視為「移除該欄位的顯示」（隱藏，非刪除）。
4. **來源追蹤（建議）**：編輯器可記錄每個欄位的來源插件，方便 debug。

```ts
// 範例：魔法系統插件替 items 加入魔法屬性
schemaExtensions: [
  {
    target: 'items',
    description: '魔法系統新增的道具屬性',
    properties: {
      manaCost: { type: 'number', label: '魔力消耗', default: 0, min: 0 },
      spellId:  { type: 'ref',    label: '對應技能', ref: 'spells' },
    },
  },
],
```

---

## 5. events — 宣告可用的事件清單

`events` 是一個字串陣列，列出本插件監聽的所有事件。編輯器可用此清單在腳本節點面板或自動完成中顯示可用事件。

```ts
events: [
  'scene/load',
  'scene/unload',
  'scene/reload',
  'scene/preload',
]
```

若需要為每個事件提供更豐富的說明（參數、說明文字），可改為物件陣列格式，由插件自定義。引擎不限制格式：

```ts
events: [
  { event: 'inventory/item:use',  label: '使用道具', params: { itemId: 'string', actorId: 'string' } },
  { event: 'inventory/item:drop', label: '丟棄道具', params: { itemId: 'string' } },
]
```

---

## 6. scenes — 宣告場景類型（選用）

若插件提供可在場景管理器中使用的場景類型（例如戰鬥場景、對話場景），可透過 `scenes` 宣告：

```ts
scenes: [
  {
    type:        'battle',
    label:       '戰鬥場景',
    description: '啟動回合制戰鬥',
    schema: {
      type: 'object',
      properties: {
        bgm:       { type: 'string',  label: '背景音樂' },
        enemyIds:  { type: 'array',   label: '敵人清單', items: { type: 'ref', ref: 'enemies' } },
        allowFlee: { type: 'boolean', label: '允許逃跑', default: true },
      },
    },
  },
]
```

---

## 7. 完整範例：內建插件的 editorMeta 示意

以下是幾個內建插件若要加上 `editorMeta` 時的**示意格式**，供編輯器與插件開發者參考。（目前這些插件尚未實際宣告 `editorMeta`；此處僅為格式慣例示範。）

### 7.1 SceneManager

```ts
const sceneManagerPlugin: EnginePlugin = {
  namespace: 'scene',
  editorMeta: {
    displayName: 'Scene Manager',
    description: '場景切換、預載入與非同步場景載入',
    icon: 'scene',
    events: [
      'scene/load',
      'scene/unload',
      'scene/reload',
      'scene/preload',
    ],
    schemas: {
      scenes: {
        displayName: '場景',
        folder: 'scenes',
        field: {
          type: 'object',
          properties: {
            key:        { type: 'string',  label: '場景 Key', description: '用於 scene/load 的唯一識別碼' },
            pluginUrl:  { type: 'string',  label: '模組 URL', description: '動態 import 的場景模組路徑' },
            preloadBundles: { type: 'array', label: '預載資源包', items: { type: 'string' } },
          },
        },
      },
    },
  },
  init(core) { /* ... */ },
};
```

### 7.2 DataManager（搭配 items 資料集）

```ts
const itemDataPlugin: EnginePlugin = {
  namespace: 'myGame/items',
  editorMeta: {
    displayName: 'Items Data',
    description: '遊戲道具的資料定義',
    icon: 'backpack',
    events: [
      'data/load',
      'data/get',
      'data/getAll',
      'data/unload',
    ],
    schemas: {
      items: {
        displayName: '道具',
        folder: 'data',
        field: {
          type: 'object',
          properties: {
            name:        { type: 'string',  label: '名稱' },
            description: { type: 'string',  label: '說明' },
            price:       { type: 'number',  label: '售價', default: 0, min: 0 },
            stackable:   { type: 'boolean', label: '可堆疊', default: true },
            maxStack:    { type: 'number',  label: '最大堆疊', default: 99, min: 1 },
            category:    {
              type: 'enum',
              label: '類型',
              options: ['weapon', 'armor', 'consumable', 'key'],
              default: 'consumable',
            },
            iconKey: { type: 'string', label: '圖示 Key' },
          },
        },
      },
    },
  },
  init(core) { /* ... */ },
};
```

### 7.3 ActorManager

```ts
const actorManagerPlugin: EnginePlugin = {
  namespace: 'actor',
  editorMeta: {
    displayName: 'Actor Manager',
    description: '角色／NPC 定義、生成與觸發器管理',
    icon: 'person',
    events: [
      'actor/define',
      'actor/spawn',
      'actor/despawn',
      'actor/state:set',
      'actor/state:patch',
      'actor/state:get',
      'actor/trigger',
    ],
    schemas: {
      actors: {
        displayName: '角色定義（ActorDef）',
        folder: 'actors',
        field: {
          type: 'object',
          properties: {
            scripts: {
              type: 'array',
              label: '腳本清單',
              items: {
                type: 'object',
                properties: {
                  id:      { type: 'string', label: '腳本 ID' },
                  trigger: { type: 'string', label: '觸發事件' },
                  mode:    { type: 'enum', label: '模式', options: ['concurrent', 'blocking'], default: 'concurrent' },
                },
              },
            },
            initialState: {
              type: 'object',
              label: '初始狀態',
              properties: {
                // 由遊戲自訂；此處僅示意
                alive: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
    },
  },
  init(core) { /* ... */ },
};
```

### 7.4 擴充插件：魔法系統替 items 加欄位

```ts
const magicSystemPlugin: EnginePlugin = {
  namespace: 'magic',
  dependencies: ['myGame/items'],
  editorMeta: {
    displayName: 'Magic System',
    description: '為道具和角色增加魔法屬性',
    icon: 'wand',
    events: [
      'magic/cast',
      'magic/learn',
      'magic/forget',
    ],
    // ── 本插件自己的資料集 ─────────────────────────────────
    schemas: {
      spells: {
        displayName: '技能',
        folder: 'data',
        field: {
          type: 'object',
          properties: {
            name:     { type: 'string', label: '技能名稱' },
            manaCost: { type: 'number', label: '魔力消耗', default: 10, min: 0 },
            element:  { type: 'enum',   label: '屬性', options: ['fire', 'water', 'wind', 'earth', 'none'], default: 'none' },
            damage:   { type: 'number', label: '基礎傷害', default: 0, min: 0 },
          },
        },
      },
    },
    // ── 擴充已存在的 items schema ─────────────────────────
    schemaExtensions: [
      {
        target: 'items',
        description: '魔法系統為道具加入施法相關屬性',
        properties: {
          spellId:  { type: 'ref',    label: '附帶技能',   ref: 'spells' },
          manaCost: { type: 'number', label: '額外魔力消耗', default: 0, min: 0 },
          isStaff:  { type: 'boolean', label: '法杖類型', default: false },
        },
      },
    ],
  },
  init(core) { /* ... */ },
};
```

---

## 8. 編輯器解析慣例

以下是編輯器消費 `editorMeta` 時的**建議處理邏輯**。

### 收集所有插件的 editorMeta

```ts
// 取得所有已載入插件的 editorMeta（含 undefined 過濾）
const allMeta = plugins
  .filter(p => p.editorMeta != null)
  .map(p => ({ namespace: p.namespace, meta: p.editorMeta! }));
```

### 合併 schemas + schemaExtensions

```ts
function buildMergedSchemas(allMeta: Array<{ namespace: string; meta: Record<string, unknown> }>) {
  // ① 先收集所有主 schema
  const merged: Record<string, EditorSchema> = {};
  for (const { meta } of allMeta) {
    if (meta.schemas && typeof meta.schemas === 'object') {
      Object.assign(merged, meta.schemas);
    }
  }

  // ② 再套用所有擴充（針對 field.properties 合併）
  for (const { meta } of allMeta) {
    const exts = meta.schemaExtensions as SchemaExtension[] | undefined;
    if (!Array.isArray(exts)) continue;
    for (const ext of exts) {
      const target = merged[ext.target];
      if (!target?.field) {
        console.warn(`[editor] schemaExtension 的 target "${ext.target}" 不存在或無 field，略過`);
        continue;
      }
      // null 表示移除該欄位
      for (const [key, def] of Object.entries(ext.properties)) {
        if (def === null) {
          delete target.field.properties[key];
        } else {
          target.field.properties[key] = def as SchemaFieldDef;
        }
      }
    }
  }

  return merged;
}
```

### 收集所有可用事件

```ts
function collectEvents(allMeta: Array<{ namespace: string; meta: Record<string, unknown> }>) {
  const events: Array<{ namespace: string; event: string }> = [];
  for (const { namespace, meta } of allMeta) {
    const evts = meta.events;
    if (!Array.isArray(evts)) continue;
    for (const evt of evts) {
      // 支援字串與物件兩種格式
      if (typeof evt === 'string') {
        events.push({ namespace, event: evt });
      } else if (typeof evt === 'object' && evt !== null && 'event' in evt) {
        events.push({ namespace, ...(evt as object) });
      }
    }
  }
  return events;
}
```

---

## 9. 設計決策紀錄

| 決策 | 選擇 | 理由 |
|------|------|------|
| 型別設計 | `Record<string, unknown>` | 完全開放，不預設任何 key；引擎不需要知道格式 |
| 主 vs 擴充分離 | `schemas` + `schemaExtensions` | 讓依賴插件可以非侵入式地擴充資料模型，無需修改原始插件 |
| schema 欄位格式 | 簡化 JSON Schema 子集 | JSON Schema 過於複雜；簡化版足以描述遊戲資料，且編輯器容易渲染 |
| `events` 字串/物件二元格式 | 兩者皆允許 | 簡單場景用字串；需要參數說明時用物件；向後相容 |
| 衝突解決 | 後者覆蓋前者 | 明確且簡單；插件如需配合優先權可調整載入順序 |
| 引擎不驗證 | 不驗證 | 零運行期成本，編輯器可離線工具（lint/validate）在 build time 檢查 |

---

## 延伸閱讀

- [`src/types/plugin.ts`](../../src/types/plugin.ts) — `EnginePlugin` 介面與 `editorMeta` 欄位的 JSDoc
- [ARCHITECTURE.md §3.5](../../ARCHITECTURE.md) — 引擎架構文件中的 Editor Metadata 說明（英文）
- [plugin-development.md](../plugin-development.md) — 如何從頭撰寫一個插件
