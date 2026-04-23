# 功能路線圖

本文件記錄 inkshot-engine **尚未實作**的功能計畫，依優先程度排列。  
已完成的功能請參閱根目錄的 [`TODO.md`](../../TODO.md)。

---

## 目錄

1. [🟡 中優先](#-中優先)
   - [視野角度限制（Line-of-Sight Cone）](#1-視野角度限制-line-of-sight-cone)
   - [動態光源陰影（Shadow Casting）](#2-動態光源陰影-shadow-casting)
2. [🔵 低優先](#-低優先)
   - [程序生成工具（Procedural Generation）](#3-程序生成工具-procedural-generation)
3. [⚪ 未來考量](#-未來考量)
   - [網路 / 多人聯機（Networking）](#4-網路--多人聯機-networking)
   - [雲端存檔（Cloud Save Adapter）](#5-雲端存檔-cloud-save-adapter)
   - [熱重載（Hot Reload）](#6-熱重載-hot-reload)
   - [截圖與 GIF 錄製](#7-截圖與-gif-錄製)
   - [平台適配層（Platform SDK）](#8-平台適配層-platform-sdk)
   - [可視化編輯器（Visual Editor）](#9-可視化編輯器-visual-editor)

---

## 🟡 中優先

### 1. 視野角度限制 (Line-of-Sight Cone)

**擴充目標：** `FogOfWarPlugin`（namespace: `fog`）

- [ ] 支援視野角度（`fovAngle`）與距離（`fovRadius`）限制，計算扇形可見範圍
- [ ] 扇形可見範圍依玩家面向方向即時更新

---

### 2. 動態光源陰影 (Shadow Casting)

**擴充目標：** `LightingPlugin`（namespace: `lighting`）

- [ ] 遮擋 / 陰影投射：利用 `KinematicPhysicsAdapter` 的碰撞幾何或 TilemapManager 的實心 tile，進行 shadowcasting 射線計算，產生軟陰影遮罩
- [ ] 效能優化：僅重建視野範圍內的光源
- [ ] 提供 `quality` 選項（`low / medium / high`）控制陰影解析度

---

## 🔵 低優先

### 3. 程序生成工具 (Procedural Generation)

**Namespace：** 純工具函式，無 Plugin lifecycle

- [ ] 提供 Simplex / Perlin Noise 工具函式（地形生成、隨機材質）
- [ ] BSP（Binary Space Partitioning）地下城生成器
- [ ] 隨機種子管理（`seededRandom(seed)`），確保可重現的生成結果

**API 草稿：**
```ts
import { simplexNoise2D, generateDungeon, seededRandom } from '@inkshot/engine/rpg/proc-gen';

const noise = simplexNoise2D(seed);
const height = noise(x / 64, y / 64); // 0..1

const rng = seededRandom(12345);
const dungeon = generateDungeon({ width: 64, height: 64, rooms: 10, rng });
```

---

## ⚪ 未來考量

### 4. 網路 / 多人聯機 (Networking)

**Namespace：** `network`

**新增 Plugin：** `NetworkManager`

- [ ] 抽象化底層傳輸（WebSocket / WebRTC Data Channel），允許替換後端
- [ ] 提供簡易的 RPC / 事件同步介面
- [ ] 支援 Rollback Netcode 或 Lockstep 同步模型

**計畫事件：**

| 事件 | 方向 | 說明 |
|------|------|------|
| `network/connect` | 命令 | 連線至指定伺服器 |
| `network/disconnect` | 命令 | 中斷連線 |
| `network/connected` | 廣播 | 連線成功 |
| `network/disconnected` | 廣播 | 連線中斷 |
| `network/message` | 廣播 | 收到遠端訊息 |

---

### 5. 雲端存檔 (Cloud Save Adapter)

**擴充目標：** `SaveManager`

- [ ] 新增 `CloudSaveAdapter` 抽象介面（供第三方後端實作，例如 Firebase、Supabase、自建 REST API）
- [ ] 定義衝突解決策略（以伺服器為準 / 以客戶端為準 / 手動合併）

---

### 6. 熱重載 (Hot Reload)

**目標：** 縮短開發迭代週期

- [ ] 支援在不重啟引擎的情況下重新載入場景（`scene/reload` 命令）
- [ ] 資源熱替換：修改圖片後自動更新 Pixi texture cache
- [ ] 整合 Vite HMR API（`import.meta.hot`），開發期自動觸發場景重新載入

---

### 7. 截圖與 GIF 錄製

- [ ] `capture/screenshot`（PNG/JPEG）— 從 Pixi Renderer 擷取當前畫面
- [ ] `capture/gif:start` / `capture/gif:stop` — 連續幀錄製，輸出 GIF 或 WebM
- [ ] 與 `InputRecorder` 整合，支援附帶輸入序列的完整回放錄影

---

### 8. 平台適配層 (Platform SDK)

- [ ] Electron / Tauri 適配器，橋接本機檔案系統存檔
- [ ] Steam Greenworks / Web API 橋接：成就同步、雲端存檔、排行榜
- [ ] 抽象化全螢幕 / 視窗管理，統一 web 與桌面平台差異

---

### 9. 可視化編輯器 (Visual Editor)

- [x] 基於 `TiledLoader` 擴充，提供瀏覽器內嵌的輕量場景擺放工具 — `SceneEditorPlugin` (`scene-editor`)
- [x] 基於 `ScriptManager` 的節點式腳本視覺化編輯器（節點圖 → 命令序列 JSON）— `ScriptNodeEditorPlugin` (`script-node-editor`)
- [ ] 整合 `DebugPlugin`，支援執行期點選實體後直接查看 / 修改屬性

---

## 已完成功能

所有已實作完成的功能（共 42+ 項）請參閱 [TODO.md](../../TODO.md)。
