# RPG Roadmap — inkshot-engine

> **⚠️ 此文件已過時。**  
> 本文件中大部分功能已完整實作，詳見根目錄的 [`TODO.md`](../TODO.md)。  
> 尚未實作的計畫功能已整合至新的路線圖文件：[`docs/roadmap.md`](./roadmap.md)。

---

本文件記錄所有 **尚未實作** 的 RPG 及遊戲功能計畫，依優先順序分組。
已完成的功能請參閱根目錄的 [`TODO.md`](../TODO.md)。

---

## 目錄

1. [🟠 中高優先](#-中高優先)
   - [觸控與手勢輸入](#1-觸控與手勢輸入-touch--gesture-input)
   - [Tiled 地圖編輯器整合](#2-tiled-地圖編輯器整合-tiled-map-editor-import)
   - [輸入錄製與回放](#3-輸入錄製與回放-input-recording--playback)
2. [🟡 中優先](#-中優先)
   - [小地圖系統](#4-小地圖系統-minimap)
   - [視野 / 迷霧系統](#5-視野--迷霧系統-fog-of-war--line-of-sight)
   - [過場動畫 / 演出系統](#6-過場動畫--演出系統-cutscene--cinematic-system)
   - [成就系統](#7-成就系統-achievement-system)
   - [動態光源系統](#8-動態光源系統-dynamic-lighting)
3. [🔵 低優先](#-低優先)
   - [程序生成工具](#9-程序生成工具-procedural-generation-utilities)
   - [Web Worker 支援](#10-web-worker-支援-web-worker-offloading)
4. [⚪ 未來考量](#-未來考量)
   - [網路 / 多人聯機](#11-網路--多人聯機-networking)
   - [資料持久化擴充](#12-資料持久化擴充-persistence-adapters)
   - [熱重載與插件動態更新](#13-熱重載與插件動態更新-hot-reload--live-update)

---

## 🟠 中高優先

### 1. 觸控與手勢輸入 (Touch / Gesture Input)

**Namespace:** 擴充現有 `InputManager`（`namespace: 'input'`）

**目標：** 讓行動裝置與觸控螢幕能與鍵盤/手柄使用相同的邏輯 action 介面。

**工作項目：**
- [ ] 擴充 `InputManager`，辨識多點觸控（Multi-touch）
- [ ] 支援常見手勢：捏合縮放（Pinch-zoom）、雙指旋轉、滑動（Swipe）
- [ ] 映射手勢至邏輯 action，與鍵盤/手柄統一接口

**新增事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `input/touch:start` | 廣播 | 觸控點按下，含 `touches` 陣列 |
| `input/touch:move` | 廣播 | 觸控點移動 |
| `input/touch:end` | 廣播 | 觸控點抬起 |
| `input/gesture:pinch` | 廣播 | 捏合縮放，含 `scale` 倍率 |
| `input/gesture:rotate` | 廣播 | 雙指旋轉，含 `angle` |
| `input/gesture:swipe` | 廣播 | 滑動完成，含 `direction`（up/down/left/right）|

---

### 2. Tiled 地圖編輯器整合 (Tiled Map Editor Import)

**Namespace:** 工具函式（不需要 plugin lifecycle）

**目標：** 讓設計師可直接在 Tiled 編輯地圖，然後無縫匯入 inkshot-engine。

**工作項目：**
- [ ] 新增 `TiledLoader` 工具函式（放於 `src/plugins/rpg/TiledLoader.ts`），解析 `.tmj`（Tiled JSON）格式
- [ ] 將 Tiled 圖層轉換為 `TilemapData`（`TilemapManager` 可直接使用）
- [ ] 將 Tiled 物件圖層（Object Layer）轉換為 `ActorDef`（`ActorManager` 可直接使用）
- [ ] 支援 Tiled Tile 屬性（自訂 collision shape、animated tile 設定）
- [ ] 支援 Wang Tile（Tiled 的 auto-tiling 格式）轉換為 `AutotileGroupDef`

**API 草稿：**
```ts
import { loadTiledMap } from '@inkshot/engine/rpg';

const { tilemapData, actorDefs } = await loadTiledMap('/maps/world.tmj');
core.events.emitSync('tilemap/load', tilemapData);
actorDefs.forEach(def => core.events.emitSync('actor/define', def));
```

---

### 3. 輸入錄製與回放 (Input Recording & Playback)

**Namespace:** `inputRecorder`

**目標：** 支援遊戲回放、自動測試與 Demo 錄影。

**工作項目：**
- [ ] 新增 `InputRecorder` plugin（`src/plugins/InputRecorder.ts`）
- [ ] 逐幀記錄所有輸入事件（按鍵、指標、手柄）
- [ ] 序列化為 JSON；利用 `SaveManager` 持久化
- [ ] 回放模式：注入錄製的輸入序列至 `EventBus`，替代實際輸入

**新增事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `inputRecorder/start` | 命令 | 開始錄製 |
| `inputRecorder/stop` | 命令 | 停止錄製，返回 `{ recording }` |
| `inputRecorder/playback:start` | 命令 | 開始回放，接受 `{ recording }` |
| `inputRecorder/playback:stop` | 命令 | 中止回放 |
| `inputRecorder/playback:ended` | 廣播 | 回放結束 |

---

## 🟡 中優先

### 4. 小地圖系統 (Minimap)

**Namespace:** `minimap`

**目標：** 提供可掛載至 UI 層的小地圖元件，支援 Fog of War 遮罩。

**工作項目：**
- [ ] 新增 `MinimapPlugin`（`src/plugins/rpg/MinimapPlugin.ts`）
- [ ] 以低解析度 `RenderTexture` 縮圖渲染世界地圖
- [ ] 支援自訂圖標（玩家、NPC、敵人、事件點）疊加
- [ ] 支援迷霧效果（僅顯示探索過的區域）
- [ ] 可掛載至 `UIManager` 管理的任意 Panel

**新增事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `minimap/icon:add` | 命令 | 新增圖標，含 `id / texture / entityId` |
| `minimap/icon:remove` | 命令 | 移除圖標 |
| `minimap/reveal` | 命令 | 揭露指定 tile 範圍（與 FogOfWar 整合）|
| `minimap/resize` | 命令 | 調整顯示尺寸 |

---

### 5. 視野 / 迷霧系統 (Fog of War / Line-of-Sight)

**Namespace:** `fog`

**目標：** 以 tile 為單位追蹤探索狀態，支援扇形 LoS 計算。

**工作項目：**
- [ ] 新增 `FogOfWarPlugin`（`src/plugins/rpg/FogOfWarPlugin.ts`）
- [ ] 以 tile 為單位追蹤三種狀態：`unexplored / explored / visible`
- [ ] 以遮罩貼圖或 Pixi Graphics 繪製迷霧覆蓋層
- [ ] 支援視野角度（`fovAngle`）與距離（`fovRadius`）限制（扇形 LoS）
- [ ] 每幀依玩家位置更新 visible 狀態，expired visible → explored

**新增事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `fog/init` | 命令 | 初始化迷霧地圖（含 `width / height`）|
| `fog/update` | 命令 | 依觀察者位置重算 visible 範圍 |
| `fog/tile:revealed` | 廣播 | tile 首次進入視野 |
| `fog/tile:state:get` | 查詢 | 取得指定 tile 的狀態 |

---

### 6. 過場動畫 / 演出系統 (Cutscene / Cinematic System)

**Namespace:** `cutscene`

**目標：** 以 `Timeline` 為底層驅動，整合攝影機、角色、對話的同步演出。

**工作項目：**
- [ ] 新增 `CutscenePlugin`（`src/plugins/rpg/CutscenePlugin.ts`）
- [ ] 定義 `CutsceneDef`：Timeline 軌道 + 攝影機指令 + 腳本節點序列
- [ ] 整合 `ScriptManager` 腳本指令（`cutscene/play`、`cutscene/skip`）
- [ ] 支援攝影機軌道（平移、縮放、震動）與角色行走、對話的同步排程
- [ ] 過場期間可選擇性鎖定玩家輸入（透過 `GameStateManager` 設 `'cutscene'` 狀態）
- [ ] `cutscene/skip` 跳至最後一幀後立即結束

**新增事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `cutscene/define` | 命令 | 登錄 `CutsceneDef` |
| `cutscene/play` | 命令 | 播放指定過場（含 `{ name }` 參數）|
| `cutscene/skip` | 命令 | 跳過當前過場 |
| `cutscene/started` | 廣播 | 過場開始 |
| `cutscene/ended` | 廣播 | 過場結束 |

---

### 7. 成就系統 (Achievement System)

**Namespace:** `achievement`

**目標：** 事件驅動的成就解鎖系統，與 `VariableStoreManager` 整合持久化進度。

**工作項目：**
- [ ] 新增 `AchievementPlugin`（`src/plugins/rpg/AchievementPlugin.ts`）
- [ ] `AchievementDef`：`id / name / description / icon / condition（事件名稱 + 條件表達式）`
- [ ] 透過 `VariableStoreManager` 持久化解鎖狀態與多步驟進度
- [ ] 支援進度型成就（`progress / total`，例如「擊倒 100 名敵人」）
- [ ] 解鎖時廣播 `achievement/unlocked`，供 UI 顯示 Toast 提示

**新增事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `achievement/define` | 命令 | 登錄成就定義 |
| `achievement/progress` | 命令 | 更新進度（`{ id, delta }`）|
| `achievement/unlock` | 命令 | 強制解鎖（測試用）|
| `achievement/unlocked` | 廣播 | 成就解鎖通知（含完整 `AchievementDef`）|
| `achievement/list:get` | 查詢 | 取得所有成就及目前進度 |

---

### 8. 動態光源系統 (Dynamic Lighting)

**Namespace:** `lighting`

**目標：** 以 `PostFxPipeline` / `ShaderPass` 為渲染底層，支援點光源、環境光與軟陰影。

**工作項目：**
- [ ] 新增 `LightingPlugin`（`src/plugins/rpg/LightingPlugin.ts`）
- [ ] 定義 `PointLight`（位置、半徑、顏色、強度）與 `AmbientLight`（環境基礎亮度）
- [ ] 光照貼圖（light map）合成：每幀將所有光源渲染至獨立 `RenderTexture`，再以 `MULTIPLY` 混合疊加
- [ ] 陰影投射：利用碰撞幾何或實心 tile 進行 shadowcasting 射線計算，產生軟陰影遮罩
- [ ] 提供 `quality` 選項（`low / medium / high`）控制陰影解析度
- [ ] 與 `TweenManager` 整合，可補間光源強度／顏色（燈光閃爍、日夜循環）

**新增事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `lighting/light:add` | 命令 | 新增光源（含 `PointLight` 定義）|
| `lighting/light:remove` | 命令 | 移除光源（含 `id`）|
| `lighting/light:update` | 命令 | 更新光源屬性 |
| `lighting/ambient:set` | 命令 | 設定環境光強度與顏色 |

---

## 🔵 低優先

### 9. 程序生成工具 (Procedural Generation Utilities)

**Namespace:** 純工具函式，無 plugin lifecycle

**目標：** 提供可重現的隨機世界生成工具。

**工作項目：**
- [ ] 提供 Simplex / Perlin Noise 工具函式（地形生成、隨機材質）
- [ ] BSP（Binary Space Partitioning）地下城生成器
- [ ] 隨機種子管理（`seededRandom(seed)`），確保可重現的生成結果

**API 草稿：**
```ts
import { simplexNoise2D, generateDungeon, seededRandom } from '@inkshot/engine/rpg/proc-gen';

const noise = simplexNoise2D(seed);
const height = noise(x / 64, y / 64);          // 0..1

const rng = seededRandom(12345);
const dungeon = generateDungeon({ width: 64, height: 64, rooms: 10, rng });
```

---

### 10. Web Worker 支援 (Web Worker Offloading)

**Namespace:** `workerBridge`（通用）+ `PathfindingManager` 內部改造

**目標：** 將耗時運算移至 Worker，避免主執行緒卡頓。

**工作項目：**
- [ ] 將 `PathfindingManager` 的 A* 計算移至 Web Worker
- [ ] 提供通用 `WorkerBridge` plugin，讓任意 plugin 可將耗時運算 offload 至 Worker
- [ ] Worker 回傳結果後透過 `EventBus` 廣播，保持架構一致

**新增事件（WorkerBridge）：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `workerBridge/task:post` | 命令 | 向指定 Worker 送出任務（含 `taskId / payload`）|
| `workerBridge/task:result` | 廣播 | Worker 回傳結果（含 `taskId / result`）|
| `workerBridge/task:error` | 廣播 | Worker 回報錯誤 |

---

## ⚪ 未來考量

### 11. 網路 / 多人聯機 (Networking)

**Namespace:** `network`

**目標：** 提供可擴充的網路傳輸抽象層，支援 Rollback 或 Lockstep 同步模型。

**工作項目：**
- [ ] 新增 `NetworkManager` plugin（`src/plugins/NetworkManager.ts`）
- [ ] 抽象化底層傳輸（`WebSocket / WebRTC Data Channel`），允許替換後端
- [ ] 提供簡易的 RPC / 事件同步介面（`network/rpc:call`、`network/event:broadcast`）
- [ ] 支援 Rollback Netcode 或 Lockstep 同步模型（擇一實作，另一可由社群貢獻）

**新增事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `network/connect` | 命令 | 連線至指定伺服器 |
| `network/disconnect` | 命令 | 中斷連線 |
| `network/connected` | 廣播 | 連線成功 |
| `network/disconnected` | 廣播 | 連線中斷 |
| `network/message` | 廣播 | 收到遠端訊息 |

---

### 12. 資料持久化擴充 (Persistence Adapters)

**Namespace:** 擴充 `SaveManager`

**目標：** 提供 `LocalStorage` 以外的存檔後端，並支援版本遷移。

**工作項目：**
- [ ] 新增 `IndexedDBSaveAdapter`（適合大型存檔、二進位資料）
- [ ] 定義 `CloudSaveAdapter` 抽象介面（供第三方後端實作，例如 Firebase、Supabase）
- [ ] 存檔版本遷移（migration）工具：`defineMigration(fromVersion, toVersion, migrateFn)`

---

### 13. 熱重載與插件動態更新 (Hot Reload / Live Update)

**Namespace:** 開發工具，不進生產建置

**目標：** 縮短開發迭代週期，在不重啟引擎的情況下更新場景與資源。

**工作項目：**
- [ ] 支援在不重啟引擎的情況下重新載入場景（`scene/reload` 命令）
- [ ] 資源熱替換：修改圖片後自動更新 Pixi texture cache（監聽檔案系統變更）
- [ ] 整合 Vite HMR API（`import.meta.hot`），開發期自動觸發場景重新載入

---

## RPG 插件目錄結構

以下插件歸類於 `src/plugins/rpg/`，與通用引擎插件區分：

```
src/plugins/
├── rpg/                         ← RPG / 敘事遊戲專用插件
│   ├── PlayerController.ts      ✅ 已完成
│   ├── ActorManager.ts          ✅ 已完成
│   ├── DialogueManager.ts       ✅ 已完成
│   ├── DialogueMarkupParser.ts  ✅ 已完成
│   ├── ScriptManager.ts         ✅ 已完成
│   ├── VariableStoreManager.ts  ✅ 已完成
│   ├── TiledLoader.ts           🔲 待實作
│   ├── MinimapPlugin.ts         🔲 待實作
│   ├── FogOfWarPlugin.ts        🔲 待實作
│   ├── CutscenePlugin.ts        🔲 待實作
│   ├── AchievementPlugin.ts     🔲 待實作
│   └── LightingPlugin.ts        🔲 待實作
├── AudioManager.ts              ← 通用引擎插件
├── EntityManager.ts
├── InputManager.ts
├── ...
```
