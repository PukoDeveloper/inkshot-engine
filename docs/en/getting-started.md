# Getting Started

This guide walks you through installation, creating your first game scene, and understanding the development workflow.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Requirements](#2-requirements)
3. [Your First Game](#3-your-first-game)
4. [Loading Assets](#4-loading-assets)
5. [Multiple Plugins](#5-multiple-plugins)
6. [Game Lifecycle](#6-game-lifecycle)
7. [Scene Management](#7-scene-management)
8. [Next Steps](#8-next-steps)

---

## 1. Installation

```bash
npm install @inkshot/engine
```

> The engine is published as an ES Module. Make sure your project has `"type": "module"` set, or use a bundler (Vite, Webpack, etc.).  
> **Pixi.js v8** is bundled as a dependency — no separate installation needed.

### Using with Vite (recommended)

```bash
npm create vite@latest my-game -- --template vanilla-ts
cd my-game
npm install @inkshot/engine
```

Add a mount point to `index.html`:

```html
<div id="app"></div>
```

---

## 2. Requirements

- **Node.js** v20 or later
- **npm** v10 or later
- Modern browser (Chrome 90+, Firefox 90+, Safari 16+)

---

## 3. Your First Game

The simplest start requires just a few lines:

```ts
import { createEngine } from '@inkshot/engine';

const { core, renderer } = await createEngine({
  container: '#app',   // DOM selector or HTMLElement
  width: 1280,
  height: 720,
  dataRoot: '/assets/', // Asset root directory
  plugins: [],          // Plugin list, to be filled in
});

// Engine is running, game loop has started
core.events.on('myGame', 'core/tick', ({ delta }) => {
  // Called every frame; delta = frame interval (Pixi ticker units)
});
```

`createEngine` returns a `Promise` that resolves once all plugins are initialized and the game loop has started.

### Adding a Sprite

```ts
import { createEngine } from '@inkshot/engine';
import { Sprite, Texture } from 'pixi.js';

const { core, renderer } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  plugins: [],
});

// Get the 'world' layer and add a sprite
const worldLayer = renderer.getLayer('world');
const sprite = new Sprite(Texture.WHITE);
sprite.width = 100;
sprite.height = 100;
sprite.tint = 0xff4444;
worldLayer.addChild(sprite);

// Move it every frame
core.events.on('myGame', 'core/tick', ({ delta }) => {
  sprite.x += 2 * delta;
  if (sprite.x > 1280) sprite.x = -100;
});
```

> **Tip:** The engine creates four default layers: `world` (z=0), `fx` (z=100), `ui` (z=200), `system` (z=300).  
> See [Architecture — Render Layer System](../../ARCHITECTURE.md#4-render-layer-system) for details.

---

## 4. Loading Assets

Use the `ResourceManager` plugin to manage all images, audio, fonts, and other assets:

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
        // ① Preload asset bundles before the game starts
        await c.events.emit('assets/preload', {
          bundles: [{
            name: 'main',
            assets: {
              hero:    'images/hero.png',
              tileset: 'images/tileset.png',
              bgm:     'audio/bgm.mp3',
            },
          }],
        });
      },
    },
  ],
});

// ② Synchronously retrieve a cached asset
const { output } = core.events.emitSync('assets/get', { key: 'hero' });
if (output.cached) {
  const worldLayer = renderer.getLayer('world');
  worldLayer.addChild(new Sprite(output.asset as Texture));
}

// ③ Background-prefetch the next level (non-blocking)
core.events.emitSync('assets/prefetch', { bundle: 'level-2' });

// ④ Unload assets when switching scenes
await core.events.emit('assets/unload', { bundle: 'main' });
```

---

## 5. Multiple Plugins

The `plugins` array in `createEngine` supports any number of plugins. The engine automatically resolves initialization order based on `dependencies`:

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
        await c.events.emit('i18n/load', { locale: 'en', url: 'i18n/en.json' });
        await c.events.emit('i18n/set-locale', { locale: 'en' });
      },
    },
  ],
});
```

---

## 6. Game Lifecycle

The engine fires these **core events** in sequence:

| Event | When |
|-------|------|
| `core/init` | After all plugins are initialized, before the game loop starts |
| `core/start` | When the game loop officially starts (immediately after `core/init`) |
| `core/tick` | Every frame, with `{ delta, elapsed }` |
| `core/pause` | When `core.pause()` is called |
| `core/resume` | When `core.resume()` is called |
| `core/destroy` | When `core.destroy()` is called, before plugin teardown |

```ts
// Listen to lifecycle events
core.events.on('myGame', 'core/init', () => {
  console.log('Engine initialized');
});

core.events.on('myGame', 'core/tick', ({ delta, elapsed }) => {
  // delta: frame interval (Pixi Ticker units, ~1 at 60fps)
  // elapsed: milliseconds since engine start
});

// Pause / resume
core.pause();
core.resume();

// Full teardown (frees all resources)
await core.destroy();
```

---

## 7. Scene Management

`SceneManager` lets you organize your game into scenes, each with its own `enter` / `exit` logic:

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

// Define scenes
const mainMenu: SceneDescriptor = {
  key: 'main-menu',
  async enter(c) {
    await c.events.emit('assets/load', { bundle: 'ui' });
    // Build menu UI...
  },
  async exit(c) {
    await c.events.emit('assets/unload', { bundle: 'ui' });
    // Tear down menu UI...
  },
};

const level1: SceneDescriptor = {
  key: 'level-1',
  async enter(c) {
    await c.events.emit('assets/load', { bundle: 'level-1' });
    // Build the level...
  },
  async exit(c) {
    await c.events.emit('assets/unload', { bundle: 'level-1' });
  },
};

// Register scenes
core.events.emitSync('scene/register', { scene: mainMenu });
core.events.emitSync('scene/register', { scene: level1 });

// Navigate to a scene
await core.events.emit('scene/load', { key: 'main-menu' });

// Listen for scene transitions
core.events.on('myGame', 'scene/changed', ({ from, to }) => {
  console.log(`Scene changed: ${from ?? 'none'} → ${to}`);
});
```

---

## 8. Next Steps

### Want to understand how EventBus and Plugins work?
→ [Core Concepts](./core-concepts.md)

### Want to build an RPG game?
→ [RPG Quickstart](./rpg-quickstart.md)

### Want to develop your own Plugin?
→ [Custom Plugin Development](./plugin-development.md)

### Want to look up all Plugin APIs?
→ [Full API Reference](../../README.md)
