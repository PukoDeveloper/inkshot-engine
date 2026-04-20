# inkshot-engine

A data-oriented, TypeScript-first 2D game engine built on top of [Pixi.js](https://pixijs.com/).  
Everything communicates through a shared **EventBus** — no tight coupling, no hidden globals.

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Core Concepts](#core-concepts)
   - [EventBus](#eventbus)
   - [Event Phases](#event-phases)
   - [Plugin System](#plugin-system)
4. [Built-in Plugins](#built-in-plugins)
   - [ResourceManager (`assets`)](#resourcemanager-assets)
   - [LocalizationManager (`i18n`)](#localizationmanager-i18n)
   - [InputManager (`input`)](#inputmanager-input)
   - [SaveManager (`save`)](#savemanager-save)
   - [GameStateManager (`game`)](#gamestatemanager-game)
   - [SceneManager (`scene`)](#scenemanager-scene)
5. [Renderer & Layers](#renderer--layers)
6. [Writing Your Own Plugin](#writing-your-own-plugin)
7. [Engine Lifecycle](#engine-lifecycle)
8. [TypeScript Tips](#typescript-tips)

---

## Installation

```bash
npm install inkshot-engine
```

> **Peer dependency**: Pixi.js v8 is bundled as a regular dependency — you do not need to install it separately.

---

## Quick Start

```ts
import { createEngine, ResourceManager, LocalizationManager } from 'inkshot-engine';

const { core, renderer } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  plugins: [
    new ResourceManager(),
    new LocalizationManager(),
    {
      namespace: 'myGame',
      async init(c) {
        // Load a locale file and set it as active
        await c.events.emit('i18n/load', { locale: 'en', url: 'i18n/en.json' });
        await c.events.emit('i18n/set-locale', { locale: 'en' });

        // Preload assets needed before the loop starts
        await c.events.emit('assets/preload', {
          bundles: [{ name: 'ui', assets: { logo: 'images/logo.png' } }],
        });
      },
    },
  ],
});

// After createEngine resolves the game loop is running.
core.events.on('myGame', 'core/tick', ({ delta }) => {
  // delta = elapsed frames (Pixi ticker units)
});
```

---

## Core Concepts

### EventBus

Every system in the engine communicates **exclusively** through a shared `EventBus` instance available as `core.events`.  There are no direct references between plugins.

```ts
// Subscribe
const unsubscribe = core.events.on('myNamespace', 'some/event', (params, output, control) => {
  output.result = doSomething(params.value);
});

// Unsubscribe when no longer needed
unsubscribe();

// Remove ALL listeners registered under a namespace (useful in plugin.destroy())
core.events.removeNamespace('myNamespace');

// Async emit — awaits every handler
const { output, stopped } = await core.events.emit('some/event', { value: 42 });

// Synchronous emit — handlers must not return Promises
const { output } = core.events.emitSync('some/event', { value: 42 });

// One-shot listener
core.events.once('myNamespace', 'some/event', (params, output) => { /* … */ });
```

#### Listener options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `phase` | `'before' \| 'main' \| 'after'` | `'main'` | Which phase to listen on |
| `priority` | `number` | `0` | Higher numbers run first within the same phase |

---

### Event Phases

Every `emit()` fires **three** sequential phases for the same base event name:

```
namespace/event-before  →  namespace/event  →  namespace/event-after
      (before)                 (main)               (after)
```

- **`before`** — validation, pre-processing, or cancellation.
- **`main`** — primary handler logic.
- **`after`** — side-effects, notifications, cleanup.

Flow control inside any handler:

```ts
control.break();      // Abort all remaining handlers AND phases
control.skipPhase();  // Skip the remaining handlers in the current phase only
```

---

### Plugin System

```ts
interface EnginePlugin {
  readonly namespace: string;
  init(core: Core): void | Promise<void>;
  destroy?(core: Core): void | Promise<void>;
}
```

Plugins are passed to `createEngine` in the `plugins` array and initialised **in order**.  They may also be URL strings pointing to remote ES modules whose default export is an `EnginePlugin`.

```ts
await createEngine({
  plugins: [
    new ResourceManager(),                         // object form
    'https://cdn.example.com/my-plugin.js',        // URL form (dynamically imported)
  ],
});
```

`destroy()` is called automatically in **reverse** order when `core.destroy()` is invoked.

---

## Built-in Plugins

### ResourceManager (`assets`)

Wraps Pixi.js `Assets` and exposes all loading modes through the event bus with a **cache-first guarantee** — no asset is ever fetched twice.

#### Event Contract

| Event | Async? | Description |
|-------|--------|-------------|
| `assets/preload` | ✓ | Register & fully load bundles before `core.start()` |
| `assets/load` | ✓ | Cache-first load: single URL, named bundle, or inline definition |
| `assets/prefetch` | ✗ | Fire-and-forget background download; never pauses the game loop |
| `assets/get` | ✗ `emitSync` | Synchronous cache lookup; never triggers a network request |
| `assets/unload` | ✓ | Release assets from cache and GPU memory |
| `assets/progress` | — emitted | Progress `0 → 1` during `assets/preload` / `assets/load` |
| `assets/error` | — emitted | Fired on any load failure |

#### Usage

```ts
import { createEngine, ResourceManager } from 'inkshot-engine';

const { core } = await createEngine({
  dataRoot: '/assets/',
  plugins: [
    new ResourceManager(),
    {
      namespace: 'myGame',
      async init(c) {
        // ① Preload at startup
        await c.events.emit('assets/preload', {
          bundles: [{ name: 'ui', assets: { logo: 'images/logo.png' } }],
        });

        // ② Background-prefetch the first scene
        c.events.emitSync('assets/prefetch', { bundle: 'scene:town' });
      },
    },
  ],
});

// ③ Lazy / eager load (cache-first — instant if prefetch finished)
await core.events.emit('assets/load', { bundle: 'scene:town' });

// ④ Synchronous cache get
const { output } = core.events.emitSync('assets/get', { key: 'logo' });
if (output.cached) sprite.texture = output.asset as Texture;

// ⑤ Release on scene exit
await core.events.emit('assets/unload', { bundle: 'scene:town' });
```

Relative paths are resolved against `core.dataRoot`.  Absolute URLs and root-anchored paths (`/assets/…`) are forwarded unchanged.

---

### LocalizationManager (`i18n`)

Loads JSON translation files, manages the active locale, and provides key lookup and composable string-interpolation — all via the event bus.

#### Translation File Format

Both flat and nested JSON structures are supported.  Nested keys are always accessed with **dot-notation**:

```json
{
  "menu": {
    "start": "Start Game",
    "quit":  "Quit"
  },
  "hud.gold": "Gold: {{amount}}"
}
```

#### Event Contract

| Event | Async? | Description |
|-------|--------|-------------|
| `i18n/load` | ✓ | Load / merge a locale from a URL (resolved against `dataRoot`) or inline data |
| `i18n/set-locale` | ✓ | Switch the active locale; automatically emits `i18n/changed` |
| `i18n/changed` | — emitted | Fired after every locale switch; subscribe to refresh UI |
| `i18n/t` | ✗ `emitSync` | Translate a key with optional `{{varName}}` substitution |
| `i18n/interpolate` | ✗ `emitSync` | Replace `{namespace:key}` tokens in a free-form string |
| `i18n/get-locales` | ✗ `emitSync` | List all loaded locales and the currently active one |

#### Usage

```ts
import { createEngine, LocalizationManager } from 'inkshot-engine';

const { core } = await createEngine({
  dataRoot: '/assets/',
  plugins: [
    new LocalizationManager(),
    {
      namespace: 'myGame',
      async init(c) {
        await c.events.emit('i18n/load', { locale: 'en', url: 'i18n/en.json' });
        await c.events.emit('i18n/load', { locale: 'zh-TW', url: 'i18n/zh-TW.json' });
        await c.events.emit('i18n/set-locale', { locale: 'en' });
      },
    },
  ],
});

// Simple lookup (falls back to the key if no translation is found)
const { output } = core.events.emitSync('i18n/t', { key: 'menu.start' });
label.text = output.value; // "Start Game"

// With variable substitution — use {{varName}} in the JSON value
const { output: o } = core.events.emitSync('i18n/t', {
  key: 'hud.gold',
  vars: { amount: String(player.gold) },
});
hud.text = o.value; // "Gold: 250"

// Switch locale at runtime
await core.events.emit('i18n/set-locale', { locale: 'zh-TW' });

// React to locale changes
core.events.on('ui', 'i18n/changed', ({ locale }) => {
  titleLabel.text = core.events.emitSync('i18n/t', { key: 'menu.title' }).output.value;
});

// Query available locales
const { output: loc } = core.events.emitSync('i18n/get-locales', {});
console.log(loc.available); // ['en', 'zh-TW']
console.log(loc.current);   // 'zh-TW'
```

#### Token Interpolation

`i18n/interpolate` handles free-form strings containing `{namespace:key}` tokens.  `LocalizationManager` registers in the **`before` phase (priority 1000)** to:

1. Copy `params.text` into `output.result`.
2. Resolve all `{i18n:key}` tokens using the active locale.
3. Expose `output.replace(token, value)` so other plugins can handle their own token namespaces in the main phase.

```ts
// A settings plugin handling its own token namespace
core.events.on('settings', 'i18n/interpolate', (_params, output) => {
  output.replace('{setting:current-language}', settings.language);
  output.replace('{setting:volume}', String(settings.volume));
});

// Caller
const { output } = core.events.emitSync('i18n/interpolate', {
  text: 'Language: {setting:current-language} — {i18n:menu.start}',
});
console.log(output.result); // "Language: English — Start Game"
```

---

### InputManager (`input`)

Captures keyboard and pointer events from the browser and re-emits them on the bus.  Pointer-move events are throttled to **one per frame** to avoid flooding the bus.

#### Event Contract

| Event | Direction | Description |
|-------|-----------|-------------|
| `input/key:down` | — emitted | Key transitions from released → pressed (auto-repeat suppressed) |
| `input/key:up` | — emitted | Key transitions from pressed → released |
| `input/pointer:down` | — emitted | Pointer button pressed |
| `input/pointer:up` | — emitted | Pointer button released |
| `input/pointer:move` | — emitted | Pointer moved (throttled, once per frame) |
| `input/key:pressed` | ✗ `emitSync` | Query whether a key is currently held |
| `input/pointer:state` | ✗ `emitSync` | Query current pointer position and pressed buttons |
| `input/action:bind` | ✗ `emitSync` | Map a logical action to one or more key codes |
| `input/action:triggered` | — emitted | Fired when a bound action key changes state |

#### Usage

```ts
import { createEngine, InputManager } from 'inkshot-engine';

const { core } = await createEngine({
  plugins: [new InputManager()],
});

// Bind logical actions
core.events.emitSync('input/action:bind', { action: 'jump', codes: ['Space', 'ArrowUp'] });

// React to actions (decoupled from physical keys)
core.events.on('myGame', 'input/action:triggered', ({ action, state }) => {
  if (action === 'jump' && state === 'pressed') player.jump();
});

// Pull-query for polling-style game logic
core.events.on('myGame', 'core/tick', () => {
  const { output } = core.events.emitSync('input/key:pressed', { code: 'KeyW' });
  if (output.pressed) player.moveForward();
});
```

---

### SaveManager (`save`)

In-memory save slots and a global data bag.  Actual persistence (localStorage, filesystem, cloud, etc.) is intentionally **not built in** — an environment plugin writes/reads in the `before` / `after` phases of `save/slot:save` and `save/slot:load`.

#### Event Contract — Slot events

| Event | Async? | Description |
|-------|--------|-------------|
| `save/slot:set` | ✗ `emitSync` | Create or update a slot in memory (shallow-merge patch) |
| `save/slot:get` | ✗ `emitSync` | Retrieve a slot from memory by ID |
| `save/slot:list` | ✗ `emitSync` | List metadata for all in-memory slots |
| `save/slot:save` | ✓ | Serialise slot to `output.data`; environment plugin persists in `after` phase |
| `save/slot:load` | ✓ | Environment plugin sets `output.raw` in `before` phase; SaveManager restores it |
| `save/slot:delete` | ✓ | Remove from memory; environment plugin deletes from storage in `after` phase |

#### Event Contract — Global data

| Event | Async? | Description |
|-------|--------|-------------|
| `save/global:set` | ✗ `emitSync` | Shallow-merge a patch into the global data bag |
| `save/global:get` | ✗ `emitSync` | Retrieve the global data bag |
| `save/global:save` | ✓ | Serialise global data; environment plugin persists in `after` phase |
| `save/global:load` | ✓ | Environment plugin sets `output.raw` in `before` phase; SaveManager restores it |

#### Usage

```ts
import { createEngine, SaveManager } from 'inkshot-engine';

const { core } = await createEngine({ plugins: [new SaveManager()] });

// Write to a slot
core.events.emitSync('save/slot:set', {
  id: 'slot-1',
  name: 'Chapter 1 — Village',
  patch: { chapter: 1, playerX: 120, playerY: 80 },
});

// Read from a slot
const { output } = core.events.emitSync('save/slot:get', { id: 'slot-1' });
console.log(output.slot?.data.chapter); // 1

// Persist (environment plugin handles the actual write in the after phase)
await core.events.emit('save/slot:save', { id: 'slot-1' });

// Load (environment plugin sets output.raw in the before phase)
await core.events.emit('save/slot:load', { id: 'slot-1' });
```

---

### GameStateManager (`game`)

A lightweight high-level state machine for the overall game session phase.

#### Phases

| Phase | Description |
|-------|-------------|
| `'none'` | Engine running, no session active |
| `'main-menu'` | Player is at the title / main menu |
| `'playing'` | Active game session |
| `'paused'` | Session active but paused |
| `'cutscene'` | Non-interactive cutscene in progress |
| `'game-over'` | Current session has ended |

#### Events

| Event | Description |
|-------|-------------|
| `game/state:set` | Transition to a new phase |
| `game/state:get` | `emitSync` — query the current phase |

```ts
import { createEngine, GameStateManager } from 'inkshot-engine';

const { core } = await createEngine({ plugins: [new GameStateManager()] });

core.events.emitSync('game/state:set', { state: 'playing' });

const { output } = core.events.emitSync('game/state:get', {});
console.log(output.state); // 'playing'
```

---

### SceneManager (`scene`)

Manages the registration and lifecycle of game scenes — the primary units of level, room, or screen in the game.

#### Scene Descriptor

```ts
import type { SceneDescriptor } from 'inkshot-engine';

const mainMenu: SceneDescriptor = {
  key: 'main-menu',
  async enter(core) {
    await core.events.emit('assets/load', { bundle: 'ui' });
    core.events.emitSync('game/state:set', { state: 'main-menu' });
  },
  async exit(core) {
    await core.events.emit('assets/unload', { bundle: 'ui' });
  },
};
```

#### Event Contract

| Event | Async? | Description |
|-------|--------|-------------|
| `scene/register` | ✗ `emitSync` | Register a scene descriptor |
| `scene/load` | ✓ | Transition: exits current scene, enters new one, emits `scene/changed` |
| `scene/current` | ✗ `emitSync` | Query the key of the active scene (`null` if none) |
| `scene/changed` | — emitted | Fired after every transition with `{ from, to }` |

#### Usage

```ts
import { createEngine, SceneManager } from 'inkshot-engine';

const { core } = await createEngine({ plugins: [new SceneManager()] });

// Register scenes
core.events.emitSync('scene/register', { scene: mainMenu });
core.events.emitSync('scene/register', { scene: level1 });

// Transition to the first scene
await core.events.emit('scene/load', { key: 'main-menu' });

// React to transitions
core.events.on('hud', 'scene/changed', ({ from, to }) => {
  console.log(`Scene: ${from ?? 'none'} → ${to}`);
});

// Query current scene
const { output } = core.events.emitSync('scene/current', {});
console.log(output.key); // 'main-menu'
```

Transition effects (fade-out / fade-in) can be added by subscribing to the `before` and `after` phases of `scene/load` respectively — `SceneManager` always runs in the `main` phase.

---

## Renderer & Layers

The `Renderer` manages named render layers on the Pixi stage.  Display objects should always be placed inside a layer rather than added to the root stage.

### Built-in Layers

| Name | Z-Index | Intended use |
|------|---------|--------------|
| `world` | 0 | Map tiles, characters, background |
| `fx` | 100 | Particle effects, screen-space VFX |
| `ui` | 200 | HUD, menus, all plugin UI |
| `system` | 300 | Loading screens, transitions, overlays |

### Custom Layers

```ts
renderer.createLayer('minimap', 250);
renderer.getLayer('minimap').addChild(minimapSprite);

if (!renderer.hasLayer('minimap')) renderer.createLayer('minimap', 250);
renderer.removeLayer('minimap'); // destroys all children
```

### Via EventBus (recommended for plugins)

```ts
// Get an existing layer
const { output } = core.events.emitSync('renderer/layer', { name: 'ui' });
output.layer.addChild(myPanel);

// Create + get
const { output: out } = core.events.emitSync('renderer/layer:create', { name: 'minimap', zIndex: 250 });
out.layer.addChild(minimapSprite);
```

---

## Writing Your Own Plugin

```ts
import type { Core, EnginePlugin } from 'inkshot-engine';

export class MyPlugin implements EnginePlugin {
  readonly namespace = 'myPlugin';

  init(core: Core): void {
    // Register listeners using your own namespace
    core.events.on(this.namespace, 'core/tick', ({ delta }) => {
      // runs every frame
    });

    // Emit your own events
    core.events.emitSync('myPlugin/ready', {});
  }

  destroy(core: Core): void {
    // Remove all listeners registered under this namespace
    core.events.removeNamespace(this.namespace);
  }
}
```

Pass it to `createEngine`:

```ts
await createEngine({ plugins: [new MyPlugin()] });
```

---

## Engine Lifecycle

```
createEngine(options)
  │
  ├── Core.init()          → emits core/init
  ├── new Renderer(core)   → subscribes to core/tick
  ├── plugin.init(core)    → (for each plugin, in order)
  └── Core.start()         → starts ticker → emits core/start
                                           → emits core/tick every frame

On shutdown:
  core.destroy()
    ├── core.pause()       → emits core/pause
    ├── plugin.destroy()   → (for each plugin, in reverse order)
    └── emits core/destroy → EventBus.clear() → Pixi.destroy()
```

---

## TypeScript Tips

All event parameter and output types are exported from `inkshot-engine`:

```ts
import type {
  // Assets
  AssetsLoadParams, AssetsLoadOutput,
  // i18n
  I18nTParams, I18nTOutput, I18nInterpolateParams, I18nInterpolateOutput,
  // Input
  InputActionTriggeredParams,
  // Save
  SaveSlotSaveOutput,
  // Events
  EventHandler, ListenerOptions,
} from 'inkshot-engine';
```

Use them to type your event handlers:

```ts
core.events.on<I18nTParams, I18nTOutput>('ui', 'i18n/t', (params, output) => {
  output.value = params.key.toUpperCase(); // override translation for debug
});
```

---

## License

ISC

