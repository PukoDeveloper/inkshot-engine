# inkshot-engine 文件中心

歡迎來到 **inkshot-engine** 的文件中心。  
本引擎是以 TypeScript 為核心、Pixi.js 為渲染後端的 2D 遊戲框架，透過統一的 **EventBus** 串聯所有子系統。

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
| [JSON 資料格式參考](./json-data-format.md) | `RpgGameData`、腳本節點、Tilemap、i18n 格式完整規格 |

### 🔧 開發指南

| 文件 | 說明 |
|------|------|
| [自訂 Plugin 開發](./plugin-development.md) | 從頭撰寫 Plugin：結構、事件設計、測試 |
| [開發貢獻指引](../CONTRIBUTING.md) | 環境設置、程式碼規範、PR 流程 |

### 📖 參考資料

| 文件 | 說明 |
|------|------|
| [架構設計文件](../ARCHITECTURE.md) | 設計哲學、組件慣例、Style Guide（英文） |
| [完整 API 手冊](../README.md) | 所有內建 Plugin 的 Event Contract 與使用範例（英文） |
| [功能清單](../TODO.md) | 已完成功能與待開發項目 |
| [未來路線圖](./roadmap.md) | 計畫中但尚未實作的功能 |

---

## 🗺️ 學習路線

### 我是新手，想快速上手

1. [快速入門](./getting-started.md) — 安裝並建立第一個遊戲
2. [核心概念](./core-concepts.md) — 了解 EventBus 和 Plugin 的運作方式
3. [完整 API 手冊](../README.md) — 查閱各 Plugin 的事件與用法

### 我想做 RPG 遊戲

1. [RPG 快速入門](./rpg-quickstart.md) — 一步步建立帶有戰鬥、對話、存檔的 RPG
2. [JSON 資料格式參考](./json-data-format.md) — 了解如何用 JSON 定義角色、道具、腳本
3. [RPG 系統總覽](./rpg/README.md) — 各子系統 API 速查

### 我想開發自訂 Plugin

1. [核心概念](./core-concepts.md) — 理解 EventBus 通訊模式
2. [自訂 Plugin 開發](./plugin-development.md) — 完整 Plugin 開發流程
3. [架構設計文件](../ARCHITECTURE.md) — 深入了解設計哲學與規範

---

## 🛠️ 快速參考

### 安裝

```bash
npm install @inkshot/engine
```

### 啟動引擎（通用）

```ts
import { createEngine, ResourceManager } from '@inkshot/engine';

const { core, renderer } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  plugins: [new ResourceManager()],
});
```

### 啟動 RPG 引擎

```ts
import { createRpgEngine } from '@inkshot/engine';

const { core, rpg } = await createRpgEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
});
```

---

## 📦 主要套件內容

inkshot-engine 提供超過 **40 個子系統**，涵蓋：

| 分類 | 子系統 |
|------|--------|
| **核心** | EventBus、Plugin 依賴排序、Core 生命週期 |
| **渲染** | Renderer、Camera、RenderPipeline、PostFx、AnimationSystem、ObjectPool |
| **輸入** | InputManager（鍵盤 / 滑鼠 / 手柄 / 觸控 / 手勢）、InputRecorder |
| **資源** | ResourceManager、DataManager |
| **音效** | AudioManager（空間音效、淡入淡出） |
| **存檔** | SaveManager、LocalStorageSaveAdapter、IndexedDBSaveAdapter、SaveMigrationPlugin |
| **場景** | SceneManager、LoadingScreen |
| **物理** | KinematicPhysicsAdapter、MatterPhysicsAdapter、RapierPhysicsAdapter |
| **UI** | UIManager（Button / Label / Panel / ScrollView / Dialog 等） |
| **地圖** | TilemapManager、TiledLoader、TilemapEditorPlugin |
| **視覺效果** | ParticleManager、TweenManager、Timeline、LightingPlugin、ParallaxPlugin |
| **遊戲系統** | TimerManager、PathfindingManager、EntityManager、WorkerBridge |
| **RPG 套件** | BattleSystem、InventorySystem、StatsSystem、ExperienceSystem、ShopSystem、DialogueManager、ScriptManager、ActorManager、VariableStoreManager |
| **輔助** | DebugPlugin、AchievementPlugin、CutscenePlugin、MinimapPlugin、FogOfWarPlugin、SettingsManager、LocalizationManager、GameStateManager |
