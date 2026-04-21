# RPG 快速開始指南

本指南說明如何使用 **inkshot-engine** 的 RPG 功能，從零建立一個可運行的 RPG 專案。  
全流程不依賴任何外部工具（如 RPG Maker），所有資料皆以 TypeScript / JSON 定義。

---

## 目錄

1. [安裝](#1-安裝)
2. [初始化引擎](#2-初始化引擎)
3. [定義遊戲資料](#3-定義遊戲資料)
   - [3-1 職業與經驗曲線](#3-1-職業與經驗曲線)
   - [3-2 角色（Actors）](#3-2-角色actors)
   - [3-3 道具](#3-3-道具)
   - [3-4 狀態效果（Buff / Debuff）](#3-4-狀態效果buff--debuff)
   - [3-5 腳本（Scripts）](#3-5-腳本scripts)
4. [載入資料到引擎](#4-載入資料到引擎)
5. [戰鬥流程](#5-戰鬥流程)
6. [對話系統](#6-對話系統)
7. [商店系統](#7-商店系統)
8. [存檔與讀檔](#8-存檔與讀檔)
9. [完整範例](#9-完整範例)
10. [EventBus 速查表](#10-eventbus-速查表)

---

## 1. 安裝

```bash
npm install @inkshot/engine
```

> 引擎以 ES Module 發佈，請確保你的專案設定 `"type": "module"` 或使用 Bundler（Vite、Webpack 等）。

---

## 2. 初始化引擎

使用 `createRpgEngine` 一行啟動包含全套 RPG 插件的引擎：

```ts
import { createRpgEngine } from '@inkshot/engine';

const { core, rpg } = await createRpgEngine({
  container: '#app',   // 掛載 Canvas 的 DOM 選擇器
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
});

console.log('引擎啟動完成！');
```

`createRpgEngine` 會自動初始化以下子系統：

| 子系統 | 存取路徑 | 說明 |
|--------|---------|------|
| 統計數值 | `rpg.stats` | 角色基礎屬性、裝備加成、狀態效果 |
| 道具欄 | `rpg.inventory` | 撿取、使用、裝備道具 |
| 商店 | `rpg.shop` | 買賣交易 |
| 經驗值 | `rpg.exp` | 升級、等級曲線 |
| 戰鬥 | `rpg.battle` | 回合制戰鬥 |
| 腳本 | `rpg.script` | NPC 行為腳本、過場事件 |
| 對話 | `rpg.dialogue` | 文字打字機 |
| 角色 | `rpg.actor` | 角色實例管理 |
| 變數儲存 | `rpg.variableStore` | 全域旗標與變數 |
| 選單 | `rpg.menu` | RPG 暫停選單 |

---

## 3. 定義遊戲資料

所有遊戲資料以 `RpgGameData` 物件描述，再傳入 `loadRpgData()` 轉換為引擎可讀的格式。  
你可以直接在程式碼中定義，也可以從 JSON 檔案 `fetch` 後傳入。

```ts
import { loadRpgData } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

const gameData: RpgGameData = {
  // 詳細內容見以下各節
};

const data = loadRpgData(gameData);
```

---

### 3-1 職業與經驗曲線

`classes` 陣列定義職業的基礎屬性與升級曲線。  
每個職業會自動生成一個 **StatProfile**（等級 1 屬性）和一個 **ExpCurve**（升級所需經驗）。

```ts
classes: [
  {
    id: 'warrior',
    name: '戰士',
    expCurve: {
      base: 30,       // 基礎係數
      exp: 2,         // 指數（預設 2 = 二次曲線）
      extra: 5,       // 額外線性係數（預設 0）
      maxLevel: 99,   // 最高等級（預設 99）
    },
    baseStats: {
      hp: 120, hpMax: 120,
      mp: 20,  mpMax: 20,
      atk: 15, def: 10, agi: 8, luk: 5,
    },
  },
  {
    id: 'mage',
    name: '魔法師',
    expCurve: { base: 25, exp: 2 },
    baseStats: {
      hp: 60,  hpMax: 60,
      mp: 100, mpMax: 100,
      atk: 6,  def: 4, agi: 10, luk: 8,
    },
  },
],
```

**升級公式：** `exp(level) = base × level ^ exp + extra × level`

> **提示：** `hp` 和 `hpMax` 只要提供其中一個，`loadRpgData` 會自動補齊另一個。

---

### 3-2 角色（Actors）

`actors` 陣列定義可在地圖上生成的角色類型（玩家、NPC、BOSS 等）。  
每個角色可以攜帶腳本與觸發器（Trigger），描述其行為。

```ts
actors: [
  {
    id: 'hero',
    name: '勇者',
    classId: 'warrior',     // 對應 classes[].id
    initialLevel: 1,
    initialState: {
      isPartyLeader: true,  // 自訂初始狀態
    },
    scripts: [
      {
        id: 'hero-idle',
        nodes: [
          { cmd: 'wait', duration: 3000 },
          { cmd: 'say', text: '...' },
        ],
      },
    ],
    triggers: [
      {
        id: 'on-spawn',
        event: 'actor/spawned',
        script: 'hero-idle',
        mode: 'concurrent',   // 'concurrent' | 'blocking'
      },
    ],
  },
  {
    id: 'merchant',
    name: '商人',
    scripts: [
      {
        id: 'merchant-greet',
        nodes: [
          { cmd: 'say', text: '歡迎光臨！需要什麼嗎？', speaker: '商人' },
        ],
      },
    ],
    triggers: [
      {
        id: 'on-interact',
        event: 'player/interact',
        script: 'merchant-greet',
        mode: 'blocking',
        onEnd: 'restore',     // 對話結束後恢復原腳本
      },
    ],
  },
],
```

#### 觸發器欄位說明

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | `string` | 在此角色內唯一 |
| `event` | `string` | EventBus 事件名稱 |
| `script` | `string` | 要執行的腳本 ID |
| `mode` | `'concurrent'` \| `'blocking'` | `concurrent` = 與其他腳本並行；`blocking` = 搶佔主要執行通道 |
| `priority` | `number` | 阻斷優先級，預設 `10` |
| `onEnd` | `'restore'` \| `'nothing'` \| `string` | 腳本結束後的動作；`'restore'` = 重新執行被搶佔的腳本 |

---

### 3-3 道具

`items` 陣列定義所有道具、武器、防具、關鍵道具。

```ts
items: [
  // 消耗道具
  {
    id: 'potion',
    name: '藥水',
    description: '恢復 50 HP',
    category: 'item',    // 'item' | 'weapon' | 'armor' | 'accessory' | 'key'
    price: 50,
    maxStack: 99,
    useScriptId: 'use-potion',   // 使用時執行的腳本 ID（可省略）
  },
  // 武器
  {
    id: 'iron-sword',
    name: '鐵劍',
    description: '攻擊力 +10',
    category: 'weapon',
    price: 200,
    maxStack: 1,
    equipModifiers: [
      { stat: 'atk', value: 10, mode: 'add' },
    ],
  },
  // 防具
  {
    id: 'leather-armor',
    name: '皮甲',
    description: '防禦力 +5',
    category: 'armor',
    price: 150,
    maxStack: 1,
    equipModifiers: [
      { stat: 'def', value: 5, mode: 'add' },
    ],
  },
  // 關鍵道具（不可丟棄）
  {
    id: 'dungeon-key',
    name: '地下城鑰匙',
    category: 'key',
    price: 0,
  },
],
```

#### 裝備修正值模式（`mode`）

| 值 | 說明 |
|----|------|
| `'add'` | 直接加上數值：`atk + 10` |
| `'multiply'` | 乘以倍率：`atk × 1.5` |

---

### 3-4 狀態效果（Buff / Debuff）

`statusEffects` 定義可套用於角色的臨時效果。

```ts
statusEffects: [
  {
    id: 'poison',
    name: '中毒',
    modifiers: [
      { stat: 'agi', value: 0.9, mode: 'multiply' },  // 敏捷 ×0.9
    ],
    duration: 15000,   // 持續 15 秒（毫秒）
    tickDamage: 5,     // 每次 tick 扣 5 HP（正值=傷害）
    tickMs: 1000,      // 每 1 秒觸發一次
  },
  {
    id: 'haste',
    name: '加速',
    modifiers: [
      { stat: 'agi', value: 1.5, mode: 'multiply' },  // 敏捷 ×1.5
    ],
    duration: 10000,   // 持續 10 秒
  },
  {
    id: 'regen',
    name: '回血',
    modifiers: [],
    tickDamage: -20,   // 負值 = 回復
    tickMs: 2000,
    // duration 省略 = 永久效果，需手動移除
  },
],
```

---

### 3-5 腳本（Scripts）

獨立腳本（不依附任何角色）適合用於過場動畫、事件觸發等場合。

```ts
scripts: [
  {
    id: 'opening-cutscene',
    nodes: [
      { cmd: 'say',  text: '在遙遠的王國，黑暗的力量正在甦醒……', speaker: '旁白' },
      { cmd: 'wait', duration: 2000 },
      { cmd: 'say',  text: '勇者啊，請起身！', speaker: '國王' },
      { cmd: 'choices', choices: ['我準備好了', '給我一點時間'], var: 'hero_choice' },
      { cmd: 'if',   var: 'hero_choice', value: 0, jump: 'ready' },
      { cmd: 'say',  text: '別猶豫了，時間不多！', speaker: '國王' },
      { cmd: 'label', name: 'ready' },
      { cmd: 'end' },
    ],
  },
],
```

#### 內建腳本指令

| `cmd` | 參數 | 說明 |
|-------|------|------|
| `say` | `text`, `speaker?`, `portrait?` | 顯示對話（typewriter 效果） |
| `choices` | `choices[]`, `var` | 顯示選項，結果存入 `var` |
| `if` | `var`, `value`, `jump` | 比對變數，跳轉至 `jump` 標籤 |
| `wait` | `duration` (ms) | 等待指定毫秒 |
| `label` | `name` | 定義跳轉目標 |
| `jump` | `target` | 無條件跳轉至標籤 |
| `call` | `scriptId` | 呼叫另一個腳本（子程序） |
| `emit` | `event`, `params?` | 發出 EventBus 事件 |
| `store-set` | `namespace`, `key`, `value` | 寫入變數儲存 |
| `end` | — | 結束腳本 |

---

## 4. 載入資料到引擎

呼叫 `loadRpgData()` 取得轉換結果後，逐一注入各子系統：

```ts
import { loadRpgData } from '@inkshot/engine';

async function loadGameData(core) {
  const data = loadRpgData(gameData);   // gameData 是你的 RpgGameData 物件

  // 1. 經驗曲線
  for (const curve of data.expCurves) {
    core.events.emitSync('exp/curve:define', { curve });
  }

  // 2. 基礎屬性 profile
  for (const profile of data.statProfiles) {
    core.events.emitSync('stats/profile:define', { profile });
  }

  // 3. 道具定義
  for (const item of data.items) {
    core.events.emitSync('inventory/item:define', { item });
  }

  // 4. 狀態效果定義
  for (const effect of data.statusEffects) {
    core.events.emitSync('stats/status:define', { effect });
  }

  // 5. 獨立腳本
  for (const script of data.scripts) {
    core.events.emitSync('script/define', { script });
  }

  // 6. 角色定義（包含其腳本與觸發器）
  for (const actor of data.actors) {
    core.events.emitSync('actor/define', { def: actor });
  }

  // 7. 初始化全域變數與起始金幣
  if (Object.keys(data.initialVariables).length > 0) {
    core.events.emitSync('store/patch', {
      namespace: 'game',
      patch: data.initialVariables,
    });
  }
  if (data.initialGold > 0) {
    core.events.emitSync('store/patch', {
      namespace: 'player',
      patch: { gold: data.initialGold },
    });
  }
}
```

---

## 5. 戰鬥流程

`BattleSystem` 採用**回合制**架構，支援多場戰鬥同時進行。

```ts
// 1. 開始戰鬥
const { battleId } = await core.events.emit('battle/start', {
  allies: [
    { id: 'hero',  stats: { hp: 120, hpMax: 120, atk: 15, def: 10 } },
  ],
  enemies: [
    { id: 'slime', stats: { hp: 30,  hpMax: 30,  atk: 5,  def: 2  } },
  ],
});

// 2. 宣告行動（每個參戰者各一次）
core.events.emitSync('battle/action', {
  battleId,
  combatantId: 'hero',
  action: { type: 'attack', targetId: 'slime' },
});

// 3. 結算本回合
const result = await core.events.emit('battle/resolve', { battleId });
console.log(result.log);   // 行動紀錄陣列

// 4. 勝利後結束戰鬥
core.events.emitSync('battle/end', { battleId, outcome: 'victory' });
```

#### 行動類型（`action.type`）

| 類型 | 說明 |
|------|------|
| `'attack'` | 物理攻擊，需指定 `targetId` |
| `'item'` | 使用道具，需指定 `targetId` 與 `itemId` |
| `'flee'` | 逃跑（outcome 變為 `'fled'`） |

#### 監聽戰鬥事件

```ts
core.events.on('battle', 'battle/combatant:defeated', ({ combatantId }) => {
  console.log(`${combatantId} 被擊敗！`);
});

core.events.on('battle', 'battle/ended', ({ battleId, outcome }) => {
  if (outcome === 'victory') {
    // 給予經驗值
    await core.events.emit('exp/gain', {
      actorId: 'hero',
      curveId: 'warrior',
      amount: 50,
    });
  }
});
```

---

## 6. 對話系統

### 透過腳本觸發對話（推薦）

```ts
core.events.emitSync('script/run', {
  id: 'opening-cutscene',
  instanceId: 'cutscene',
});
```

### 手動控制對話

```ts
// 顯示文字
core.events.emitSync('dialogue/show:text', {
  text: '歡迎來到我的商店！',
  speaker: '商人',
});

// 等待玩家按下確認鍵後推進
core.events.emitSync('dialogue/advance', {});

// 顯示選項
core.events.emitSync('dialogue/show:choices', {
  choices: ['購買', '出售', '離開'],
});

// 玩家選擇後
core.events.on('dialogue', 'dialogue/choice:made', ({ index }) => {
  console.log(`玩家選擇了第 ${index} 個選項`);
});
```

### 對話標記語法（Markup）

`say` 指令的 `text` 支援以下內嵌標記：

| 標記 | 說明 | 範例 |
|------|------|------|
| `[color=#FF0000]紅字[/color]` | 文字顏色 | `[color=#FFD700]黃金[/color]` |
| `[speed=0.5]慢速[/speed]` | 打字速度倍率 | `[speed=2]快速文字[/speed]` |
| `[pause=500]` | 暫停 N 毫秒 | `你好[pause=1000]，朋友。` |

---

## 7. 商店系統

```ts
// 1. 定義商店
core.events.emitSync('shop/define', {
  shop: {
    id: 'town-shop',
    name: '村莊商店',
    stock: [
      { itemId: 'potion',    price: 50  },
      { itemId: 'iron-sword', price: 200 },
      { itemId: 'leather-armor', price: 150 },
    ],
  },
});

// 2. 開啟商店（顧客 ID = 購買者角色 ID）
const { sessionId } = await core.events.emit('shop/open', {
  shopId: 'town-shop',
  customerId: 'hero',
});

// 3. 購買
const buyResult = await core.events.emit('shop/buy', {
  sessionId,
  itemId: 'potion',
  quantity: 3,
});
console.log(buyResult.success, buyResult.remainingGold);

// 4. 出售
await core.events.emit('shop/sell', {
  sessionId,
  itemId: 'iron-sword',
  quantity: 1,
});

// 5. 關閉
core.events.emitSync('shop/close', { sessionId });
```

> **金幣儲存：** 金幣存放在 `VariableStoreManager` 的 `'player'` 命名空間，鍵值 `'gold'`。  
> 可用以下方式設定初始金幣：
> ```ts
> core.events.emitSync('store/patch', { namespace: 'player', patch: { gold: 500 } });
> ```

---

## 8. 存檔與讀檔

```ts
// 存檔至第 1 槽
await core.events.emit('save/slot:save', { slot: 1 });

// 讀取第 1 槽
const { data, loaded } = await core.events.emit('save/slot:load', { slot: 1 });
if (loaded) {
  console.log('讀檔成功');
}

// 列出所有存檔槽
const { slots } = await core.events.emit('save/slot:list', {});
```

---

## 9. 完整範例

以下是從啟動引擎到開始第一場戰鬥的完整流程：

```ts
import { createRpgEngine, loadRpgData } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

// ── 1. 定義遊戲資料 ────────────────────────────────────────────────────────
const gameData: RpgGameData = {
  meta: {
    title: '勇者傳說',
    version: '1.0.0',
    locale: 'zh-TW',
    initialGold: 100,
  },
  classes: [
    {
      id: 'warrior',
      name: '戰士',
      expCurve: { base: 30, exp: 2, extra: 5 },
      baseStats: { hp: 120, hpMax: 120, mp: 20, mpMax: 20, atk: 15, def: 10, agi: 8, luk: 5 },
    },
  ],
  actors: [
    {
      id: 'hero',
      name: '勇者',
      classId: 'warrior',
      initialLevel: 1,
    },
    {
      id: 'merchant',
      name: '商人',
      scripts: [
        {
          id: 'merchant-dialogue',
          nodes: [
            { cmd: 'say', text: '歡迎光臨！', speaker: '商人' },
            { cmd: 'choices', choices: ['購買', '離開'], var: 'choice' },
            { cmd: 'if', var: 'choice', value: 1, jump: 'bye' },
            { cmd: 'emit', event: 'shop/open', params: { shopId: 'town-shop', customerId: 'hero' } },
            { cmd: 'label', name: 'bye' },
            { cmd: 'end' },
          ],
        },
      ],
      triggers: [
        {
          id: 'on-interact',
          event: 'player/interact',
          script: 'merchant-dialogue',
          mode: 'blocking',
          onEnd: 'restore',
        },
      ],
    },
  ],
  items: [
    { id: 'potion',      name: '藥水',  category: 'item',   price: 50,  maxStack: 99 },
    { id: 'iron-sword',  name: '鐵劍',  category: 'weapon', price: 200, maxStack: 1,
      equipModifiers: [{ stat: 'atk', value: 10, mode: 'add' }] },
  ],
  statusEffects: [
    { id: 'poison', name: '中毒', modifiers: [], duration: 15000, tickDamage: 5, tickMs: 1000 },
  ],
};

// ── 2. 啟動引擎 ────────────────────────────────────────────────────────────
const { core, rpg } = await createRpgEngine({
  container: '#app',
  width: 1280,
  height: 720,
});

// ── 3. 載入遊戲資料 ────────────────────────────────────────────────────────
const data = loadRpgData(gameData);

for (const curve   of data.expCurves)    core.events.emitSync('exp/curve:define',      { curve });
for (const profile of data.statProfiles) core.events.emitSync('stats/profile:define',  { profile });
for (const item    of data.items)        core.events.emitSync('inventory/item:define', { item });
for (const effect  of data.statusEffects)core.events.emitSync('stats/status:define',  { effect });
for (const script  of data.scripts)      core.events.emitSync('script/define',         { script });
for (const actor   of data.actors)       core.events.emitSync('actor/define',          { def: actor });

// 設定初始金幣
core.events.emitSync('store/patch', { namespace: 'player', patch: { gold: data.initialGold } });

// ── 4. 生成玩家角色 ────────────────────────────────────────────────────────
const { instance } = await core.events.emit('actor/spawn', {
  actorType: 'hero',
  instanceId: 'player',
});

// 設定角色基礎屬性（等級 1）
core.events.emitSync('stats/base:set', {
  actorId: 'player',
  patch: { hp: 120, hpMax: 120, mp: 20, mpMax: 20, atk: 15, def: 10, agi: 8, luk: 5 },
});

// ── 5. 定義商店 ────────────────────────────────────────────────────────────
core.events.emitSync('shop/define', {
  shop: {
    id: 'town-shop',
    name: '村莊商店',
    stock: [
      { itemId: 'potion',     price: 50  },
      { itemId: 'iron-sword', price: 200 },
    ],
  },
});

// ── 6. 開始一場戰鬥 ────────────────────────────────────────────────────────
const { battleId } = await core.events.emit('battle/start', {
  allies:  [{ id: 'player', stats: { hp: 120, hpMax: 120, atk: 15, def: 10 } }],
  enemies: [{ id: 'slime',  stats: { hp: 30,  hpMax: 30,  atk: 5,  def: 2  } }],
});

core.events.emitSync('battle/action', {
  battleId,
  combatantId: 'player',
  action: { type: 'attack', targetId: 'slime' },
});

const result = await core.events.emit('battle/resolve', { battleId });
console.log('戰鬥結算：', result.log);
```

---

## 10. EventBus 速查表

### 角色（Actor）

| 事件 | 說明 |
|------|------|
| `actor/define` | 登錄角色類型定義 |
| `actor/spawn` | 生成角色實例 |
| `actor/despawn` | 移除角色實例 |
| `actor/state:set` | 設定角色狀態單一鍵值 |
| `actor/state:patch` | 批次更新角色狀態 |
| `actor/state:get` | 讀取角色狀態 |
| `actor/trigger` | 手動觸發角色觸發器 |

### 統計數值（Stats）

| 事件 | 說明 |
|------|------|
| `stats/profile:define` | 登錄職業屬性 profile |
| `stats/status:define` | 登錄狀態效果定義 |
| `stats/base:set` | 設定角色基礎屬性 |
| `stats/base:get` | 讀取基礎屬性 |
| `stats/modifier:add` | 加入裝備 / buff 修正值 |
| `stats/modifier:remove` | 移除修正值 |
| `stats/compute` | 計算完整屬性（含所有修正） |
| `stats/status:apply` | 套用狀態效果 |
| `stats/status:remove` | 移除狀態效果 |

### 道具欄（Inventory）

| 事件 | 說明 |
|------|------|
| `inventory/item:define` | 登錄道具定義 |
| `inventory/add` | 新增道具 |
| `inventory/remove` | 移除道具 |
| `inventory/use` | 使用道具 |
| `inventory/equip` | 裝備道具 |
| `inventory/unequip` | 卸下裝備 |
| `inventory/list` | 列出角色道具欄 |
| `inventory/has` | 確認是否持有某道具 |

### 經驗值（Exp）

| 事件 | 說明 |
|------|------|
| `exp/curve:define` | 登錄升級曲線 |
| `exp/gain` | 獲得經驗值（自動處理升級） |
| `exp/set` | 直接設定經驗值 |
| `exp/get` | 讀取目前經驗值與等級 |

### 戰鬥（Battle）

| 事件 | 說明 |
|------|------|
| `battle/start` | 開始戰鬥 |
| `battle/action` | 宣告行動 |
| `battle/resolve` | 結算本回合 |
| `battle/end` | 結束戰鬥 |
| `battle/state:get` | 讀取戰鬥狀態 |

### 腳本（Script）

| 事件 | 說明 |
|------|------|
| `script/define` | 登錄腳本 |
| `script/run` | 執行腳本 |
| `script/stop` | 停止腳本 |
| `script/register-command` | 新增自訂指令 |
| `script/state:get` | 讀取腳本執行狀態 |

### 對話（Dialogue）

| 事件 | 說明 |
|------|------|
| `dialogue/show:text` | 顯示文字 |
| `dialogue/show:choices` | 顯示選項 |
| `dialogue/advance` | 推進對話 |
| `dialogue/choice` | 選擇選項 |
| `dialogue/end` | 強制結束對話 |
| `dialogue/state:get` | 讀取對話狀態 |

### 商店（Shop）

| 事件 | 說明 |
|------|------|
| `shop/define` | 登錄商店 |
| `shop/open` | 開啟商店 |
| `shop/buy` | 購買道具 |
| `shop/sell` | 出售道具 |
| `shop/close` | 關閉商店 |

---

> 更多進階用法請參閱各子系統的 API 型別定義（`src/types/` 目錄）。
