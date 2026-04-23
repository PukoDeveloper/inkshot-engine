# 快速入門指南

本指南帶你從零開始：安裝引擎、建立第一個遊戲場景，並了解開發流程。

---

## 目錄

1. [安裝](#1-安裝)
2. [環境需求](#2-環境需求)
3. [建立第一個遊戲](#3-建立第一個遊戲)
4. [載入資源](#4-載入資源)
5. [加入多個 Plugin](#5-加入多個-plugin)
6. [遊戲生命週期](#6-遊戲生命週期)
7. [使用場景管理](#7-使用場景管理)
8. [下一步](#8-下一步)

---

## 1. 安裝

```bash
npm install @inkshot/engine
```

> 引擎以 ES Module 發佈，請確保你的專案設定 `"type": "module"` 或使用 Bundler（Vite、Webpack 等）。  
> **Pixi.js v8** 已打包於引擎依賴中，無需額外安裝。

### 配合 Vite 使用（推薦）

```bash
npm create vite@latest my-game -- --template vanilla-ts
cd my-game
npm install @inkshot/engine
```

在 `index.html` 中準備一個掛載點：

```html
<div id="app"></div>
```

---

## 2. 環境需求

- **Node.js** v20 或更新版本
- **npm** v10 或更新版本
- 現代瀏覽器（Chrome 90+、Firefox 90+、Safari 16+）

---

## 3. 建立第一個遊戲

最簡單的起步只需幾行程式碼：

```ts
import { createEngine } from '@inkshot/engine';

const { core, renderer } = await createEngine({
  container: '#app',   // DOM 選擇器或 HTMLElement
  width: 1280,
  height: 720,
  dataRoot: '/assets/', // 資源根目錄（相對路徑）
  plugins: [],          // 插件清單，稍後填入
});

// 引擎已啟動，遊戲循環正在運行
core.events.on('myGame', 'core/tick', ({ delta }) => {
  // 每幀執行，delta = 幀間距（Pixi ticker 單位）
});
```

`createEngine` 回傳 `Promise`，解析後代表所有 Plugin 已初始化完成、遊戲循環已啟動。

### 在遊戲畫面放一個精靈

```ts
import { createEngine } from '@inkshot/engine';
import { Sprite, Texture } from 'pixi.js';

const { core, renderer } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  plugins: [],
});

// 取得「world」圖層並加入精靈
const worldLayer = renderer.getLayer('world');
const sprite = new Sprite(Texture.WHITE);
sprite.width = 100;
sprite.height = 100;
sprite.tint = 0xff4444;
worldLayer.addChild(sprite);

// 在每幀移動它
core.events.on('myGame', 'core/tick', ({ delta }) => {
  sprite.x += 2 * delta;
  if (sprite.x > 1280) sprite.x = -100;
});
```

> **提示：** 引擎預設建立四個圖層：`world`（z=0）、`fx`（z=100）、`ui`（z=200）、`system`（z=300）。  
> 詳細說明請參閱 [架構文件 — 渲染圖層系統](../../ARCHITECTURE.md#4-render-layer-system)。

---

## 4. 載入資源

使用 `ResourceManager` Plugin 管理所有圖片、音效、字型等資源：

```ts
import { createEngine, ResourceManager } from '@inkshot/engine';
import { Sprite, Texture } from 'pixi.js';

const { core, renderer } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  plugins: [
    new ResourceManager(),
    {
      namespace: 'myGame',
      async init(c) {
        // ① 在遊戲開始前預載資源 bundle
        await c.events.emit('assets/preload', {
          bundles: [{
            name: 'main',
            assets: {
              hero:       'images/hero.png',
              tileset:    'images/tileset.png',
              bgm:        'audio/bgm.mp3',
            },
          }],
        });
      },
    },
  ],
});

// ② 同步取得已快取的資源
const { output } = core.events.emitSync('assets/get', { key: 'hero' });
if (output.cached) {
  const worldLayer = renderer.getLayer('world');
  worldLayer.addChild(new Sprite(output.asset as Texture));
}

// ③ 背景預取下一個關卡（不阻塞遊戲）
core.events.emitSync('assets/prefetch', { bundle: 'level-2' });

// ④ 切換場景時釋放不需要的資源
await core.events.emit('assets/unload', { bundle: 'main' });
```

---

## 5. 加入多個 Plugin

`createEngine` 的 `plugins` 陣列支援任意數量的 Plugin，引擎會根據 `dependencies` 欄位自動排序初始化順序：

```ts
import {
  createEngine,
  ResourceManager,
  LocalizationManager,
  InputManager,
  AudioManager,
  SaveManager,
  SceneManager,
  GameStateManager,
  EntityManager,
  KinematicPhysicsAdapter,
  TimerManager,
  TweenManager,
} from '@inkshot/engine';

const { core, renderer } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  plugins: [
    new ResourceManager(),
    new LocalizationManager(),
    new InputManager(),
    new AudioManager(),
    new SaveManager(),
    new SceneManager(),
    new GameStateManager(),
    new EntityManager(),
    new KinematicPhysicsAdapter(),
    new TimerManager(),
    new TweenManager(),
    {
      namespace: 'myGame',
      async init(c) {
        // 你的遊戲初始化邏輯
        await c.events.emit('i18n/load', { locale: 'zh-TW', url: 'i18n/zh-TW.json' });
        await c.events.emit('i18n/set-locale', { locale: 'zh-TW' });
      },
    },
  ],
});
```

---

## 6. 遊戲生命週期

引擎會依序觸發以下 **核心事件**：

| 事件 | 時機 |
|------|------|
| `core/init` | 所有 Plugin 初始化完成後，遊戲循環啟動前 |
| `core/start` | 遊戲循環正式開始（在 `core/init` 之後立即觸發） |
| `core/tick` | 每幀觸發，傳入 `{ delta, elapsed }` |
| `core/pause` | 呼叫 `core.pause()` 時 |
| `core/resume` | 呼叫 `core.resume()` 時 |
| `core/destroy` | 呼叫 `core.destroy()` 時，在 Plugin 銷毀前 |

```ts
// 監聽生命週期事件
core.events.on('myGame', 'core/init', () => {
  console.log('引擎初始化完成');
});

core.events.on('myGame', 'core/tick', ({ delta, elapsed }) => {
  // delta: 幀間距（Pixi Ticker 單位，60fps 時約為 1）
  // elapsed: 從啟動到現在的毫秒數
});

// 暫停 / 繼續
core.pause();
core.resume();

// 完全銷毀（釋放所有資源）
await core.destroy();
```

---

## 7. 使用場景管理

`SceneManager` 讓你以「場景」為單位組織遊戲，每個場景有獨立的 `enter` / `exit` 邏輯：

```ts
import { createEngine, SceneManager, ResourceManager } from '@inkshot/engine';
import type { SceneDescriptor } from '@inkshot/engine';

const { core } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  plugins: [new ResourceManager(), new SceneManager()],
});

// 定義場景
const mainMenu: SceneDescriptor = {
  key: 'main-menu',
  async enter(c) {
    await c.events.emit('assets/load', { bundle: 'ui' });
    // 建立選單 UI...
  },
  async exit(c) {
    await c.events.emit('assets/unload', { bundle: 'ui' });
    // 清除選單 UI...
  },
};

const level1: SceneDescriptor = {
  key: 'level-1',
  async enter(c) {
    await c.events.emit('assets/load', { bundle: 'level-1' });
    // 建立關卡...
  },
  async exit(c) {
    await c.events.emit('assets/unload', { bundle: 'level-1' });
  },
};

// 注冊場景
core.events.emitSync('scene/register', { scene: mainMenu });
core.events.emitSync('scene/register', { scene: level1 });

// 跳轉至場景
await core.events.emit('scene/load', { key: 'main-menu' });

// 監聽場景切換
core.events.on('myGame', 'scene/changed', ({ from, to }) => {
  console.log(`場景切換：${from ?? 'none'} → ${to}`);
});
```

---

## 8. 下一步

### 想了解 EventBus 和 Plugin 的運作原理？
→ [核心概念](./core-concepts.md)

### 想做 RPG 遊戲？
→ [RPG 快速入門](./rpg-quickstart.md)

### 想開發自己的 Plugin？
→ [自訂 Plugin 開發](./plugin-development.md)

### 想查閱所有 Plugin 的 API？
→ [完整 API 手冊](../../README.md)（英文）
