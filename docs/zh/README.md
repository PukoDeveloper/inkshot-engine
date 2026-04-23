# inkshot-engine 文件中心（繁體中文）

歡迎來到 **inkshot-engine** 的繁體中文文件。

---

## 📚 文件目錄

### 🚀 入門指南

| 文件 | 說明 |
|------|------|
| [快速入門](./getting-started.md) | 安裝、建立第一個遊戲、核心流程概覽 |
| [核心概念](./core-concepts.md) | EventBus、Plugin 系統、Event Phase 深入解說 |

### 🎮 RPG 系統

| 文件 | 說明 |
|------|------|
| [RPG 系統總覽](./rpg/README.md) | RPG Bundle 架構與各子系統說明 |
| [RPG 快速入門](./rpg-quickstart.md) | 從零建立可運行的 RPG 專案 |
| [JSON 資料格式參考](./json-data-format.md) | RpgGameData、腳本節點、Tilemap、i18n 格式完整規格 |

### 🔧 開發指南

| 文件 | 說明 |
|------|------|
| [自訂 Plugin 開發](./plugin-development.md) | 從頭撰寫 Plugin：結構、事件設計、測試 |
| [Browser Bundle 指南](./browser-bundle.md) | 在瀏覽器環境使用引擎 |
| [開發貢獻指引](../../CONTRIBUTING.md) | 環境設置、程式碼規範、PR 流程 |

### 📖 參考資料

| 文件 | 說明 |
|------|------|
| [架構設計文件](../../ARCHITECTURE.md) | 設計哲學、組件慣例、Style Guide |
| [完整 API 手冊](../../README.md) | 所有內建 Plugin 的 Event Contract 與使用範例（英文） |
| [未來路線圖](./roadmap.md) | 計畫中但尚未實作的功能 |

### 🔌 Plugin 文件

[animation](#animation) · [audio](#audio) · [data](#data) · [debug](#debug) · [entity](#entity) · [gameplay](#gameplay) · [input](#input) · [physics](#physics) · [rpg](#rpg-plugins) · [save](#save) · [scene](#scene) · [tilemap](#tilemap) · [ui](#ui) · [world](#world)

#### animation

| Plugin | 說明 |
|--------|------|
| [TweenManager](./plugins/animation/TweenManager.md) | 屬性動畫補間 |
| [Timeline](./plugins/animation/Timeline.md) | 動畫時間軸排程 |

#### audio

| Plugin | 說明 |
|--------|------|
| [AudioManager](./plugins/audio/AudioManager.md) | 音效與背景音樂管理 |

#### data

| Plugin | 說明 |
|--------|------|
| [DataManager](./plugins/data/DataManager.md) | JSON 資料集合管理 |
| [LocalizationManager](./plugins/data/LocalizationManager.md) | 多語言本地化 |
| [ResourceManager](./plugins/data/ResourceManager.md) | 資源載入與快取 |
| [SettingsManager](./plugins/data/SettingsManager.md) | 遊戲設定管理 |

#### debug

| Plugin | 說明 |
|--------|------|
| [DebugPlugin](./plugins/debug/DebugPlugin.md) | 除錯面板與日誌 |

#### entity

| Plugin | 說明 |
|--------|------|
| [EntityManager](./plugins/entity/EntityManager.md) | 實體組件系統 |
| [SpriteAnimator](./plugins/entity/SpriteAnimator.md) | 精靈動畫控制 |

#### gameplay

| Plugin | 說明 |
|--------|------|
| [AchievementPlugin](./plugins/gameplay/AchievementPlugin.md) | 成就系統 |
| [CutscenePlugin](./plugins/gameplay/CutscenePlugin.md) | 過場動畫控制 |
| [GameStateManager](./plugins/gameplay/GameStateManager.md) | 遊戲狀態機 |
| [TimerManager](./plugins/gameplay/TimerManager.md) | 計時器與冷卻管理 |

#### input

| Plugin | 說明 |
|--------|------|
| [InputManager](./plugins/input/InputManager.md) | 鍵盤、滑鼠、手柄、觸控輸入 |
| [InputRecorder](./plugins/input/InputRecorder.md) | 輸入錄製與回放 |

#### physics

| Plugin | 說明 |
|--------|------|
| [KinematicPhysicsAdapter](./plugins/physics/KinematicPhysicsAdapter.md) | 運動學碰撞（預設） |
| [MatterPhysicsAdapter](./plugins/physics/MatterPhysicsAdapter.md) | Matter.js 剛體物理 |
| [RapierPhysicsAdapter](./plugins/physics/RapierPhysicsAdapter.md) | Rapier WASM 高效能物理 |

#### rpg plugins

| Plugin | 說明 |
|--------|------|
| [ActorManager](./plugins/rpg/ActorManager.md) | 角色實例管理 |
| [BattleSystem](./plugins/rpg/BattleSystem.md) | 回合制戰鬥系統 |
| [DialogueManager](./plugins/rpg/DialogueManager.md) | 對話系統 |
| [ExperienceSystem](./plugins/rpg/ExperienceSystem.md) | 經驗值與升級 |
| [InventorySystem](./plugins/rpg/InventorySystem.md) | 道具欄系統 |
| [PlayerController](./plugins/rpg/PlayerController.md) | 玩家控制器 |
| [RpgMenuSystem](./plugins/rpg/RpgMenuSystem.md) | RPG 選單系統 |
| [ScriptManager](./plugins/rpg/ScriptManager.md) | 視覺腳本執行引擎 |
| [ShopSystem](./plugins/rpg/ShopSystem.md) | 商店系統 |
| [StatsSystem](./plugins/rpg/StatsSystem.md) | 屬性與狀態系統 |
| [VariableStoreManager](./plugins/rpg/VariableStoreManager.md) | 遊戲變數倉儲 |

#### save

| Plugin | 說明 |
|--------|------|
| [SaveManager](./plugins/save/SaveManager.md) | 存檔管理核心 |
| [LocalStorageSaveAdapter](./plugins/save/LocalStorageSaveAdapter.md) | LocalStorage 儲存 |
| [IndexedDBSaveAdapter](./plugins/save/IndexedDBSaveAdapter.md) | IndexedDB 儲存 |
| [SaveMigrationPlugin](./plugins/save/SaveMigrationPlugin.md) | 存檔版本遷移 |

#### scene

| Plugin | 說明 |
|--------|------|
| [SceneManager](./plugins/scene/SceneManager.md) | 場景管理與切換 |

#### tilemap

| Plugin | 說明 |
|--------|------|
| [TilemapManager](./plugins/tilemap/TilemapManager.md) | 地圖渲染管理 |
| [TiledLoader](./plugins/tilemap/TiledLoader.md) | Tiled 地圖載入器 |
| [TilemapEditorPlugin](./plugins/tilemap/TilemapEditorPlugin.md) | 地圖視覺編輯器 |

#### ui

| Plugin | 說明 |
|--------|------|
| [UIManager](./plugins/ui/UIManager.md) | UI 組件系統 |
| [LoadingScreen](./plugins/ui/LoadingScreen.md) | 載入畫面 |
| [MinimapPlugin](./plugins/ui/MinimapPlugin.md) | 小地圖 |

#### world

| Plugin | 說明 |
|--------|------|
| [FogOfWarPlugin](./plugins/world/FogOfWarPlugin.md) | 戰爭迷霧 |
| [GradientLightingPlugin](./plugins/world/GradientLightingPlugin.md) | 漸層光照 |
| [LightingPlugin](./plugins/world/LightingPlugin.md) | 動態光照 |
| [ParallaxPlugin](./plugins/world/ParallaxPlugin.md) | 視差捲動背景 |
| [ParticleManager](./plugins/world/ParticleManager.md) | 粒子系統 |
| [PathfindingManager](./plugins/world/PathfindingManager.md) | 路徑尋路 |

---

[切換至英文文件 →](../en/README.md) | [← 回到文件首頁](../README.md)
