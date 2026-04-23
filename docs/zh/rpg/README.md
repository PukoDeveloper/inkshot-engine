# RPG 系統總覽

本文件說明 inkshot-engine 內建的 **RPG 子系統套件**，包含各子系統的功能說明、API 速查，以及系統之間的整合關係。

---

## 目錄

1. [RPG 套件啟動](#1-rpg-套件啟動)
2. [子系統一覽](#2-子系統一覽)
3. [各子系統 API 速查](#3-各子系統-api-速查)
   - [StatsSystem（`stats`）](#31-statssystemstats)
   - [InventorySystem（`inventory`）](#32-inventorysysteminventory)
   - [ExperienceSystem（`exp`）](#33-experiencesystemexp)
   - [BattleSystem（`battle`）](#34-battlesystembattle)
   - [ShopSystem（`shop`）](#35-shopsystemshop)
   - [DialogueManager（`dialogue`）](#36-dialoguemanagerdialogue)
   - [ScriptManager（`script`）](#37-scriptmanagerscript)
   - [ActorManager（`actor`）](#38-actormanageractor)
   - [VariableStoreManager（`store`）](#39-variablestoremanagerstore)
   - [PlayerController（`playerController`）](#310-playercontrollerplayercontroller)
   - [RpgMenuSystem（`rpgMenu`）](#311-rpgmenusystemrpgmenu)
4. [系統整合關係](#4-系統整合關係)
5. [RPG 資料載入流程](#5-rpg-資料載入流程)
6. [相關文件](#6-相關文件)

---

## 1. RPG 套件啟動

### 一鍵啟動（推薦）

```ts
import { createRpgEngine } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

const gameData: RpgGameData = {
  meta: { title: '我的 RPG', initialGold: 200 },
  classes: [{ id: 'warrior', baseStats: { hp: 120, atk: 15 } }],
  actors:  [{ id: 'hero', name: '勇者', classId: 'warrior' }],
  items:   [{ id: 'potion', name: '藥水', category: 'item', price: 50 }],
};

const { core, rpg } = await createRpgEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  gameData,   // ← 啟動後自動注入所有定義，無需額外步驟
});
```

`createRpgEngine` 接受可選的 `gameData` 欄位：傳入後會在引擎初始化完成後自動呼叫 `registerRpgData(core, gameData)`，一次完成所有 Plugin 定義的注入。

若無需在啟動時傳入資料，也可以稍後手動呼叫：

```ts
import { createRpgEngine, registerRpgData } from '@inkshot/engine';

const { core } = await createRpgEngine({ container: '#app' });
registerRpgData(core, gameData);   // 任何時候皆可呼叫
```

`createRpgEngine` 會自動載入完整的 RPG Plugin 套件並回傳帶型別的 `rpg` 命名空間存取物件：

| `rpg.*` | 對應系統 |
|---------|---------|
| `rpg.stats` | StatsSystem |
| `rpg.inventory` | InventorySystem |
| `rpg.exp` | ExperienceSystem |
| `rpg.battle` | BattleSystem |
| `rpg.shop` | ShopSystem |
| `rpg.dialogue` | DialogueManager |
| `rpg.script` | ScriptManager |
| `rpg.actor` | ActorManager |
| `rpg.variableStore` | VariableStoreManager |
| `rpg.menu` | RpgMenuSystem |

### 手動組合

若只需要部分子系統，使用 `buildRpgPluginBundle()` 取得有序插件陣列後傳入 `createEngine`：

```ts
import { createEngine, buildRpgPluginBundle } from '@inkshot/engine';

const rpgPlugins = buildRpgPluginBundle();   // 含依賴排序的完整 RPG Plugin 陣列

const { core } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  plugins: [
    ...rpgPlugins,
    // 加入你的自訂 Plugin
  ],
});
```

---

## 2. 子系統一覽

| 系統 | Namespace | 說明 |
|------|-----------|------|
| **StatsSystem** | `stats` | 基礎屬性（HP/MP/ATK 等）、加法/乘法修正器、狀態異常（Buff/Debuff） |
| **InventorySystem** | `inventory` | 每個角色獨立背包、物品堆疊、裝備欄位 |
| **ExperienceSystem** | `exp` | 經驗值累計、升級檢查、可設定的 EXP 曲線 |
| **BattleSystem** | `battle` | 回合制戰鬥、多並行場次、傷害公式、行動解析 |
| **ShopSystem** | `shop` | 買賣交易、金幣透過 VariableStore 管理 |
| **DialogueManager** | `dialogue` | 打字機效果、Rich-text 標記、選項選擇、i18n 整合 |
| **ScriptManager** | `script` | 非同步命令節點執行、多實例並發、內建命令集 |
| **ActorManager** | `actor` | ActorDef 定義、狀態機、Trigger 條件、批次管理 |
| **VariableStoreManager** | `store` | 命名空間 key-value 儲存、存檔整合 |
| **PlayerController** | `playerController` | 輸入 action → 物理移動，自動偵測玩家實體 |
| **RpgMenuSystem** | `rpgMenu` | 暫停選單狀態機、頁面導航 |

---

## 3. 各子系統 API 速查

### 3.1 StatsSystem（`stats`）

管理角色的數值屬性與狀態效果。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `stats/profile:define` | 定義屬性模板（StatProfileDef） |
| `stats/actor:init` | 初始化角色屬性（套用 profile） |
| `stats/modifier:add` | 新增加法或乘法修正器（裝備、Buff） |
| `stats/modifier:remove` | 移除修正器 |
| `stats/value:get` | 取得角色最終屬性值（含所有修正器） |
| `stats/status:define` | 定義狀態效果（Buff/Debuff） |
| `stats/status:apply` | 對角色套用狀態效果 |
| `stats/status:remove` | 移除狀態效果 |
| `stats/status:tick` | 觸發 tick 傷害/回復（含 tickDamage 的效果） |
| `stats/damaged` | 廣播：角色受到傷害 |
| `stats/healed` | 廣播：角色受到治療 |
| `stats/status:applied` | 廣播：狀態效果被套用 |
| `stats/status:expired` | 廣播：狀態效果到期 |

```ts
// 初始化角色
core.events.emitSync('stats/actor:init', {
  actorId: 'hero',
  profileId: 'warrior-lv1',   // 對應 stats/profile:define 定義的 ID
});

// 取得最終 ATK（含所有修正器）
const { output } = core.events.emitSync('stats/value:get', {
  actorId: 'hero',
  stat: 'atk',
});
console.log(output.value); // 計算後的最終值

// 套用毒狀態
core.events.emitSync('stats/status:apply', {
  actorId: 'hero',
  statusId: 'poison',
});
```

---

### 3.2 InventorySystem（`inventory`）

每個角色擁有獨立的背包和裝備欄位。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `inventory/item:define` | 定義物品（ItemDef） |
| `inventory/item:add` | 新增物品到角色背包 |
| `inventory/item:remove` | 從角色背包移除物品 |
| `inventory/item:use` | 使用物品（執行 `useScriptId`） |
| `inventory/item:equip` | 裝備物品（套用 equipModifiers 至 StatsSystem） |
| `inventory/item:unequip` | 卸下裝備 |
| `inventory/list:get` | 取得角色背包清單 |
| `inventory/item:added` | 廣播：物品被加入 |
| `inventory/item:removed` | 廣播：物品被移除 |
| `inventory/item:equipped` | 廣播：物品被裝備 |

```ts
// 給予玩家道具
core.events.emitSync('inventory/item:add', {
  actorId: 'hero',
  itemId: 'potion',
  quantity: 3,
});

// 裝備武器
core.events.emitSync('inventory/item:equip', {
  actorId: 'hero',
  itemId: 'iron-sword',
  slot: 'weapon',
});

// 查詢背包
const { output } = core.events.emitSync('inventory/list:get', { actorId: 'hero' });
console.log(output.items); // [{ itemId, quantity, equipped }, ...]
```

---

### 3.3 ExperienceSystem（`exp`）

管理角色的經驗值、等級與升級流程。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `exp/curve:define` | 定義升級曲線（ExpCurveDef） |
| `exp/actor:init` | 初始化角色等級與經驗值 |
| `exp/gain` | 給予角色經驗值（自動觸發升級） |
| `exp/level:get` | 查詢角色目前等級 |
| `exp/leveled-up` | 廣播：角色升級（含新等級、舊等級） |

```ts
// 戰鬥勝利後給予 EXP
await core.events.emit('exp/gain', {
  actorId: 'hero',
  curveId: 'warrior',   // 使用 warrior 職業的升級曲線
  amount: 50,
});

// 監聽升級事件
core.events.on('game', 'exp/leveled-up', ({ actorId, oldLevel, newLevel }) => {
  showLevelUpAnimation(actorId, newLevel);
});
```

---

### 3.4 BattleSystem（`battle`）

回合制戰鬥，支援多場戰鬥同時進行。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `battle/start` | 開始戰鬥，回傳 `battleId` |
| `battle/action` | 宣告回合行動（attack / item / flee） |
| `battle/resolve` | 結算回合（執行所有已宣告的行動） |
| `battle/end` | 結束戰鬥 |
| `battle/combatant:defeated` | 廣播：參戰者被擊敗 |
| `battle/ended` | 廣播：戰鬥結束（含 outcome） |

```ts
// 開始戰鬥
const { output: startOut } = await core.events.emit('battle/start', {
  allies:  [{ id: 'hero',  stats: { hp: 120, hpMax: 120, atk: 15, def: 10 } }],
  enemies: [{ id: 'slime', stats: { hp: 30,  hpMax: 30,  atk: 5,  def: 2  } }],
});
const { battleId } = startOut;

// 宣告行動
core.events.emitSync('battle/action', {
  battleId,
  combatantId: 'hero',
  action: { type: 'attack', targetId: 'slime' },
});

// 結算回合
const { output: resolveOut } = await core.events.emit('battle/resolve', { battleId });
console.log(resolveOut.log); // 行動紀錄

// 戰鬥結束
core.events.emitSync('battle/end', { battleId, outcome: 'victory' });
```

---

### 3.5 ShopSystem（`shop`）

商店買賣交易，金幣透過 `VariableStoreManager` 管理。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `shop/define` | 定義商店（商品清單與售價） |
| `shop/open` | 開啟商店 Session，回傳 `sessionId` |
| `shop/buy` | 購買物品 |
| `shop/sell` | 出售物品 |
| `shop/close` | 關閉 Session |

---

### 3.6 DialogueManager（`dialogue`）

文字打字機效果、Rich-text 標記、選項選擇。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `dialogue/show:text` | 顯示文字（含打字機效果） |
| `dialogue/advance` | 推進對話 |
| `dialogue/show:choices` | 顯示選項 |
| `dialogue/choice:made` | 廣播：玩家選擇了選項 |
| `dialogue/close` | 關閉對話框 |

#### Rich-text 標記

| 標記 | 說明 |
|------|------|
| `[color=#RRGGBB]文字[/color]` | 文字顏色 |
| `[speed=倍率]文字[/speed]` | 打字速度（1.0 = 正常，2.0 = 兩倍速） |
| `[pause=毫秒]` | 暫停 N 毫秒後繼續 |

---

### 3.7 ScriptManager（`script`）

非同步命令節點執行引擎，支援多個 Script 實例並發。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `script/define` | 定義腳本（ScriptDef） |
| `script/run` | 執行腳本 |
| `script/cancel` | 取消執行中的腳本 |
| `script/ended` | 廣播：腳本執行完成 |

#### 內建指令

| 指令 | 說明 |
|------|------|
| `say` | 顯示對話（使用 DialogueManager） |
| `choices` | 顯示選項，結果存入變數 |
| `if` | 條件判斷，跳轉到 `jump` 標籤 |
| `jump` | 無條件跳轉 |
| `label` | 定義跳轉目標 |
| `wait` | 等待 N 毫秒 |
| `wait-event` | 等待 EventBus 事件 |
| `emit` | 發出 EventBus 事件 |
| `call` | 呼叫子腳本 |
| `fork` | 並行執行子腳本 |
| `store-set` | 寫入 VariableStore |
| `end` | 結束腳本 |

---

### 3.8 ActorManager（`actor`）

角色定義、生成、狀態機與觸發器管理。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `actor/define` | 定義 ActorDef（含腳本與觸發器） |
| `actor/spawn` | 在場景中生成角色實例 |
| `actor/despawn` | 從場景移除角色實例 |
| `actor/state:set` | 設定角色狀態（觸發狀態機） |
| `actor/state:get` | 查詢角色狀態 |
| `actor/spawned` | 廣播：角色被生成 |
| `actor/despawned` | 廣播：角色被移除 |

---

### 3.9 VariableStoreManager（`store`）

命名空間二層 key-value 儲存，與存檔系統自動整合。

#### 主要事件

| 事件 | 說明 |
|------|------|
| `store/set` | 設定單一鍵值 |
| `store/get` | 查詢單一鍵值 |
| `store/patch` | 批次更新（Shallow merge） |
| `store/namespace:get` | 取得整個命名空間的資料 |
| `store/changed` | 廣播：某個鍵值被修改 |

```ts
// 設定 flag
core.events.emitSync('store/set', {
  ns: 'flags',
  key: 'tutorial.completed',
  value: true,
});

// 讀取
const { output } = core.events.emitSync('store/get', {
  ns: 'flags',
  key: 'tutorial.completed',
});
console.log(output.value); // true

// 批次更新
core.events.emitSync('store/patch', {
  ns: 'player',
  patch: { gold: 500, level: 5 },
});
```

---

### 3.10 PlayerController（`playerController`）

將輸入 Action 映射為物理移動，自動偵測帶有 `'player'` 標籤的實體。

```ts
// PlayerController 會自動尋找帶有 'player' 標籤的實體
core.events.emitSync('entity/tag:set', {
  entityId: heroEntityId,
  tags: ['player'],
});

// 設定移動速度（像素/幀）
core.events.emitSync('playerController/speed:set', { speed: 3 });
```

---

### 3.11 RpgMenuSystem（`rpgMenu`）

暫停選單狀態機，處理頁面導航與按鍵綁定。

```ts
// 開啟暫停選單
core.events.emitSync('rpgMenu/open', {});

// 導航至道具頁面
core.events.emitSync('rpgMenu/navigate', { page: 'items' });

// 關閉選單
core.events.emitSync('rpgMenu/close', {});
```

---

## 4. 系統整合關係

```
InventorySystem ──equip──► StatsSystem ◄──apply── BattleSystem
      │                        │                       │
      └──use(item)──► ScriptManager ◄──save/load── SaveManager
                           │                           │
ActorManager ──trigger──►  │ ◄──flag/variable── VariableStoreManager
                           │
DialogueManager ◄──say──── │ ──emit──► EventBus（任意系統）
```

**關鍵整合點：**

| 整合 | 說明 |
|------|------|
| `InventorySystem` ↔ `StatsSystem` | 裝備時自動套用/移除 `equipModifiers` |
| `InventorySystem` ↔ `ScriptManager` | 使用道具時執行 `useScriptId` 腳本 |
| `VariableStoreManager` ↔ `SaveManager` | 存檔時自動序列化所有命名空間 |
| `ExperienceSystem` ↔ `StatsSystem` | 升級後可透過事件更新屬性 |
| `ShopSystem` ↔ `VariableStoreManager` | 金幣存放於 `'player'` namespace 的 `'gold'` 鍵 |
| `ActorManager` ↔ `ScriptManager` | Trigger 條件符合時自動執行腳本 |

---

## 5. RPG 資料載入流程

### 推薦做法：`registerRpgData`（一行搞定）

使用 `registerRpgData()` 直接將 `RpgGameData` 物件注入引擎，自動處理所有 Plugin 定義：

```ts
import { registerRpgData } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

const gameData: RpgGameData = { /* ... */ };

registerRpgData(core, gameData);
```

或在啟動時透過 `createRpgEngine` 的 `gameData` 選項，達到零額外步驟：

```ts
const { core } = await createRpgEngine({
  container: '#app',
  gameData,   // 引擎初始化後自動呼叫 registerRpgData
});
```

`registerRpgData` 依序發出以下事件：

| 資料欄位 | 發出的事件 | 目標系統 |
|----------|-----------|---------|
| `classes` | `stats/profile:define` | `StatsSystem` |
| `classes` | `exp/curve:define` | `ExperienceSystem` |
| `actors` | `actor/define` | `ActorManager` |
| `items` | `inventory/item:define` | `InventorySystem` |
| `statusEffects` | `stats/status:define` | `StatsSystem` |
| `scripts` | `script/define` | `ScriptManager` |
| `meta.initialGold` | `store/set`（`player.gold`）| `VariableStoreManager` |
| `meta.initialVariables` | `store/patch`（`game` 命名空間）| `VariableStoreManager` |

### 進階做法：手動注入（完全掌控順序）

若需要自訂注入順序或在每筆資料之間插入額外邏輯，可先呼叫 `loadRpgData()` 取得轉換結果後手動注入：

```ts
import { loadRpgData } from '@inkshot/engine';

const data = loadRpgData(gameData);

for (const profile of data.statProfiles) {
  core.events.emitSync('stats/profile:define', { profile });
}
for (const curve of data.expCurves) {
  core.events.emitSync('exp/curve:define', { curve });
}
for (const actor of data.actors) {
  core.events.emitSync('actor/define', { def: actor });
}
for (const item of data.items) {
  core.events.emitSync('inventory/item:define', { item });
}
for (const effect of data.statusEffects) {
  core.events.emitSync('stats/status:define', { effect });
}
for (const script of data.scripts) {
  core.events.emitSync('script/define', { script });
}
if (data.initialGold > 0) {
  core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: data.initialGold });
}
if (Object.keys(data.initialVariables).length > 0) {
  core.events.emitSync('store/patch', { ns: 'game', patch: data.initialVariables });
}
```

完整的資料格式規格請參閱 [JSON 資料格式參考](../json-data-format.md)。

---

## 6. 相關文件

| 文件 | 說明 |
|------|------|
| [RPG 快速入門](../rpg-quickstart.md) | 從零建立可運行的 RPG 專案，含完整程式碼範例 |
| [JSON 資料格式參考](../json-data-format.md) | `RpgGameData`、腳本節點、Tilemap 格式的完整規格 |
| [完整 API 手冊](../../README.md) | 所有內建 Plugin 的 Event Contract（英文） |
