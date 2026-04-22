# JSON 資料格式參考

本文件說明 inkshot-engine 所有以 JSON / 純物件描述的資料格式，包括 RPG 遊戲資料、腳本定義、Tilemap、i18n 語系檔及存檔資料。

---

## 目錄

1. [RPG 遊戲資料（`RpgGameData`）](#1-rpg-遊戲資料rpggamedata)
   - [頂層結構](#11-頂層結構)
   - [meta — 遊戲元資料](#12-meta--遊戲元資料)
   - [classes — 職業定義](#13-classes--職業定義)
   - [actors — 角色定義](#14-actors--角色定義)
   - [items — 道具定義](#15-items--道具定義)
   - [statusEffects — 狀態效果定義](#16-statuseffects--狀態效果定義)
   - [scripts — 獨立腳本定義](#17-scripts--獨立腳本定義)
2. [腳本節點（`ScriptDef` / `ScriptNode`）](#2-腳本節點scriptdef--scriptnode)
   - [腳本格式](#21-腳本格式)
   - [內建命令速查](#22-內建命令速查)
   - [命令詳細說明](#23-命令詳細說明)
3. [Tilemap 資料（`TilemapData`）](#3-tilemap-資料tilemapdata)
   - [TilemapData 頂層結構](#31-tilemapdata-頂層結構)
   - [TilesetDef — 圖塊集定義](#32-tilesetdef--圖塊集定義)
   - [TilemapLayerDef — 圖層定義](#33-tilemaplayer-def--圖層定義)
   - [AnimatedTileDef — 動畫圖塊](#34-animatedtiledef--動畫圖塊)
   - [AutotileGroupDef — 自動圖塊](#35-autotilegroupdef--自動圖塊)
4. [i18n 語系檔](#4-i18n-語系檔)
5. [存檔資料（Save Data）](#5-存檔資料save-data)
6. [完整 RpgGameData 範例](#6-完整-rpggamedata-範例)

---

## 1. RPG 遊戲資料（`RpgGameData`）

`RpgGameData` 是描述一款 RPG 遊戲所有靜態資料的根物件。  
使用 `registerRpgData()` 可一次完成所有定義注入；或先呼叫 `loadRpgData()` 取得轉換結果後手動注入。

```ts
import { registerRpgData } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

// 可直接定義於程式碼中
const gameData: RpgGameData = { /* ... */ };

// 也可以從 JSON 檔案讀取
// const gameData = await fetch('/data/game.json').then(r => r.json()) as RpgGameData;

// ✅ 推薦：一行注入引擎
registerRpgData(core, gameData);

// 或在 createRpgEngine 時傳入（效果相同）：
// await createRpgEngine({ container: '#app', gameData });
```

若需要手動逐一注入（進階用法），仍可使用 `loadRpgData()`：

```ts
import { loadRpgData } from '@inkshot/engine';

const data = loadRpgData(gameData);
// 使用 data.actors、data.items、data.expCurves 等逐一注入
```

---

### 1.1 頂層結構

```jsonc
{
  "meta": { /* 遊戲元資料 */ },
  "classes": [ /* 職業定義陣列 */ ],
  "actors": [ /* 角色定義陣列 */ ],
  "items": [ /* 道具定義陣列 */ ],
  "statusEffects": [ /* 狀態效果定義陣列 */ ],
  "scripts": [ /* 獨立腳本定義陣列 */ ]
}
```

所有欄位均為選填，只需包含遊戲實際使用的部分。

---

### 1.2 `meta` — 遊戲元資料

```jsonc
{
  "meta": {
    "title": "我的 RPG",        // 遊戲標題（字串，可選）
    "version": "1.0.0",         // 版本字串（可選）
    "locale": "zh-TW",          // 預設語系代碼（可選，預設 "en"）
    "initialGold": 100,         // 起始金幣（數字，可選，預設 0）
    "initialVariables": {       // 遊戲開始時注入 VariableStoreManager 的初始值（可選）
      "flags.tutorial": false,
      "counters.battles": 0
    }
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `title` | `string` | 否 | 遊戲標題 |
| `version` | `string` | 否 | 版本字串 |
| `locale` | `string` | 否 | 預設語系，傳給 `LocalizationManager`（預設 `"en"`） |
| `initialGold` | `number` | 否 | 新遊戲的起始金幣（預設 `0`） |
| `initialVariables` | `Record<string, unknown>` | 否 | 初始變數值，注入 `VariableStoreManager` |

---

### 1.3 `classes` — 職業定義

每個職業（class）會在 `loadRpgData()` 輸出中產生一組 **經驗曲線（ExpCurveDef）** 和 **基礎屬性（StatProfileDef）**。

```jsonc
{
  "classes": [
    {
      "id": "warrior",          // 唯一識別符（必填）
      "name": "戰士",            // 顯示名稱（可選）
      "expCurve": {
        "base": 30,             // 基礎係數（預設 30）
        "exp": 2,               // 指數（預設 2）
        "extra": 0,             // 額外線性係數（預設 0）
        "maxLevel": 99          // 最高等級（預設 99）
      },
      "baseStats": {
        // 1 級基礎數值，可使用任意鍵名
        "hp": 120,
        "hpMax": 120,
        "mp": 30,
        "mpMax": 30,
        "atk": 15,
        "def": 10,
        "agi": 8,
        "luk": 5
      }
    },
    {
      "id": "mage",
      "name": "法師",
      "expCurve": { "base": 25, "exp": 2.2 },
      "baseStats": { "hp": 60, "hpMax": 60, "mp": 100, "mpMax": 100, "atk": 8, "def": 4, "agi": 10 }
    }
  ]
}
```

**經驗值公式：** `exp(level) = base × level ^ exp + extra × level`

> 注意：`hp` 和 `hpMax` 若只提供其中一個，`loadRpgData()` 會自動補齊另一個。`mp`/`mpMax` 同理。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | `string` | **是** | 唯一識別符 |
| `name` | `string` | 否 | 顯示名稱 |
| `expCurve.base` | `number` | 否 | 基礎係數（預設 `30`） |
| `expCurve.exp` | `number` | 否 | 指數（預設 `2`） |
| `expCurve.extra` | `number` | 否 | 額外線性係數（預設 `0`） |
| `expCurve.maxLevel` | `number` | 否 | 最高等級（預設 `99`） |
| `baseStats` | `Record<string, number>` | 否 | 1 級基礎屬性值 |

---

### 1.4 `actors` — 角色定義

角色（actor）是遊戲中的 NPC、Boss、主角等實體的藍圖。  
每個 actor 定義可透過 `actor/spawn` 事件建立多個獨立實例。

```jsonc
{
  "actors": [
    {
      "id": "hero",                   // 唯一識別符（必填）
      "name": "勇者",                  // 顯示名稱（可選）
      "classId": "warrior",           // 對應 classes 中的 id，繼承屬性與經驗曲線（可選）
      "initialLevel": 1,              // 起始等級（可選，預設 1）
      "initialState": {               // 初始狀態值（可選，會合併至 state 中）
        "isPlayer": true,
        "portrait": "hero.png"
      },
      "scripts": [
        // 此角色使用的腳本（格式見第 2 節）
      ],
      "triggers": [
        // 觸發器定義（格式見下方）
      ]
    },
    {
      "id": "merchant",
      "name": "商人",
      "initialState": { "isAvailable": true, "gold": 500 },
      "scripts": [
        {
          "id": "merchant-greet",
          "nodes": [
            { "cmd": "say", "text": "歡迎光臨！", "speaker": "商人" },
            { "cmd": "end" }
          ]
        }
      ],
      "triggers": [
        {
          "id": "on-interact",
          "event": "player/interact",
          "script": "merchant-greet",
          "mode": "blocking",
          "priority": 10,
          "onEnd": "nothing"
        }
      ]
    }
  ]
}
```

#### Trigger 欄位說明

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | `string` | **是** | 此 actor 內的唯一識別符 |
| `event` | `string` | **是** | 觸發此 trigger 的 EventBus 事件名稱 |
| `script` | `string` | **是** | 要執行的腳本 `id`（必須在此 actor 的 `scripts` 中） |
| `mode` | `'concurrent' \| 'blocking'` | 否 | 預設 `'blocking'`。`concurrent`：與現有腳本並行；`blocking`：佔用主要執行通道 |
| `priority` | `number` | 否 | 預設 `10`。較高優先權可搶佔同通道中較低優先權的腳本 |
| `onEnd` | `'restore' \| 'nothing' \| string` | 否 | 預設 `'nothing'`。`restore`：腳本結束後重新啟動被搶佔的腳本；`<scriptId>`：改為執行指定腳本 |

> **注意：** JSON 格式的 triggers 不支援 `condition`（條件函式）和 `varsFromEvent`（事件變數萃取函式），這些功能需要以程式碼定義的 `ActorDef` 才能使用。

---

### 1.5 `items` — 道具定義

```jsonc
{
  "items": [
    {
      "id": "potion",                   // 唯一識別符（必填）
      "name": "藥水",                    // 顯示名稱（必填）
      "description": "恢復 100 HP",      // 說明文字（可選）
      "category": "item",               // 分類（必填）：item | weapon | armor | accessory | key
      "price": 50,                      // 商店售價（可選）
      "maxStack": 99,                   // 最大堆疊數量（可選，預設 99）
      "useScriptId": "potion-use"       // 使用時執行的腳本 id（可選，僅 category=item 有效）
    },
    {
      "id": "iron-sword",
      "name": "鐵劍",
      "category": "weapon",
      "price": 200,
      "maxStack": 1,
      "equipModifiers": [               // 裝備加成（可選，weapon/armor/accessory 使用）
        { "stat": "atk", "value": 10, "mode": "add" }
      ]
    },
    {
      "id": "iron-shield",
      "name": "鐵盾",
      "category": "armor",
      "price": 150,
      "maxStack": 1,
      "equipModifiers": [
        { "stat": "def", "value": 8, "mode": "add" },
        { "stat": "agi", "value": -2, "mode": "add" }
      ]
    },
    {
      "id": "town-key",
      "name": "城鎮鑰匙",
      "category": "key",
      "price": 0,
      "maxStack": 1
    }
  ]
}
```

#### `equipModifiers` 欄位

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `stat` | `string` | **是** | 影響的屬性鍵（如 `atk`、`def`、`agi`） |
| `value` | `number` | **是** | 加成值 |
| `mode` | `'add' \| 'multiply'` | 否 | 套用方式：`add`（加法，預設）或 `multiply`（乘法） |

> 道具可加入任意自訂欄位，引擎不會過濾額外屬性。

---

### 1.6 `statusEffects` — 狀態效果定義

```jsonc
{
  "statusEffects": [
    {
      "id": "poison",                   // 唯一識別符（必填）
      "name": "毒素",                    // 顯示名稱（必填）
      "modifiers": [                    // 屬性修改器陣列（必填，可為空陣列）
        { "stat": "atk", "value": 0.8, "mode": "multiply" }
      ],
      "duration": 15000,               // 持續時間（毫秒，可選，省略則永久）
      "tickDamage": 5,                 // 每 tick 的傷害（可選，負值為治療）
      "tickMs": 1000                   // tick 間隔（毫秒，可選，預設 1000）
    },
    {
      "id": "haste",
      "name": "加速",
      "modifiers": [
        { "stat": "agi", "value": 1.5, "mode": "multiply" }
      ],
      "duration": 10000
    },
    {
      "id": "regen",
      "name": "再生",
      "modifiers": [],                  // 無屬性修改，僅觸發持續治療
      "duration": 20000,
      "tickDamage": -10,               // 負值 = 每 tick 恢復 10 HP
      "tickMs": 2000
    }
  ]
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | `string` | **是** | 唯一識別符 |
| `name` | `string` | **是** | 顯示名稱 |
| `modifiers` | `StatModifier[]` | **是** | 屬性修改器列表（可為空陣列） |
| `duration` | `number` | 否 | 持續時間（毫秒），省略則永久有效 |
| `tickDamage` | `number` | 否 | 每 tick 傷害（正值）或治療（負值） |
| `tickMs` | `number` | 否 | Tick 間隔（毫秒，預設 `1000`） |

---

### 1.7 `scripts` — 獨立腳本定義

與角色無關的獨立腳本，用於過場、公共事件等。腳本格式與 actors 中的 scripts 相同，詳見[第 2 節](#2-腳本節點scriptdef--scriptnode)。

```jsonc
{
  "scripts": [
    {
      "id": "intro-cutscene",
      "nodes": [
        { "cmd": "emit", "event": "game/state:set", "params": { "phase": "cutscene" } },
        { "cmd": "say", "text": "很久很久以前……", "speaker": "旁白" },
        { "cmd": "wait", "ms": 500 },
        { "cmd": "say", "text": "這個世界陷入了黑暗之中。", "speaker": "旁白" },
        { "cmd": "emit", "event": "game/state:set", "params": { "phase": "playing" } },
        { "cmd": "end" }
      ]
    }
  ]
}
```

---

## 2. 腳本節點（`ScriptDef` / `ScriptNode`）

### 2.1 腳本格式

```jsonc
{
  "id": "my-script",      // 唯一識別符（必填）
  "nodes": [              // 命令節點陣列（必填）
    { "cmd": "say",  "text": "Hello!", "speaker": "Alice" },
    { "cmd": "wait", "ms": 1000 },
    { "cmd": "end" }
  ]
}
```

每個節點 **必須** 包含 `cmd` 欄位；其他欄位依命令不同而異。

---

### 2.2 內建命令速查

| 命令 | 說明 |
|------|------|
| [`label`](#label) | 位置標記（執行期無作用） |
| [`jump`](#jump) | 無條件跳至標記 |
| [`if`](#if--if-not--if-gt--if-lt) | 條件跳躍（等於） |
| [`if-not`](#if--if-not--if-gt--if-lt) | 條件跳躍（不等於） |
| [`if-gt`](#if--if-not--if-gt--if-lt) | 條件跳躍（數值大於） |
| [`if-lt`](#if--if-not--if-gt--if-lt) | 條件跳躍（數值小於） |
| [`set`](#set) | 設定腳本變數 |
| [`wait`](#wait) | 等待指定毫秒 |
| [`emit`](#emit) | 發送 EventBus 事件 |
| [`say`](#say) | 顯示對話文字並等待推進 |
| [`choices`](#choices) | 顯示選項並記錄選擇 |
| [`end`](#end) | 關閉對話視窗 |
| [`wait-event`](#wait-event) | 等待事件觸發（可選逾時） |
| [`call`](#call) | 內嵌執行子腳本（等待完成） |
| [`fork`](#fork) | 啟動並行腳本（不等待） |
| [`wait-instance`](#wait-instance) | 等待指定實例結束 |
| [`stop-instance`](#stop-instance) | 停止指定實例 |

---

### 2.3 命令詳細說明

#### `label`

位置標記，供 `jump`、`if` 等命令跳轉用，執行期為無作用（no-op）。

```jsonc
{ "cmd": "label", "name": "loop-start" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `name` | `string` | **是** | 標記名稱，同一腳本內不得重複 |

---

#### `jump`

無條件跳至指定標記。

```jsonc
{ "cmd": "jump", "target": "loop-start" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `target` | `string` | **是** | 目標標記名稱（`label` 的 `name` 值） |

---

#### `if` / `if-not` / `if-gt` / `if-lt`

條件跳躍：

```jsonc
{ "cmd": "if",     "var": "choice", "value": 0, "jump": "option-a" }
{ "cmd": "if-not", "var": "flags.done", "value": true, "jump": "not-done" }
{ "cmd": "if-gt",  "var": "counters.kills", "value": 10, "jump": "quest-done" }
{ "cmd": "if-lt",  "var": "hp", "value": 20, "jump": "low-hp-warning" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `var` | `string` | **是** | 要比較的腳本變數鍵名 |
| `value` | `unknown` | **是** | 比較值（`if`/`if-not` 使用嚴格相等；`if-gt`/`if-lt` 使用數值比較） |
| `jump` | `string` | **是** | 條件成立時跳至的標記名稱 |

---

#### `set`

設定腳本變數值。

```jsonc
{ "cmd": "set", "var": "choice", "value": 0 }
{ "cmd": "set", "var": "flags.met-king", "value": true }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `var` | `string` | **是** | 變數鍵名 |
| `value` | `unknown` | **是** | 要設定的值 |

---

#### `wait`

暫停腳本執行指定時間。

```jsonc
{ "cmd": "wait", "ms": 2000 }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `ms` | `number` | **是** | 等待毫秒數 |

---

#### `emit`

同步發送一個 EventBus 事件。

```jsonc
{ "cmd": "emit", "event": "audio/play", "params": { "key": "battle-bgm", "loop": true } }
{ "cmd": "emit", "event": "game/state:set", "params": { "phase": "cutscene" } }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `event` | `string` | **是** | EventBus 事件名稱 |
| `params` | `object` | 否 | 傳遞給事件的參數物件 |

---

#### `say`

顯示對話文字，並等待玩家推進（點擊或按鍵）。  
需要 `DialogueManager` 插件。

```jsonc
{ "cmd": "say", "text": "你好，勇者！", "speaker": "村長" }
{ "cmd": "say", "text": "[color=#ff0]警告！[/color]前方有危險。", "speed": 0.5 }
{ "cmd": "say", "text": "……", "portrait": "npc-sad.png", "speed": 0.3 }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `text` | `string` | 否 | 對話文字（支援 Rich-text 標記） |
| `speaker` | `string` | 否 | 說話者名稱 |
| `portrait` | `string` | 否 | 說話者頭像圖片鍵名 |
| `speed` | `number` | 否 | 打字速度倍率（`1.0` 為正常速度，`0.5` 較慢） |

**Rich-text 標記：**

| 標記 | 說明 | 範例 |
|------|------|------|
| `[color=#rrggbb]…[/color]` | 文字顏色 | `[color=#ff0000]紅色文字[/color]` |
| `[speed=n]…[/speed]` | 打字速度 | `[speed=0.3]緩慢打字[/speed]` |
| `[pause=ms]` | 打字中暫停 | `[pause=500]` |

---

#### `choices`

顯示選項列表，玩家選擇後將選項索引（0-based）存入變數。  
需要 `DialogueManager` 插件。

```jsonc
{
  "cmd": "choices",
  "choices": ["購買道具", "查看任務", "離開"],
  "prompt": "請選擇：",
  "var": "menuChoice"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `choices` | `string[]` | **是** | 選項文字陣列 |
| `prompt` | `string` | 否 | 選項前顯示的提示文字 |
| `var` | `string` | 否 | 儲存選擇結果的變數鍵名（0-based 索引） |

---

#### `end`

關閉對話視窗（發送 `dialogue/end` 事件）。

```jsonc
{ "cmd": "end" }
```

無額外欄位。

---

#### `wait-event`

暫停腳本，直到指定事件觸發。可設定逾時時間與逾時後的跳轉標記。

```jsonc
{ "cmd": "wait-event", "event": "player/interact", "var": "interactPayload" }
{ "cmd": "wait-event", "event": "battle/ended", "timeout": 30000, "timeoutJump": "timeout-fallback" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `event` | `string` | **是** | 要等待的 EventBus 事件名稱 |
| `var` | `string` | 否 | 將事件 payload 存入的變數鍵名 |
| `timeout` | `number` | 否 | 逾時時間（毫秒） |
| `timeoutJump` | `string` | 否 | 逾時後跳至的標記名稱 |

---

#### `call`

內嵌執行一個子腳本，等待其完成後才繼續執行。

```jsonc
{ "cmd": "call", "id": "common-greeting" }
{ "cmd": "call", "id": "battle-intro", "vars": { "enemyId": "boss-1" } }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | `string` | **是** | 要呼叫的腳本 `id`（必須已用 `script/define` 登錄） |
| `vars` | `object` | 否 | 傳入子腳本的初始變數 |

---

#### `fork`

啟動一個並行腳本實例（fire-and-forget），不等待其完成。

```jsonc
{ "cmd": "fork", "id": "ambient-sound-loop", "instanceId": "ambient" }
{ "cmd": "fork", "id": "npc-patrol", "instanceId": "guard-2", "priority": 0 }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | `string` | **是** | 要啟動的腳本 `id` |
| `instanceId` | `string` | 否 | 實例識別符（省略則使用腳本 `id`） |
| `vars` | `object` | 否 | 傳入腳本的初始變數 |
| `priority` | `number` | 否 | 腳本執行優先權（預設 `0`） |

---

#### `wait-instance`

等待指定腳本實例執行完畢後才繼續。通常與 `fork` 搭配使用。

```jsonc
{ "cmd": "fork",          "id": "battle-animation", "instanceId": "anim" }
{ "cmd": "wait-instance", "instanceId": "anim" }
{ "cmd": "say",           "text": "戰鬥結束！" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `instanceId` | `string` | **是** | 要等待的實例識別符 |

---

#### `stop-instance`

停止指定腳本實例。

```jsonc
{ "cmd": "stop-instance", "instanceId": "ambient" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `instanceId` | `string` | **是** | 要停止的實例識別符 |

---

## 3. Tilemap 資料（`TilemapData`）

### 3.1 TilemapData 頂層結構

```jsonc
{
  "id": "world-map",               // 唯一識別符（必填）
  "tileWidth": 32,                 // 單格寬度（像素，必填）
  "tileHeight": 32,                // 單格高度（像素，必填）
  "tilesets": [ /* TilesetDef[] */ ],
  "layers": [ /* TilemapLayerDef[] */ ],
  "animatedTiles": {               // 動畫圖塊定義（可選，鍵為全域 tile ID）
    "101": { "frames": [ { "tileId": 101, "duration": 200 }, { "tileId": 102, "duration": 200 } ] }
  },
  "autotileGroups": [ /* AutotileGroupDef[] */ ],  // 自動圖塊定義（可選）
  "tileCollisionMap": {            // tile 碰撞形狀（可選）
    "5": "solid",
    "8": "one-way"
  }
}
```

---

### 3.2 `TilesetDef` — 圖塊集定義

```jsonc
{
  "firstgid": 1,           // 此 tileset 的第一個全域 tile ID（通常 1 表示第一個）
  "name": "dungeon",       // 顯示名稱
  "textureKey": "tileset-dungeon",  // 已透過 assets/load 載入的紋理鍵名
  "tileWidth": 32,         // 每格寬度（像素）
  "tileHeight": 32,        // 每格高度（像素）
  "columns": 16,           // atlas 的欄數（可選，省略則自動計算）
  "spacing": 0,            // tile 間距（像素，可選，預設 0）
  "margin": 0              // atlas 邊框（像素，可選，預設 0）
}
```

> Tile ID `0` 恆為「空格」，圖層中值為 `0` 表示該格無圖塊。

---

### 3.3 `TilemapLayerDef` — 圖層定義

```jsonc
{
  "name": "ground",        // 圖層名稱
  "width": 50,             // 圖層寬度（以格數計）
  "height": 50,            // 圖層高度（以格數計）
  "data": [                // 一維 tile ID 陣列，長度 = width × height，按 row-major 排列
    1, 2, 3, 0, 0, 1, /* … */
  ],
  "visible": true,         // 是否可見（可選，預設 true）
  "opacity": 1.0,          // 不透明度（可選，0.0–1.0，預設 1.0）
  "zIndex": 0,             // 渲染排序（可選，預設 0）
  "collisionEnabled": true // 是否啟用碰撞（可選，預設 false）
}
```

---

### 3.4 `AnimatedTileDef` — 動畫圖塊

```jsonc
{
  "animatedTiles": {
    "101": {
      "frames": [
        { "tileId": 101, "duration": 150 },
        { "tileId": 102, "duration": 150 },
        { "tileId": 103, "duration": 150 }
      ]
    }
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `frames[].tileId` | `number` | **是** | 此影格顯示的全域 tile ID |
| `frames[].duration` | `number` | **是** | 此影格持續時間（毫秒） |

---

### 3.5 `AutotileGroupDef` — 自動圖塊

```jsonc
{
  "autotileGroups": [
    {
      "id": "water",            // 唯一識別符
      "mode": "4bit",           // 自動圖塊模式："4bit"（4 鄰）或 "8bit"（8 鄰）
      "tileMap": {              // bitmask 值 → tile ID 的對應表
        "0":   32,
        "1":   33,
        "2":   34,
        "15":  47
      }
    }
  ]
}
```

---

## 4. i18n 語系檔

i18n 語系檔為純 JSON 物件，鍵值為巢狀結構，最終值為字串或複數物件。  
使用 `i18n/load` 事件載入，`i18n/t` 事件取得翻譯。

```jsonc
// /assets/i18n/zh-TW.json
{
  "ui": {
    "confirm": "確認",
    "cancel": "取消",
    "back": "返回"
  },
  "menu": {
    "title": "主選單",
    "newGame": "開始遊戲",
    "loadGame": "讀取存檔",
    "settings": "設定",
    "quit": "離開遊戲"
  },
  "battle": {
    "attack": "攻擊",
    "skill": "技能",
    "item": "道具",
    "flee": "逃跑",
    "victory": "勝利！",
    "defeat": "失敗……"
  },
  "items": {
    "potion": {
      "name": "藥水",
      "description": "恢復 {{amount}} HP"
    }
  },
  "achievement": {
    "firstBattle": {
      "one": "完成了第 1 場戰鬥",
      "other": "完成了 {{count}} 場戰鬥"
    }
  }
}
```

### 插值語法

在翻譯字串中使用 `{{key}}` 插入動態值：

```ts
// 取得帶插值的翻譯
const { output } = core.events.emitSync('i18n/t', {
  key: 'items.potion.description',
  params: { amount: 100 },
});
// output.value => "恢復 100 HP"
```

### 複數化

對於需要複數形式的字串，使用包含 `one`/`other` 鍵的物件（遵循 [ICU 複數規則](https://unicode-org.github.io/icu/userguide/format_parse/messages/)）：

```ts
const { output } = core.events.emitSync('i18n/t', {
  key: 'achievement.firstBattle',
  params: { count: 5 },
});
// output.value => "完成了 5 場戰鬥"
```

---

## 5. 存檔資料（Save Data）

存檔資料由 `SaveManager` 管理，以 `save/slot:save` 持久化（預設存入 `localStorage`）。  
存檔格式為純 JSON，以下為持久化後的結構參考：

```jsonc
// 存檔槽（slot）
{
  "meta": {
    "id": "slot-1",           // 槽 ID
    "name": "存檔 1",          // 顯示名稱
    "createdAt": 1700000000000, // 建立時間（Unix ms）
    "updatedAt": 1700001234567, // 最後更新時間（Unix ms）
    "version": 1              // 存檔格式版本（由 SaveMigrationPlugin 管理）
  },
  "data": {
    // 完全由遊戲決定——任意鍵值對
    "playerHp": 85,
    "playerGold": 320,
    "mapId": "dungeon-1",
    "variables": { /* VariableStoreManager 快照 */ },
    "inventory": { /* InventorySystem 快照 */ }
  }
}

// 全域存檔（cross-slot，不屬於任何槽）
{
  "data": {
    "achievements": { /* AchievementPlugin 快照 */ },
    "totalPlayTime": 12345
  },
  "updatedAt": 1700001234567,
  "version": 1
}
```

> 存檔的 `data` 欄位結構完全由遊戲開發者自訂，引擎不規範其內部格式。  
> 建議搭配 `SaveMigrationPlugin` 管理存檔版本升級。

---

## 6. 完整 RpgGameData 範例

以下為一個可直接使用的完整 `RpgGameData` JSON 範例，包含職業、角色、道具、狀態效果與腳本：

```jsonc
{
  "meta": {
    "title": "勇者傳說",
    "version": "1.0.0",
    "locale": "zh-TW",
    "initialGold": 100,
    "initialVariables": {
      "flags.tutorial-done": false,
      "counters.battles": 0
    }
  },

  "classes": [
    {
      "id": "warrior",
      "name": "戰士",
      "expCurve": { "base": 30, "exp": 2, "maxLevel": 50 },
      "baseStats": { "hp": 150, "hpMax": 150, "mp": 20, "mpMax": 20, "atk": 18, "def": 12, "agi": 8, "luk": 5 }
    },
    {
      "id": "mage",
      "name": "法師",
      "expCurve": { "base": 25, "exp": 2.2, "maxLevel": 50 },
      "baseStats": { "hp": 70, "hpMax": 70, "mp": 120, "mpMax": 120, "atk": 6, "def": 4, "agi": 12, "luk": 8 }
    }
  ],

  "actors": [
    {
      "id": "hero",
      "name": "勇者",
      "classId": "warrior",
      "initialLevel": 1,
      "initialState": { "isPlayer": true }
    },
    {
      "id": "village-elder",
      "name": "村長",
      "initialState": { "isTalked": false },
      "scripts": [
        {
          "id": "elder-talk",
          "nodes": [
            { "cmd": "say", "text": "歡迎來到勇者村！", "speaker": "村長" },
            {
              "cmd": "choices",
              "choices": ["聽你說說故事", "我先去準備"],
              "prompt": "請選擇：",
              "var": "elderChoice"
            },
            { "cmd": "if", "var": "elderChoice", "value": 1, "jump": "skip-story" },
            { "cmd": "say", "text": "很久以前，黑暗之王……", "speaker": "村長" },
            { "cmd": "say", "text": "那時候的勇者……", "speaker": "村長" },
            { "cmd": "label", "name": "skip-story" },
            { "cmd": "say", "text": "祝你旅途平安！", "speaker": "村長" },
            { "cmd": "emit", "event": "actor/state:set", "params": { "key": "isTalked", "value": true } },
            { "cmd": "end" }
          ]
        }
      ],
      "triggers": [
        {
          "id": "on-interact",
          "event": "player/interact",
          "script": "elder-talk",
          "mode": "blocking",
          "priority": 10
        }
      ]
    }
  ],

  "items": [
    {
      "id": "potion",
      "name": "回復藥水",
      "description": "恢復 100 HP",
      "category": "item",
      "price": 50,
      "maxStack": 99,
      "useScriptId": "use-potion"
    },
    {
      "id": "ether",
      "name": "魔力藥水",
      "description": "恢復 50 MP",
      "category": "item",
      "price": 80,
      "maxStack": 99,
      "useScriptId": "use-ether"
    },
    {
      "id": "iron-sword",
      "name": "鐵劍",
      "description": "堅固的鐵製長劍",
      "category": "weapon",
      "price": 200,
      "maxStack": 1,
      "equipModifiers": [
        { "stat": "atk", "value": 12, "mode": "add" }
      ]
    },
    {
      "id": "leather-armor",
      "name": "皮革盔甲",
      "description": "輕便的防護盔甲",
      "category": "armor",
      "price": 150,
      "maxStack": 1,
      "equipModifiers": [
        { "stat": "def", "value": 6, "mode": "add" }
      ]
    },
    {
      "id": "ancient-key",
      "name": "古代鑰匙",
      "description": "打開遺跡大門的鑰匙",
      "category": "key",
      "price": 0,
      "maxStack": 1
    }
  ],

  "statusEffects": [
    {
      "id": "poison",
      "name": "毒素",
      "modifiers": [{ "stat": "agi", "value": 0.9, "mode": "multiply" }],
      "duration": 15000,
      "tickDamage": 8,
      "tickMs": 1000
    },
    {
      "id": "burn",
      "name": "灼燒",
      "modifiers": [{ "stat": "def", "value": 0.8, "mode": "multiply" }],
      "duration": 10000,
      "tickDamage": 15,
      "tickMs": 1500
    },
    {
      "id": "haste",
      "name": "加速",
      "modifiers": [{ "stat": "agi", "value": 1.5, "mode": "multiply" }],
      "duration": 8000
    },
    {
      "id": "regen",
      "name": "再生",
      "modifiers": [],
      "duration": 20000,
      "tickDamage": -15,
      "tickMs": 2000
    }
  ],

  "scripts": [
    {
      "id": "use-potion",
      "nodes": [
        { "cmd": "emit", "event": "stats/base:set", "params": { "actorId": "hero", "stat": "hp", "value": 100 } },
        { "cmd": "say", "text": "恢復了 100 HP！", "speaker": "系統" },
        { "cmd": "end" }
      ]
    },
    {
      "id": "intro-cutscene",
      "nodes": [
        { "cmd": "say", "text": "這個世界……正面臨前所未有的危機。", "speaker": "旁白" },
        { "cmd": "wait", "ms": 800 },
        { "cmd": "say", "text": "傳說中的勇者，正是你。", "speaker": "旁白" },
        { "cmd": "emit", "event": "flags.intro-done", "params": {} },
        { "cmd": "end" }
      ]
    }
  ]
}
```

---

> 如需更多 API 參考，請查閱 [ARCHITECTURE.md](../ARCHITECTURE.md) 及 [README.md](../README.md)。
