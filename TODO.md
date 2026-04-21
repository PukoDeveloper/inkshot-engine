# TODO — inkshot-engine 功能清單

本文件記錄已完成功能的摘要，以及尚未實作的建議功能，依優先程度排列。

---

## ✅ 已完成功能 (Completed)

以下功能已完整實作並通過測試：

| # | 功能 | Plugin / 模組 |
|---|------|--------------|
| 1 | **核心引擎與事件匯流排** — `createEngine()`、`Core`、`EventBus`（同步/非同步、before/after phase、優先權、once） | `Core`, `EventBus` |
| 2 | **渲染管線** — Pixi.js 整合、多圖層管理、後製特效（`PostFxPipeline`/`ShaderPass`）、固定步長更新（`FixedTimeStep`）、精靈動畫（`AnimationSystem`）、物件池（`ObjectPool`） | `Renderer`, `RenderPipeline`, `PostFxPipeline` |
| 3 | **攝影機** — 跟隨目標、限制邊界、縮放、震動（`camera/shake`）、攝影機驅動空間音效聆聽者 | `Camera` |
| 4 | **資源管理** — 非同步資源載入（Pixi Assets）、Bundle 分包、進度回報、預先抓取 | `ResourceManager` |
| 5 | **輸入系統** — 鍵盤、滑鼠/指標、邏輯 Action 綁定；Gamepad API（軸向映射、震動回饋）；多點觸控（Multi-touch）；手勢辨識（Pinch-zoom、雙指旋轉、Swipe）；手勢映射至邏輯 action；`InputRecorder` 逐幀錄製/回放/序列化 | `InputManager`, `InputRecorder` |
| 6 | **音效系統** — 分類音量控制、淡入淡出、暫停/恢復、空間音效（`PannerNode`）、聆聽者位置更新 | `AudioManager` |
| 7 | **存檔系統** — 多存檔槽、全域存檔、`LocalStorageSaveAdapter`；before/after phase 掛鉤方便環境擴充 | `SaveManager`, `LocalStorageSaveAdapter` |
| 8 | **場景管理** — 場景登錄/切換、非同步載入、`LoadingScreen` 進度顯示 | `SceneManager`, `LoadingScreen` |
| 9 | **實體系統** — 標籤查詢、`SpriteAnimator`（影格動畫定義與播放） | `EntityManager`, `SpriteAnimator` |
| 10 | **碰撞系統** — AABB/圓形/點形碰撞、Tile 地圖碰撞（實心/單向/斜面）、射線投射、感測器重疊事件 | `KinematicPhysicsAdapter` |
| 25 | **物理引擎適配器** — `MatterPhysicsAdapter`（Matter.js，輕量瀏覽器後端）、`RapierPhysicsAdapter`（Rapier.js WASM，高效能剛體）；`physics/impulse` 衝力支援；物理步驟後 entity.position 同步；`createEngine` 雙後端保護 | `MatterPhysicsAdapter`, `RapierPhysicsAdapter` |
| 11 | **Tilemap 渲染器** — 分塊渲染（10 000×10 000+ Tile）、多圖層、動畫 Tile、Auto-tiling（4/8-bit 遮罩）、碰撞自動同步 | `TilemapManager` |
| 12 | **粒子系統** — 連續/Burst 模式、重力/風力、形狀發射（point/rect/circle）、貼圖粒子、Pre-warm、RepeatBurst、ObjectPool 整合 | `ParticleManager` |
| 13 | **補間動畫** — 豐富緩動函式庫、yoyo/loop/repeat、delay、`Timeline` 序列/並行軌道 | `TweenManager`, `Timeline` |
| 14 | **定時器/排程** — `timer/once`、`timer/interval`、`timer/cooldown`；暫停遊戲時自動凍結 | `TimerManager` |
| 15 | **尋路系統** — A* 演算法、加權地形、動態障礙物、BFS fallback、LoS 路徑平滑、512 筆 LRU 快取 | `PathfindingManager` |
| 16 | **UI 元件系統** — Button/Label/Panel/ProgressBar/Slider/ScrollView/Dialog/StackPanel/DialogueBox；anchor 佈局；i18n 整合；自訂元件工廠登錄 | `UIManager` |
| 17 | **對話系統** — 打字機效果、Rich-text 標記（顏色/速度/暫停）、選項選擇、i18n 整合、`dialoguebox` UI 元件 | `DialogueManager`, `DialogueMarkupParser` |
| 18 | **腳本系統** — 非同步命令節點執行、多實例並發、內建命令（jump/if/wait/emit/say/choices/fork/call/wait-event）、ScriptError 事件 | `ScriptManager` |
| 19 | **角色/演員系統** — ActorDef 狀態機、Trigger 條件、腳本掛鉤、批次管理 | `ActorManager` |
| 20 | **變數儲存** — 命名空間二層 key-value store、深度 clone 快照、與 `save/slot:save`/`save/slot:load` 自動整合、store-set/get/patch 腳本命令 | `VariableStoreManager` |
| 21 | **本地化 (i18n)** — 動態載入語系檔、插值、複數化、locale 切換廣播、UI/Dialog 自動訂閱 | `LocalizationManager` |
| 22 | **遊戲狀態管理** — `GamePhase` 狀態機（menu/loading/playing/paused/gameover） | `GameStateManager` |
| 23 | **插件依賴排序** — `sortPluginsByDependency`，依 `dependencies` 自動拓撲排序初始化順序 | `sortPlugins` |
| 26 | **視差捲動** — 多圖層視差捲動、每層獨立 `factorX`/`factorY`、origin 偏移、`renderer/pre-render` 驅動位置更新 | `ParallaxPlugin` |
| 27 | **Tiled 地圖載入器** — 解析 `.tmj` JSON 格式、Tile 圖層→`TilemapData`、物件圖層→`ActorDef`（工廠函式）、Tiled 屬性萃取 | `loadTiledMap` |
| 28 | **過場動畫系統** — 步驟式演出（wait / emit / camera-shake / camera-move / camera-zoom / camera-follow / lock-input / unlock-input / parallel）、可跳過、`cutscene/started`/`ended`/`step:started`/`step:ended` 事件 | `CutscenePlugin` |
| 29 | **小地圖系統** — 世界縮圖渲染、圖標疊加（玩家/NPC/敵人/事件點）、直接 pull API | `MinimapPlugin` |
| 30 | **成就系統** — 事件驅動觸發、多步驟進度追蹤、`triggerEvent`/`triggerFilter` 自動計數、save/load 持久化整合 | `AchievementPlugin` |
| 31 | **動態光源系統** — `PointLight`（位置/半徑/顏色/強度）、`AmbientLight`（顏色/強度）、MULTIPLY 混合光照貼圖、逐幀 Graphics 繪製 | `LightingPlugin` |
| 32 | **視野/迷霧系統** — Tile 網格追蹤（unexplored/explored/visible）、圓形可見範圍更新、矩形強制揭示、`fog/tile:revealed` 事件、逐幀 Graphics 繪製 | `FogOfWarPlugin` |

---

## 🔴 高優先

### 1. 開發者偵錯工具 (Debug / Dev Tools Overlay)
- [x] 新增 `DebugPlugin`（namespace: `debug`），僅在開發模式下載入
- [x] FPS 計數器與幀時間折線圖（顯示 16 ms 基準線）
- [x] 碰撞框（Collider）可視化：繪製 AABB、圓形、斜面輪廓，顏色依圖層（BODY/HITBOX/SENSOR）區分
- [x] 實體 Inspector：列出所有活躍實體及其 tags、position、data
- [x] Tilemap 格線疊加層，標示 chunk 邊界與碰撞 tile
- [x] EventBus 事件日誌面板（記錄最近 N 個事件，支援關鍵字篩選）
- [x] 快速鍵切換 overlay 顯示/隱藏（預設 `` ` `` / F12）

### 2. 物理引擎整合 (Physics Engine Adapter)
- [x] 定義 `PhysicsAdapter` 統一介面（namespace: `physics`）— 所有後端必須實作相同的事件集
- [x] 將原 `CollisionManager` 重構為 `KinematicPhysicsAdapter`（預設後端），使用 `physics/*` 事件
- [x] 所有跨插件事件（TilemapManager、PathfindingManager）均以 `physics/tilemap:set` 統一通訊
- [x] 更新 `ARCHITECTURE.md` 第 10 節，正確反映 `KinematicPhysicsAdapter` 與 `physics/*` 事件，並加入自訂後端實作指南
- [x] 提供 [Matter.js](https://brm.io/matter-js/) 適配器（輕量，適合瀏覽器），實作 `PhysicsAdapter` 介面
- [x] 提供 [Rapier.js](https://rapier.rs/) WASM 適配器（高效能剛體/軟體模擬），實作 `PhysicsAdapter` 介面
- [x] 剛體後端：`physics/tilemap:set` 轉換為靜態剛體網格（批次建立 ChainShape/BoxBody）
- [x] 剛體後端：`physics/impulse` 對剛體施加衝力；`KinematicPhysicsAdapter` 可忽略此事件
- [x] 引擎啟動時驗證最多只有一個 `namespace = 'physics'` 的插件被登錄，避免雙重後端
- [x] 與 `EntityManager` 位置同步（物理步驟後更新 entity.position）

---

## 🟠 中高優先

### 3. 觸控與手勢輸入 (Touch / Gesture Input)
- [x] 擴充 `InputManager`，辨識多點觸控（Multi-touch）
- [x] 支援常見手勢：捏合縮放（Pinch-zoom）、雙指旋轉、滑動（Swipe）
- [x] 映射手勢至邏輯 action，與鍵盤/手柄統一接口

### 4. Tiled 地圖編輯器整合 (Tiled Map Editor Import)
- [x] 新增 `TiledLoader` 工具函式，解析 `.tmj`（Tiled JSON）格式
- [x] 將 Tiled 圖層、物件圖層（Object Layer）轉換為 `TilemapData` 與 `ActorDef`
- [x] 支援 Tiled 的 Tile 屬性（自訂 collision shape、animated tile 設定）
- [x] 支援 Wang Tile（Tiled 的 auto-tiling 格式）轉換為 `AutotileGroupDef`

### 5. 輸入錄製與回放 (Input Recording & Playback)
- [x] 新增 `InputRecorder` plugin，逐幀記錄所有輸入事件（按鍵、指標、手柄）
- [x] 支援序列化為 JSON 並持久化（配合 `SaveManager`）
- [x] 回放模式：注入錄製的輸入序列，可用於自動測試、Demo 錄影、遊戲回放

---

## 🟡 中優先

### 6. 小地圖系統 (Minimap)
- [x] 新增 `MinimapPlugin`（namespace: `minimap`），以低解析度縮圖渲染世界地圖
- [x] 支援自訂圖標（玩家、NPC、敵人、事件點）疊加
- [x] 支援霧效（探索過的區域才顯示）
- [x] 可掛載至 UI 層的任意位置

### 7. 視野 / 迷霧系統 (Fog of War / Line-of-Sight)
- [x] 新增 `FogOfWarPlugin`（namespace: `fog`）
- [x] 以 tile 為單位追蹤探索狀態（unexplored / explored / visible）
- [x] 以遮罩貼圖或 Pixi Graphics 繪製迷霧
- [ ] 支援視野角度與距離限制（扇形 LoS）
- [x] 事件：`fog/tile:revealed`（tile 首次進入視野）

### 8. 過場動畫 / 演出系統 (Cutscene / Cinematic System)
- [x] 新增 `CutscenePlugin`（namespace: `cutscene`），以 Timeline 為底層驅動
- [x] 整合 `ScriptManager` 腳本指令（`cutscene/play`、`cutscene/skip`）
- [x] 支援攝影機軌道（平移、縮放、震動）與角色行走、對話的同步排程
- [x] 過場期間可選擇性鎖定玩家輸入

### 9. 成就系統 (Achievement System)
- [x] 新增 `AchievementPlugin`（namespace: `achievement`）
- [x] 成就定義：id、名稱、描述、圖示、觸發條件（事件 + 條件表達式）
- [x] 透過 `save/slot:save`/`save/slot:load` 持久化解鎖進度
- [x] 事件：`achievement/unlocked`（解鎖時廣播，供 UI 顯示提示）
- [x] 支援多步驟成就（進度追蹤，例如「擊倒 100 名敵人」）

### 10. 動態光源系統 (Dynamic Lighting)
- [x] 新增 `LightingPlugin`（namespace: `lighting`），以獨立 Pixi Graphics 圖層為渲染底層
- [x] 定義 `PointLight`（位置、半徑、顏色、強度）與 `AmbientLight`（環境基礎亮度）資料結構
- [x] 光照貼圖（light map）合成：每幀將所有光源渲染至獨立 Graphics 圖層，再以 `MULTIPLY` 混合疊加到世界圖層
- [ ] 遮擋 / 陰影投射：利用 `KinematicPhysicsAdapter` 的碰撞幾何或 TilemapManager 的實心 tile，進行 shadowcasting 射線計算，產生軟陰影遮罩
- [x] API：`lighting/light:add`、`lighting/light:remove`、`lighting/light:update`（支援 EventBus 與直接呼叫）
- [x] 與 `TweenManager` 整合，可補間光源強度／顏色（燈光閃爍、日夜循環）
- [ ] 效能考量：僅重建視野範圍內的光源；提供 `quality` 選項（low/medium/high）控制陰影解析度

---

## 🔵 低優先

### 10. 程序生成工具 (Procedural Generation Utilities)
- [ ] 提供 Simplex/Perlin Noise 工具函式（地形生成、隨機材質）
- [ ] BSP（Binary Space Partitioning）地下城生成器
- [ ] 隨機種子管理（確保可重現的生成結果）

### 11. Web Worker 支援 (Web Worker Offloading)
- [x] 將 `PathfindingManager` 的 A* 計算移至 Worker，避免主執行緒卡頓（`pathfinding/find:async` + `workerUrl` 選項；`pathfinding/find` 同步 API 維持不變）
- [x] 提供通用 `WorkerBridge`，讓任意 plugin 可將耗時運算 offload 至 Worker（`src/core/WorkerBridge.ts`，泛型雙向 postMessage 橋接，支援 Transferable 零拷貝、maxConcurrent 限流、terminate 清理）
- [x] Worker 回傳結果後透過 EventBus 廣播，保持架構一致（`pathfinding/find:async` handler 在 WorkerBridge.run() resolve 後寫入 EventBus output，語義與 `emit()` 完全一致）

---

## ⚪ 未來考量

### 12. 網路 / 多人聯機 (Networking)
- [ ] 新增 `NetworkManager` plugin（namespace: `network`）
- [ ] 抽象化底層傳輸（WebSocket / WebRTC Data Channel）
- [ ] 提供簡易的 RPC / 事件同步介面
- [ ] 支援 Rollback Netcode 或 Lockstep 同步模型（擇一）
- [ ] 事件：`network/connect`、`network/disconnect`、`network/message`

### 13. 資料持久化擴充 (Persistence Adapters)
- [ ] 新增 `IndexedDBSaveAdapter`（適合大型存檔、二進位資料）
- [ ] 新增 `CloudSaveAdapter` 抽象介面（供第三方後端實作）
- [ ] 存檔版本遷移（migration）工具，處理舊版存檔格式升級

### 14. 熱重載與插件動態更新 (Hot Reload / Live Update)
- [ ] 支援在不重啟引擎的情況下重新載入場景或 plugin
- [ ] 資源熱替換（修改圖片後自動更新 Pixi texture cache）
- [ ] 整合 Vite HMR API，開發期自動觸發場景重新載入
