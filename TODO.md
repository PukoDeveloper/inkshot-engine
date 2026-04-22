# TODO — inkshot-engine 功能清單

> **注意：** 本文件是**規劃文件**，用於追蹤已完成功能與尚在規劃中的功能。  
> 「尚未實作」區段的功能尚未包含在任何已發佈版本中。  
> 如需了解目前可用的功能，請參閱 [README](./README.md) 與 [文件中心](./docs/README.md)。

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
| 11 | **Tilemap 渲染器** — 分塊渲染（10 000×10 000+ Tile）、多圖層、動畫 Tile、Auto-tiling（4/8-bit 遮罩）、碰撞自動同步 | `TilemapManager` |
| 12 | **粒子系統** — 連續/Burst 模式、重力/風力、形狀發射（point/rect/circle）、貼圖粒子、Pre-warm、RepeatBurst、ObjectPool 整合 | `ParticleManager` |
| 13 | **補間動畫** — 豐富緩動函式庫、yoyo/loop/repeat、delay、`Timeline` 序列/並行軌道 | `TweenManager`, `Timeline` |
| 14 | **定時器/排程** — `timer/once`、`timer/interval`、`timer/cooldown`；暫停遊戲時自動凍結 | `TimerManager` |
| 15 | **尋路系統** — A* 演算法、加權地形、動態障礙物、BFS fallback、LoS 路徑平滑、512 筆 LRU 快取；`pathfinding/find:async` 異步 Worker 模式 | `PathfindingManager` |
| 16 | **UI 元件系統** — Button/Label/Panel/ProgressBar/Slider/ScrollView/Dialog/StackPanel/DialogueBox；anchor 佈局；i18n 整合；自訂元件工廠登錄 | `UIManager` |
| 17 | **對話系統** — 打字機效果、Rich-text 標記（顏色/速度/暫停）、選項選擇、i18n 整合、`dialoguebox` UI 元件 | `DialogueManager`, `DialogueMarkupParser` |
| 18 | **腳本系統** — 非同步命令節點執行、多實例並發、內建命令（jump/if/wait/emit/say/choices/fork/call/wait-event）、ScriptError 事件 | `ScriptManager` |
| 19 | **角色/演員系統** — ActorDef 狀態機、Trigger 條件、腳本掛鉤、批次管理 | `ActorManager` |
| 20 | **變數儲存** — 命名空間二層 key-value store、深度 clone 快照、與 `save/slot:save`/`save/slot:load` 自動整合、store-set/get/patch 腳本命令 | `VariableStoreManager` |
| 21 | **本地化 (i18n)** — 動態載入語系檔、插值、複數化、locale 切換廣播、UI/Dialog 自動訂閱 | `LocalizationManager` |
| 22 | **遊戲狀態管理** — `GamePhase` 狀態機（menu/loading/playing/paused/gameover） | `GameStateManager` |
| 23 | **插件依賴排序** — `sortPluginsByDependency`，依 `dependencies` 自動拓撲排序初始化順序 | `sortPlugins` |
| 24 | **開發者偵錯工具** — FPS 折線圖（16 ms 基準線）、碰撞框可視化（BODY/HITBOX/SENSOR 分色）、實體 Inspector、Tilemap 格線/chunk 邊界疊加、EventBus 事件日誌（關鍵字篩選）、快速鍵切換（`` ` `` / F12） | `DebugPlugin` |
| 25 | **物理引擎適配器** — `MatterPhysicsAdapter`（Matter.js，輕量瀏覽器後端）、`RapierPhysicsAdapter`（Rapier.js WASM，高效能剛體）；`physics/impulse` 衝力支援；物理步驟後 entity.position 同步；`createEngine` 雙後端保護 | `MatterPhysicsAdapter`, `RapierPhysicsAdapter` |
| 26 | **視差捲動** — 多圖層視差捲動、每層獨立 `factorX`/`factorY`、origin 偏移、`renderer/pre-render` 驅動位置更新 | `ParallaxPlugin` |
| 27 | **Tiled 地圖載入器** — 解析 `.tmj` JSON 格式、Tile 圖層→`TilemapData`、物件圖層→`ActorDef`（工廠函式）、Tiled 屬性萃取、Wang Tile→`AutotileGroupDef` 轉換 | `TiledLoader` |
| 28 | **過場動畫系統** — 步驟式演出（wait / emit / camera-shake / camera-move / camera-zoom / camera-follow / lock-input / unlock-input / parallel）、可跳過、`cutscene/started`/`ended`/`step:started`/`step:ended` 事件 | `CutscenePlugin` |
| 29 | **小地圖系統** — 世界縮圖渲染、圖標疊加（玩家/NPC/敵人/事件點）、霧效整合、直接 pull API | `MinimapPlugin` |
| 30 | **成就系統** — 事件驅動觸發、多步驟進度追蹤、`triggerEvent`/`triggerFilter` 自動計數、save/load 持久化整合 | `AchievementPlugin` |
| 31 | **動態光源系統** — `PointLight`（位置/半徑/顏色/強度）、`AmbientLight`（顏色/強度）、MULTIPLY 混合光照貼圖、逐幀 Graphics 繪製；與 `TweenManager` 整合（燈光閃爍、日夜循環） | `LightingPlugin` |
| 32 | **視野/迷霧系統** — Tile 網格追蹤（unexplored/explored/visible）、圓形可見範圍更新、矩形強制揭示、`fog/tile:revealed` 事件、逐幀 Graphics 繪製 | `FogOfWarPlugin` |
| 33 | **Web Worker 橋接** — 通用 `WorkerBridge`（泛型雙向 postMessage、Transferable 零拷貝、maxConcurrent 限流、terminate 清理）；`PathfindingManager` A* 移至 Worker（`pathfinding/find:async`），主執行緒同步 API 不變 | `WorkerBridge` |
| 34 | **存檔後端擴充** — `IndexedDBSaveAdapter`（適合大型存檔/二進位資料）；`SaveMigrationPlugin` 存檔版本遷移工具（migration chain，自動升級舊格式） | `IndexedDBSaveAdapter`, `SaveMigrationPlugin` |
| 35 | **遊戲設定管理** — `SettingsManager`（namespace: `settings`）統一管理玩家偏好設定；schema 由開發者透過 `defaults` 自訂；與 `InputManager` 整合支援按鍵重綁定（`bridges.inputBindings`）；與 `LocalizationManager` 整合（`bridges.locale`）；透過 `SaveManager` 全域存檔持久化 | `SettingsManager` |
| 36 | **JSON 資料集合管理** — `DataManager`（namespace: `data`）載入並管理具型別的 JSON 資料集合（items、skills、enemies 等）；`data/load`（非同步，支援 file 路徑或 inline entries）、`data/get`、`data/getAll`、`data/unload`；多次載入同名集合時自動合併（新鍵覆蓋） | `DataManager` |
| 37 | **RPG 系統套件** — 完整回合制 RPG 子系統，包含：`StatsSystem`（基礎數值、加法/乘法修正器、狀態異常含持續時間與 tick 傷害）、`InventorySystem`（per-actor 物品堆疊與裝備欄位）、`ExperienceSystem`（可設定的 EXP 曲線、升級通知）、`BattleSystem`（多並行戰鬥場次、acting/resolving 相位流程、傷害公式）、`ShopSystem`（買賣物品、gold 透過 VariableStore 管理）、`PlayerController`（輸入 action → 物理移動，標籤自動偵測玩家實體）、`RpgMenuSystem`（暫停選單狀態機、頁面導航、按鍵綁定） | `StatsSystem`, `InventorySystem`, `ExperienceSystem`, `BattleSystem`, `ShopSystem`, `PlayerController`, `RpgMenuSystem` |
| 38 | **RPG 引擎一鍵啟動** — `createRpgEngine()`（單一呼叫啟動含完整 RPG 插件套件的引擎並回傳具型別的 `rpg` 命名空間）；`buildRpgPluginBundle()`（回傳有序插件陣列，適用手動組合）；`RPG_PLUGIN_BUNDLE`（模組載入期快照） | `createRpgEngine`, `buildRpgPluginBundle` |
| 39 | **RPG 資料載入器** — `loadRpgData(RpgGameData)`：將宣告式 JSON 格式的遊戲資料（classes、actors、items、statusEffects、scripts 等）轉換為引擎原生定義物件（ActorDef、ExpCurveDef、StatProfileDef、ItemDef…），可直接注入各插件系統；支援 `meta`（標題/版本/locale/initialGold/initialVariables） | `loadRpgData`, `RpgDataLoader` |
| 40 | **Tilemap 視覺編輯器** — `TilemapEditorPlugin`（namespace: `mapeditor`）：瀏覽器內嵌完整 Tile 編輯工作流，支援 Pencil / Eraser / Flood Fill（BFS）/ Rect Fill / Rect Select（含複製貼上）；Undo/Redo 命令堆疊（最多 100 步）；Export 深度 clone；攝影機空間座標轉換。`TilemapEditorOverlayPlugin`：格線疊加、選取矩形、游標高亮等視覺 overlay | `TilemapEditorPlugin`, `TilemapEditorOverlayPlugin` |
| 41 | **場景物件擺放編輯器** — `SceneEditorPlugin`（namespace: `scene-editor`）：瀏覽器內嵌輕量場景擺放工具；工具模式（place / select / move / erase）；依 `actorType` 放置 `ScenePlacedObject`；物件選取、移動、刪除；Undo/Redo 命令堆疊（最多 100 步）；Export 輸出物件陣列與 Tiled 相容 object layer（`.tmj` 格式） | `SceneEditorPlugin` |
| 42 | **節點式腳本視覺化編輯器** — `ScriptNodeEditorPlugin`（namespace: `script-node-editor`）：節點圖→命令序列 JSON；節點新增（node:add）、更新（node:update）、刪除（node:remove）；流程連接（node:connect）；Undo/Redo 命令堆疊（最多 100 步）；Export 編譯為 `ScriptDef`；Compile 直接呼叫 `script/define` 注入 ScriptManager | `ScriptNodeEditorPlugin` |

---

## 🟡 中優先

### 1. 視野角度限制 (Line-of-Sight Cone)
- [ ] 擴充 `FogOfWarPlugin`，支援視野角度與距離限制（扇形 LoS），計算可見扇形範圍並更新 tile 狀態

### 2. 動態光源陰影 (Shadow Casting)
- [ ] 遮擋 / 陰影投射：利用 `KinematicPhysicsAdapter` 的碰撞幾何或 TilemapManager 的實心 tile，進行 shadowcasting 射線計算，產生軟陰影遮罩
- [ ] 效能優化：僅重建視野範圍內的光源；提供 `quality` 選項（low/medium/high）控制陰影解析度

---

## 🔵 低優先

### 3. 程序生成工具 (Procedural Generation Utilities)
- [ ] 提供 Simplex/Perlin Noise 工具函式（地形生成、隨機材質）
- [ ] BSP（Binary Space Partitioning）地下城生成器
- [ ] 隨機種子管理（確保可重現的生成結果）

---

## ⚪ 未來考量

### 5. 網路 / 多人聯機 (Networking)
- [ ] 新增 `NetworkManager` plugin（namespace: `network`）
- [ ] 抽象化底層傳輸（WebSocket / WebRTC Data Channel）
- [ ] 提供簡易的 RPC / 事件同步介面
- [ ] 支援 Rollback Netcode 或 Lockstep 同步模型（擇一）
- [ ] 事件：`network/connect`、`network/disconnect`、`network/message`

### 6. 雲端存檔 (Cloud Save Adapter)
- [ ] 新增 `CloudSaveAdapter` 抽象介面（供第三方後端實作，例如 Firebase、Supabase、自建 REST API）
- [ ] 定義衝突解決策略（以伺服器為準 / 以客戶端為準 / 手動合併）

### 7. 熱重載與插件動態更新 (Hot Reload / Live Update)
- [ ] 支援在不重啟引擎的情況下重新載入場景或 plugin
- [ ] 資源熱替換（修改圖片後自動更新 Pixi texture cache）
- [ ] 整合 Vite HMR API，開發期自動觸發場景重新載入

### 8. 截圖與 GIF 錄製 (Screenshot / GIF Recording)
- [ ] 提供 `capture/screenshot`（PNG/JPEG）事件，直接從 Pixi Renderer 擷取當前畫面
- [ ] 提供 `capture/gif:start` / `capture/gif:stop` 連續幀錄製，輸出 GIF 或 WebM
- [ ] 與 `InputRecorder` 整合，支援附帶輸入序列的完整回放錄影

### 9. 平台適配層 (Platform SDK Integration)
- [ ] 提供 Electron / Tauri 適配器，橋接本機檔案系統存檔（替換 `LocalStorageSaveAdapter`）
- [ ] 提供 Steam Greenworks / Web API 橋接：成就同步、雲端存檔、排行榜
- [ ] 抽象化全螢幕/視窗管理，統一 web 與桌面平台差異

### 10. 可視化場景 / 腳本編輯器 (Visual Editor Tooling)
- [x] 基於 `TiledLoader` 擴充，提供瀏覽器內嵌的輕量場景擺放工具（匯出 `.tmj` 或引擎原生格式）— `SceneEditorPlugin`
- [x] 基於 `ScriptManager` 的節點式腳本視覺化編輯器（節點圖→命令序列 JSON）— `ScriptNodeEditorPlugin`
- [ ] 整合 `DebugPlugin`，支援執行期點選實體後直接查看/修改屬性
