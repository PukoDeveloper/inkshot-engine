# TODO — inkshot-engine 缺少功能清單

以下是目前引擎尚未實作、但對於一個完整 2D 遊戲引擎而言重要的功能，依優先程度排列。

---

## 🔴 高優先

### 1. 粒子系統 (Particle System) ✅
- [x] 新增 `ParticleManager` plugin（namespace: `particle`）
- [x] 支援發射器（Emitter）設定：發射速率、方向、散射角、存活時間
- [x] 支援粒子屬性隨時間變化：位置、縮放、旋轉、透明度、顏色
- [x] 支援重力與外力（wind、gravity）及每粒子隨機偏差（gravityVariance、windVariance）
- [x] 支援 Burst（一次性噴發）與持續發射兩種模式
- [x] 支援旋轉動畫（startRotation、angularVelocity 及其偏差欄位）
- [x] 支援發射形狀（spawnShape: point / rect / circle）
- [x] 支援 Texture 貼圖粒子（texture 欄位，使用 Sprite.from）
- [x] 支援 Pre-warm（preWarm：建立時立即模擬指定 ms）
- [x] 支援 RepeatBurst（repeatBurst + repeatInterval：burst 自動循環）
- [x] 透過 EventBus 控制：`particle/emit`、`particle/stop`、`particle/clear`
- [x] 透過 EventBus 移動發射器：`particle/move`
- [x] 透過 EventBus 暫停/恢復：`particle/pause`、`particle/resume`
- [x] 透過 EventBus 熱更新設定：`particle/update`
- [x] 透過 EventBus 查詢計數：`particle/count`（回傳 emitterCount、particleCount）
- [x] 與 `ObjectPool` 整合，避免 GC 壓力
- [x] 事件：`particle/complete`（Burst 自然結束 或 持續發射器 duration 結束後最後粒子死亡時發出）

### 2. Tilemap 渲染器 (Tilemap Renderer) ✅
- [x] 新增 `TilemapManager` plugin（namespace: `tilemap`）
- [x] 分塊渲染（Chunk-based rendering）：地圖切分為 N×N Tile 的 Chunk，每個 Chunk 設 `cullable=true`，Pixi 自動略過不在視口內的 Chunk，支援 10 000×10 000+ Tile 規模地圖
- [x] 支援多圖層（Multiple layers）：任意數量圖層，每層可獨立設定 opacity、visible、zOffset
- [x] 支援動態 Tile（動畫 Tile）：`animatedTiles` 定義多幀序列，由 `core/update` 驅動，直接更新 Sprite 貼圖不重建整個 Chunk
- [x] 支援 Auto-tiling（自動連接）：4-bit / 8-bit 相鄰遮罩，`autoConnect:true` 自動對放置格與周邊格重算 variant Tile ID
- [x] 與現有 `CollisionManager` 的 `collision/tilemap:set` 整合（圖層設 `collider:true` 自動同步碰撞資料）
- [x] 事件：`tilemap/load`、`tilemap/unload`、`tilemap/set-tile`、`tilemap/get-tile`、`tilemap/loaded`、`tilemap/unloaded`
- [x] 直接 API：`getTile()`、`setTile()`

---

## 🟠 中高優先

### 3. 定時器 / 排程系統 (Timer / Scheduler)
- [ ] 新增 `TimerManager` plugin（namespace: `timer`）
- [ ] 支援單次延遲回呼：`timer/once`（delay ms 後執行）
- [ ] 支援重複間隔回呼：`timer/interval`
- [ ] 支援冷卻查詢：`timer/cooldown`（是否已過冷卻期）
- [ ] 所有計時器綁定至 `core/tick`，暫停遊戲時自動暫停
- [ ] 事件：`timer/cancelled`、`timer/fired`

### 4. 手柄 / 控制器輸入 (Gamepad Support)
- [ ] 擴充 `InputManager`，加入瀏覽器 Gamepad API 支援
- [ ] 映射搖桿軸向（Analog Axes）至邏輯 action
- [ ] 支援按鍵下壓、放開的標準事件：`input/gamepad:button:down`、`input/gamepad:button:up`
- [ ] 支援震動回饋（Haptic Feedback，若瀏覽器支援）
- [ ] 可在 `input/action:bind` 中同時綁定鍵盤與手柄按鍵

---

## 🟡 中優先

### 5. UI 元件系統 (UI Widget System)
- [ ] 新增 `UIManager` plugin（namespace: `ui`）
- [ ] 內建基礎元件：`Button`、`Label`、`Panel`、`ProgressBar`、`Slider`
- [ ] 支援 `ScrollView` 和 `Dialog`（含確認/取消按鈕）
- [ ] 元件支援 i18n 文字（自動訂閱 `i18n/changed`）
- [ ] 事件驅動：`ui/show`、`ui/hide`、`ui/destroy`
- [ ] 支援簡易佈局（anchor、padding、stack layout）

### 6. 空間音效 (Spatial / Positional Audio)
- [ ] 擴充 `AudioManager`，加入 `PannerNode` 支援
- [ ] `audio/play` 新增 `position: { x, y }` 可選參數
- [ ] 根據攝影機位置自動計算音量衰減與左右聲道平移
- [ ] 新增 `audio/listener:update` 事件，讓 Camera 驅動音訊聆聽者位置
- [ ] 支援最大聆聽距離與衰減曲線設定

### 7. 尋路系統 (Pathfinding)
- [ ] 新增 `PathfindingManager` plugin（namespace: `pathfinding`）
- [ ] 實作 A* 演算法，以 tilemap 為地圖來源
- [ ] 支援加權地形（不同 tile 移動代價）
- [ ] 支援動態障礙物（基於 `CollisionManager` 的 BODY 實體）
- [ ] 事件：`pathfinding/find`（params: `from`, `to` → output: `path[]`）
- [ ] 路徑快取機制，避免每幀重算

---

## 🔵 低優先

### 8. 開發者偵錯工具 (Debug / Dev Tools Overlay)
- [ ] 新增 `DebugPlugin`（namespace: `debug`），僅在開發模式下載入
- [ ] 顯示 FPS 計數器與幀時間圖表
- [ ] 碰撞框（Collider）可視化（繪製 AABB / 圓形輪廓）
- [ ] 實體 Inspector（列出所有活躍實體及其 tags / data）
- [ ] EventBus 事件日誌（記錄最近 N 個事件）
- [ ] 快速鍵切換 debug overlay 顯示 / 隱藏

### 9. 對話 / 劇情腳本系統 (Dialogue / Cutscene System)
- [ ] 新增 `DialogueManager` plugin（namespace: `dialogue`）
- [ ] 支援對話樹 JSON 格式（節點 ID、文字、選項、跳轉條件）
- [ ] 支援條件分支（根據 `save/global:get` 或 `game/state:get`）
- [ ] 與 `i18n/t` 整合，對話文字自動多語系化
- [ ] 事件：`dialogue/start`、`dialogue/advance`、`dialogue/end`、`dialogue/choice`
- [ ] 支援打字機效果（字元逐一顯示）

---

## ⚪ 未來考量

### 10. 網路 / 多人聯機 (Networking)
- [ ] 新增 `NetworkManager` plugin（namespace: `network`）
- [ ] 抽象化底層傳輸（WebSocket / WebRTC）
- [ ] 提供簡易的 RPC / 事件同步介面
- [ ] 支援 Rollback Netcode 或 Lockstep 同步模型（擇一）
- [ ] 事件：`network/connect`、`network/disconnect`、`network/message`

### 11. 資料持久化擴充 (Persistence Adapters)
- [ ] 新增 `IndexedDBSaveAdapter`（適合大型存檔資料）
- [ ] 新增 `CloudSaveAdapter` 介面（供第三方後端實作）
- [ ] 存檔版本遷移（migration）工具，處理舊版存檔格式升級

### 12. 熱重載與插件動態更新 (Hot Reload / Live Update)
- [ ] 支援在不重啟引擎的情況下重新載入場景或 plugin
- [ ] 資源熱替換（修改圖片後自動更新 Pixi cache）
