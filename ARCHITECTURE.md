# Inkshot Engine — Architecture & Style Guide

This document captures the design philosophy, structural conventions, and coding style for the Inkshot Engine project.  All contributors and plugin authors should read it before making changes.

---

## 1. Design Philosophy

### 1.1 Out-of-the-Box Usability

The engine provides a single, top-level factory function — `createEngine()` — as its primary public entry point.  A game can go from zero to running in a handful of lines:

```ts
import { createEngine } from 'inkshot-engine';

const { core, renderer } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  plugins: [audioPlugin, uiPlugin],
});
```

Internally, `createEngine` handles engine initialization, plugin loading, and game-loop startup in the correct order so the consumer never needs to think about sequencing.

### 1.2 Event Bus as the Universal Communication Channel

**Every component, system, and plugin communicates exclusively through the shared `EventBus`.**  Direct references between subsystems are intentionally avoided.

This has several consequences:

- Systems remain **decoupled**: the audio system does not import the save system; it just emits `'audio/play'` and listens for `'save/loaded'`.
- **Plugin isolation**: plugins register under their own namespace, so they can be cleanly unloaded with `core.events.removeNamespace('myPlugin')` at any time.
- **Testability**: any system can be unit-tested by constructing a fresh `EventBus`, emitting mock events, and asserting on the output object — no need to bring up the full engine.
- **Extensibility**: third-party plugins can intercept, augment, or cancel any built-in event without touching engine source code.

```
┌─────────────────────────────────────────────────────────┐
│                         Core                            │
│  ┌──────────┐   events   ┌──────────┐  ┌────────────┐  │
│  │ Renderer │◄──────────►│ EventBus │◄─►│  Plugin N  │  │
│  └──────────┘            └──────────┘  └────────────┘  │
│                               ▲                         │
│                        ┌──────┴──────┐                  │
│                        │  Plugin 1   │                  │
│                        └─────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Data-Oriented Design

Game state is represented as plain data objects.  Systems are functions (or classes with methods) that read and write that data via events.  Avoiding deeply nested object graphs and tight inheritance hierarchies keeps state serialisable and debuggable.

### 1.4 Minimal Core, Extensible by Plugins

The `Core` class deliberately does very little beyond:

1. Owning the `EventBus`.
2. Owning the Pixi.js `Application` (canvas + ticker).
3. Emitting lifecycle events (`core/init`, `core/start`, `core/tick`, `core/pause`, `core/resume`, `core/destroy`).

All additional functionality (audio, save/load, UI, scene management, input handling, …) lives in **plugins**.

---

## 2. Component Conventions

### 2.1 Event Naming

Events use the format `<namespace>/<event-name>`:

| Event | Description |
|---|---|
| `core/init` | Engine has finished initialising |
| `core/tick` | Fired every frame with `{ delta, elapsed }` |
| `core/start` | Game loop has started |
| `core/pause` | Game loop has paused |
| `core/resume` | Game loop has resumed |
| `core/destroy` | Engine is being torn down |
| `renderer/*` | Rendering-related events |
| `<plugin>/*` | Plugin-owned events |

Namespaces should be short, lowercase identifiers.  Plugin namespaces must be unique across the project to prevent listener collisions.

### 2.2 Event Phases

Every `emit()` fires three sequential phases for the same event:

```
workspace/eventname-before  →  workspace/eventname  →  workspace/eventname-after
```

- **`before`** — pre-processing, validation, or cancellation.
- **`main`** — primary handler(s).
- **`after`** — post-processing, side-effects, notifications.

Use `control.break()` to abort all remaining phases.  Use `control.skipPhase()` to skip remaining handlers within the current phase.

### 2.3 Output Objects

Handlers may write to the shared `output` object to accumulate results across listeners.  Prefer this over global mutable state.  The final `output` is returned by `emit()` / `emitSync()`.

### 2.4 Priority

Within a phase, listeners with a **higher** `priority` number run first (default `0`).  Reserve very high (e.g. `1000`) or very low (e.g. `-1000`) priorities for framework-level concerns.

---

## 3. Plugin System

### 3.1 Plugin Interface

```ts
interface EnginePlugin {
  readonly namespace: string;          // e.g. 'audio', 'saves', 'myGame/combat'
  init(core: Core): void | Promise<void>;
  destroy?(core: Core): void | Promise<void>;
}
```

### 3.2 Plugin Contract

A well-behaved plugin:

1. **Registers all event listeners in `init()`** using its own namespace.
2. **Communicates only through the event bus** — it does not call methods on other plugins directly.
3. **Releases all resources in `destroy()`** — unsubscribe from events, cancel timers, free assets.
4. **Declares a unique `namespace`** that matches the prefix used for its own events.
5. **Does not assume load order** beyond what is guaranteed by the `plugins` array ordering in `EngineOptions`.

### 3.3 Plugin Sources

Plugins may be supplied as:

- **Objects** (TypeScript class instances / plain objects) — recommended for first-party plugins.
- **URL strings** — the factory will dynamically `import()` the module and expect its `default` export to be an `EnginePlugin`.  Useful for lazy-loading or third-party plugins served from a CDN.

---

## 4. Render Layer System

The `Renderer` manages named render layers on the Pixi stage.  All display objects (world, effects, UI, overlays) should be placed inside a layer rather than added directly to the root stage.  Layers are sorted by their `zIndex`; higher values are drawn on top.

### 4.1 Built-in Layers

Four layers are created automatically at startup:

| Layer name | Z-Index | Intended use                                        |
|------------|---------|-----------------------------------------------------|
| `world`    |       0 | Map tiles, entities, characters, background         |
| `fx`       |     100 | Particle effects, screen-space VFX                  |
| `ui`       |     200 | HUD, menus, and all plugin-provided UI              |
| `system`   |     300 | Full-screen overlays, loading screens, transitions  |

### 4.2 Custom Layers

New layers can be created at any z-index:

```ts
// Direct API
renderer.createLayer('minimap', 250);   // between ui (200) and system (300)
renderer.getLayer('minimap').addChild(minimapSprite);

// Check before creating
if (!renderer.hasLayer('minimap')) {
  renderer.createLayer('minimap', 250);
}

// Remove a layer (destroys all children)
renderer.removeLayer('minimap');
```

Layers with the same z-index are drawn in creation order.

### 4.3 Accessing Layers

**Direct access** (when you have a `Renderer` reference):
```ts
const uiLayer = renderer.getLayer('ui');
uiLayer.addChild(myPanel);
```

**Via EventBus** (recommended for plugins, avoids needing a `Renderer` reference):
```ts
// Get an existing layer
const { output } = core.events.emitSync('renderer/layer', { name: 'ui' });
output.layer.addChild(myPanel);

// Create and immediately get a new layer
const { output: out } = core.events.emitSync('renderer/layer:create', { name: 'minimap', zIndex: 250 });
out.layer.addChild(minimapSprite);
```

Plugins should always prefer the EventBus approach to remain decoupled from the `Renderer` instance.

---

## 5. Asset System (ResourceManager)

The `ResourceManager` is a built-in `EnginePlugin` that wraps Pixi.js `Assets` and exposes all asset-loading modes through the event bus.

### 5.1 Cache-First Guarantee

Every loading path is cache-first.  A resource already in the Pixi `Assets` cache is **never fetched twice** — the call returns instantly regardless of which loading mode is used.

| Mode | How cache is consulted |
|---|---|
| Preload / Load | `Assets.loadBundle()` / `Assets.load()` resolve from cache internally |
| Prefetch | Explicitly skips `Assets.backgroundLoad()` when `Assets.cache.has()` returns `true` |
| Get (sync) | Pure cache lookup via `Assets.cache.has()` + `Assets.get()` |

### 5.2 Loading Modes

| Event | Async? | Description |
|---|---|---|
| `assets/preload` | ✓ | Register & fully load bundles before `core.start()`.  Call from another plugin's `init()`. |
| `assets/load` | ✓ | Cache-first load of a single URL, a named bundle, or an inline definition. |
| `assets/prefetch` | ✗ | Fire-and-forget background download; game loop never pauses. |
| `assets/get` | ✗ `emitSync` | Synchronous cache retrieval; never triggers a fetch. |
| `assets/unload` | ✓ | Release a bundle or single URL from Pixi cache and GPU memory. |
| `assets/progress` | — emitted | Progress `0→1` during `assets/preload` / `assets/load`; subscribe for loading screens. |
| `assets/error` | — emitted | Fired on any load failure; subscribe to implement retry or fallback logic. |

### 5.3 Bundle Lifecycle Pattern

Bundle-scoped management pairs neatly with scene transitions:

```ts
// ① Preload essentials at startup (inside another plugin's init)
await core.events.emit('assets/preload', {
  bundles: [{ name: 'ui', assets: { font: 'fonts/main.woff2' } }],
});

// ② Prefetch next scene in the background while player is on main menu
core.events.emitSync('assets/prefetch', { bundle: 'scene:town' });

// ③ Lazy/eager load — cache-first; instant if prefetch finished
await core.events.emit('assets/load', { bundle: 'scene:town' });

// ④ Retrieve a single asset by alias (synchronous)
const { output } = core.events.emitSync('assets/get', { key: 'tileset' });
worldLayer.addChild(new Sprite(output.asset as Texture));

// ⑤ Release previous scene's assets on exit
await core.events.emit('assets/unload', { bundle: 'scene:intro' });
```

### 5.4 Inline Definition

A bundle can be declared and loaded in a single `assets/load` call using `definition`.  This is convenient for on-demand scene loading where bundles are not known at startup:

```ts
await core.events.emit('assets/load', {
  definition: { name: 'scene:dungeon', assets: { boss: 'boss.png' } },
});
```

### 5.5 `dataRoot` Integration

All relative paths are automatically resolved against `core.dataRoot` (set via `createEngine({ dataRoot })`) before being passed to Pixi.  Absolute URLs (`https://…`) and root-anchored paths (`/assets/…`) are forwarded unchanged.

---

## 6. Localisation System (LocalizationManager)

The `LocalizationManager` is a built-in `EnginePlugin` (namespace `i18n`) that loads JSON translation files, manages the active locale, and exposes translation and string-interpolation through the event bus.

### 6.1 Translation File Format

Locale files are plain JSON objects.  Both flat and nested structures are accepted; nested keys are accessed with **dot-notation** in all events:

```json
{
  "menu": {
    "start": "Start Game",
    "quit":  "Quit"
  },
  "hud.gold": "Gold: {{amount}}"
}
```

`"menu.start"` → `"Start Game"`, `"hud.gold"` (with `vars: { amount: '250' }`) → `"Gold: 250"`.

### 6.2 Event Contract

| Event              | Async? | Description |
|--------------------|--------|-------------|
| `i18n/load`        | ✓      | Load / merge a locale from a URL or inline data object |
| `i18n/set-locale`  | ✓      | Switch the active locale; emits `i18n/changed` afterwards |
| `i18n/changed`     | — emitted | Fired after a locale switch; subscribe to refresh UI text |
| `i18n/t`           | ✗ `emitSync` | Translate a key with optional `{{var}}` substitution |
| `i18n/interpolate` | ✗ `emitSync` | Replace `{namespace:key}` tokens in a free-form string |
| `i18n/get-locales` | ✗ `emitSync` | List all loaded locales and the currently active one |

### 6.3 Basic Usage

```ts
import { createEngine, LocalizationManager } from 'inkshot-engine';

const { core } = await createEngine({
  dataRoot: '/assets/',
  plugins: [
    new LocalizationManager(),
    {
      namespace: 'myGame',
      async init(c) {
        // Load from file (resolved against dataRoot)
        await c.events.emit('i18n/load', { locale: 'en', url: 'i18n/en.json' });
        await c.events.emit('i18n/set-locale', { locale: 'en' });
      },
    },
  ],
});

// Synchronous translation lookup
const { output } = core.events.emitSync('i18n/t', { key: 'menu.start' });
label.text = output.value; // "Start Game"

// With variable substitution
const { output: o } = core.events.emitSync('i18n/t', {
  key: 'hud.gold',
  vars: { amount: String(player.gold) },
});
hud.text = o.value; // "Gold: 250"
```

### 6.4 Token Interpolation

`i18n/interpolate` processes strings containing `{namespace:key}` tokens.  `LocalizationManager` resolves `{i18n:key}` tokens in the **`before`** phase (priority `1000`) and exposes a `replace` helper on `output` for other plugins to use:

```ts
// Another plugin adding its own token namespace
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

The three-phase dispatch order for `i18n/interpolate`:

```
i18n/interpolate-before  →  i18n/interpolate  →  i18n/interpolate-after
  └─ LocalizationManager       └─ other plugins'
     initialises `result`          main-phase handlers
     and resolves {i18n:*}
```

### 6.5 Reacting to Locale Changes

Subscribe to `i18n/changed` to re-render any text that depends on the locale:

```ts
core.events.on('ui', 'i18n/changed', ({ locale }) => {
  console.log(`Locale switched to: ${locale}`);
  // Re-query all translatable labels…
});
```

---

## 7. Audio System (AudioManager)

The `AudioManager` is a built-in `EnginePlugin` (namespace `audio`) that provides
audio playback using the browser-native **Web Audio API** — no external
audio library is needed.

### 7.1 Architecture

Each `audio/play` call creates one **playback instance** with:

- An `AudioBufferSourceNode` (the audio data).
- A per-instance `GainNode` for volume control.
- The chain: `source → instanceGain → masterGain → destination`.

The master `GainNode` is shared across all instances, so a single
`audio/volume` call (without `instanceId`) affects everything at once.

The `AudioContext` is **lazy-initialised** on the first `audio/load` or
`audio/play` call.  This defers creation until after a user gesture, which
satisfies browser autoplay policies.

### 7.2 Pause / Resume

`AudioBufferSourceNode` cannot be paused natively.  Pausing is simulated by:

1. Recording `offset = context.currentTime − startedAt`.
2. Calling `source.stop()`.
3. On resume, creating a new source node and calling `source.start(0, offset)`.

### 7.3 Event Contract

| Event           | Async? | Description |
|-----------------|--------|-------------|
| `audio/load`    | ✓      | Fetch, decode, and cache an audio clip by alias key |
| `audio/play`    | ✗ sync | Start playback; returns `{ instanceId }` |
| `audio/stop`    | ✗ sync | Stop a specific instance or all instances of a key |
| `audio/pause`   | ✗ sync | Pause a playing instance, preserving position |
| `audio/resume`  | ✗ sync | Resume a paused instance from the saved position |
| `audio/volume`  | ✗ sync | Set master volume (no `instanceId`) or per-instance volume |
| `audio/unload`  | ✗ sync | Remove a buffer from cache to free memory |
| `audio/state`   | ✗ `emitSync` | Pull: query `state` and `currentTime` for an instance |

### 7.4 Basic Usage

```ts
import { createEngine, AudioManager } from 'inkshot-engine';

const { core } = await createEngine({
  dataRoot: '/assets/',
  plugins: [
    new AudioManager(),
    {
      namespace: 'myGame',
      async init(c) {
        await c.events.emit('audio/load', { key: 'bgm:town', url: 'audio/town.ogg' });
        await c.events.emit('audio/load', { key: 'sfx:hit',  url: 'audio/hit.wav'  });
      },
    },
  ],
});

// ① Play looping background music with a stable ID
core.events.emitSync('audio/play', {
  key: 'bgm:town',
  loop: true,
  volume: 0.6,
  instanceId: 'bgm',
});

// ② Play a one-shot SFX (auto-generated ID)
core.events.emitSync('audio/play', { key: 'sfx:hit', volume: 1.0 });

// ③ Pause the music during a menu
core.events.emitSync('audio/pause',  { instanceId: 'bgm' });
core.events.emitSync('audio/resume', { instanceId: 'bgm' });

// ④ Lower music volume without affecting SFX
core.events.emitSync('audio/volume', { instanceId: 'bgm', volume: 0.2 });

// ⑤ Query state
const { output: s } = core.events.emitSync('audio/state', { instanceId: 'bgm' });
console.log(s.state, s.currentTime); // "playing", 4.23

// ⑥ Stop and release
core.events.emitSync('audio/stop',   { instanceId: 'bgm' });
core.events.emitSync('audio/unload', { key: 'bgm:town' });
```

---

## 8. Scene System (SceneManager)

The `SceneManager` is a built-in `EnginePlugin` (namespace `scene`) that manages the registration and lifecycle of game **scenes** — the primary units of level, room, or screen in the game.

### 8.1 Scene Descriptor

A scene is any object that satisfies the `SceneDescriptor` interface.  Class-based or plain-object scenes are equally valid.

```ts
import type { SceneDescriptor } from 'inkshot-engine';

const mainMenuScene: SceneDescriptor = {
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

| Property | Required | Description |
|---|---|---|
| `key` | ✓ | Unique identifier string, e.g. `'main-menu'`, `'level-1'` |
| `enter(core)` | ✓ | Called when the scene becomes active.  Load assets, spawn entities, set up listeners. |
| `exit(core)` | ✗ | Called when the scene is about to be replaced.  Unload assets, remove listeners. |

### 8.2 Event Contract

| Event            | Async? | Description |
|------------------|--------|-------------|
| `scene/register` | ✗ `emitSync` | Register a scene descriptor in the registry |
| `scene/load`     | ✓      | Transition to a scene: exits the current scene, enters the new one, emits `scene/changed` |
| `scene/current`  | ✗ `emitSync` | Query the key of the currently active scene (`null` if none) |
| `scene/changed`  | — emitted | Fired after every transition with `{ from, to }` |

The `scene/load` event fires the full **three-phase pipeline**, enabling hook points for transition effects:

```
scene/load-before  →  scene/load  →  scene/load-after
  └─ fade-out           └─ SceneManager        └─ fade-in
     (optional)            exits old scene,       (optional)
                           enters new scene
```

### 8.3 Usage

```ts
import { createEngine, SceneManager } from 'inkshot-engine';
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

const level1: SceneDescriptor = {
  key: 'level-1',
  async enter(core) {
    await core.events.emit('assets/load', { bundle: 'level-1' });
    core.events.emitSync('game/state:set', { state: 'playing' });
    core.events.emitSync('entity/create', { tags: ['player'], position: { x: 100, y: 100 } });
  },
  async exit(core) {
    const { output } = core.events.emitSync('entity/query', { tags: ['player'] });
    for (const entity of output.entities ?? []) {
      core.events.emitSync('entity/destroy', { id: entity.id });
    }
    await core.events.emit('assets/unload', { bundle: 'level-1' });
  },
};

const { core } = await createEngine({
  plugins: [new SceneManager()],
});

// Register all scenes at startup
core.events.emitSync('scene/register', { scene: mainMenu });
core.events.emitSync('scene/register', { scene: level1 });

// Load the first scene
await core.events.emit('scene/load', { key: 'main-menu' });

// Transition later (e.g. on "Start Game" button click)
await core.events.emit('scene/load', { key: 'level-1' });

// React to all transitions
core.events.on('hud', 'scene/changed', ({ from, to }) => {
  console.log(`Scene: ${from ?? 'none'} → ${to}`);
});

// Query current scene
const { output } = core.events.emitSync('scene/current', {});
console.log(output.key); // 'level-1'
```

### 8.4 Adding Transition Effects

Because `scene/load` fires a `before` → `main` → `after` pipeline, screen transitions can be added without modifying `SceneManager`:

```ts
// A dedicated transition plugin
core.events.on('transitions', 'scene/load', async () => {
  await fadeOut(500); // play fade-out during before phase
}, { phase: 'before' });

core.events.on('transitions', 'scene/load', async () => {
  await fadeIn(500); // play fade-in during after phase
}, { phase: 'after' });
```

---

## 9. Game Flow Design

This section describes the recommended end-to-end game flow using the built-in plugin suite.

### 9.1 High-Level Phases

```
Engine starts
    │
    ▼
[ none ]  ──── (first scene/load) ────►  [ main-menu ]
                                               │
                              (player presses Start)
                                               │
                                               ▼
                                         [ playing ]
                                         /         \
                              (pause key)           (player dies / level ends)
                                  │                         │
                                  ▼                         ▼
                             [ paused ]              [ game-over ]
                                  │                         │
                             (resume)              (back to menu / retry)
                                  │                         │
                                  └────────────►  [ playing ]
```

`GameStateManager` owns the phase labels; `SceneManager` drives the actual content transitions.  The two are **independent** — a `SceneManager` transition does not automatically change the `GameStateManager` phase; scenes are responsible for calling `game/state:set` themselves in their `enter` / `exit` hooks.

### 9.2 Recommended Plugin Initialisation Order

```
createEngine({
  plugins: [
    new ResourceManager(),       // must be first — others depend on assets/preload
    new AudioManager(),
    new LocalizationManager(),
    new InputManager(),
    new SaveManager(),
    new GameStateManager(),
    new EntityManager(),
    new SceneManager(),          // scenes depend on all of the above
    new TweenManager(),          // animation — can go anywhere after Core
  ],
});
```

### 9.3 Full Startup Sequence

```
createEngine()
    │
    ├── Core.init()                 → emits core/init
    ├── new Renderer(core)          → creates world / fx / ui / system layers
    ├── ResourceManager.init()      → registers asset/preload, asset/load, …
    ├── AudioManager.init()         → registers audio/play, audio/stop, …
    ├── LocalizationManager.init()  → registers i18n/load, i18n/t, …
    ├── InputManager.init()         → attaches keyboard / pointer listeners
    ├── SaveManager.init()          → registers save/slot:*, save/global:*
    ├── GameStateManager.init()     → registers game/state:set, game/state:get
    ├── EntityManager.init()        → registers entity/create, entity/destroy, …
    ├── SceneManager.init()         → registers scene/register, scene/load, …
    │
    ├── (your game plugin — preload assets, register scenes, set initial state)
    │
    └── Core.start()               → game loop starts
                                      → emits core/start
                                      → emits core/tick every frame
```

### 9.4 Scene Transition Sequence

When `scene/load` is emitted the following steps happen in order:

```
scene/load emitted
    │
    ├── BEFORE phase  (e.g. fade-out transition)
    │
    ├── MAIN phase  (SceneManager)
    │     ├── currentScene.exit(core)    [if a scene is active]
    │     ├── nextScene.enter(core)
    │     └── emits scene/changed { from, to }
    │
    └── AFTER phase  (e.g. fade-in transition)
```

### 9.5 Save / Load Integration

The `GameStateManager` automatically transitions to `'playing'` and emits `game/started` after a successful `save/slot:load`.  Pair this with `scene/load` in your own handler to restore the correct scene:

```ts
core.events.on('myGame', 'game/started', async () => {
  const { output: slot } = core.events.emitSync('save/slot:get', { id: activeSlotId });
  const sceneName = slot.slot?.data.currentScene as string ?? 'level-1';
  await core.events.emit('scene/load', { key: sceneName });
});
```

---

## 10. File & Module Conventions

| Path | Purpose |
|---|---|
| `src/core/` | Engine core (`Core`, `EventBus`) |
| `src/plugins/` | Built-in `EnginePlugin` implementations |
| `src/rendering/` | Renderer wrapper and layer definitions |
| `src/types/` | Shared TypeScript interfaces and type aliases |
| `src/createEngine.ts` | Public factory function |
| `src/index.ts` | Public package entry point — only re-exports |

Built-in plugins in `src/plugins/`:

| File | Namespace | Description |
|---|---|---|
| `AudioManager.ts` | `audio` | Web Audio API playback with pause/resume and per-instance volume |
| `SaveManager.ts` | `save` | In-memory save slots and global save data |
| `GameStateManager.ts` | `game` | High-level game phase state machine |
| `InputManager.ts` | `input` | Keyboard and pointer input |
| `ResourceManager.ts` | `assets` | Multi-mode asset loading with cache-first guarantee |
| `LocalizationManager.ts` | `i18n` | JSON locale loading, key lookup, variable substitution, and token interpolation |
| `SceneManager.ts` | `scene` | Scene registration, lifecycle management, and transition orchestration |
| `TweenManager.ts` | `tween` | Property-based animation driver; hosts `Tween` and `Timeline` objects |
| `Timeline.ts` | _(n/a)_ | Fluent builder for sequenced/parallel tween animations (used via `TweenManager`) |

Rules:

- `src/index.ts` **only re-exports**.  It must not contain logic.
- Internal modules import from relative paths with the `.js` extension (required for ESM).
- **No circular imports.**  The dependency graph flows: `types` ← `core` ← `plugins` ← `rendering` ← `createEngine` ← `index`.

---

## 11. Tween & Timeline System (TweenManager)

The `TweenManager` is a built-in `EnginePlugin` (namespace `tween`) that drives **property-based animations** on arbitrary JavaScript objects.  It subscribes to `core/tick` and advances every registered animation each frame.

### 11.1 Architecture

```
core/tick
    │
    ▼
TweenManager._onTick(dt)
    │
    ├── for each Tween   → Tween.advance(dt)  → interpolate target properties
    └── for each Timeline → Timeline.advance(dt)
            └── for each TweenEntry → Tween.advance(dt)
```

- **`Tween`** — animates one or more numeric properties of a target object over time.  `from` values are captured from the target at the moment the tween first begins animating (after any configured delay), so the target can move freely until the tween kicks in.
- **`Timeline`** — sequences and groups `Tween` objects on a shared time axis using a fluent builder API.  Supports absolute, relative, and parallel entry placement.

Both implement the `Advanceable` interface (`advance(dt: number): boolean`) so they can be used interchangeably by `TweenManager`.

### 11.2 Tween Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | `number` | — | Length of one forward pass in milliseconds (required) |
| `ease` | `EasingFn` | `Easing.linear` | Easing function; use any key from `Easing` or supply `(t) => number` |
| `delay` | `number` | `0` | Delay before the first play starts (ms) |
| `loop` | `boolean` | `false` | Repeat indefinitely; `onComplete` never fires |
| `yoyo` | `boolean` | `false` | Reverse direction after each forward pass |
| `repeat` | `number` | `0` | Extra plays after the first (`-1` = infinite, same as `loop: true`) |
| `repeatDelay` | `number` | `0` | Gap in ms between each repeat cycle |
| `onStart` | `() => void` | — | Called once when animation first begins (after any initial delay) |
| `onUpdate` | `(t: number) => void` | — | Called every tick with the eased progress `[0, 1]` |
| `onComplete` | `() => void` | — | Called when the tween finishes (not called for `loop: true`) |

### 11.3 Tween State API

```ts
tween.isPlaying    // true when running (not paused, killed, or done)
tween.isPaused     // true after pause()
tween.isKilled     // true after kill()
tween.isCompleted  // true after natural completion
tween.progress     // normalised [0, 1] position within the current pass

tween.pause()      // suspend animation
tween.resume()     // continue from where it left off
tween.kill()       // permanently stop (properties stay at current values)
tween.reset()      // rewind to initial state; re-captures from-values on next play
tween.seek(ms)     // jump playhead to timeMs [0, duration]; captures from-values if not started
tween.seekProgress(v) // jump to a normalised position [0, 1]
```

### 11.4 Timeline Builder API

| Method | Description |
|--------|-------------|
| `.to(target, props, opts)` | Animate from the target's live values to `props` |
| `.from(target, fromProps, opts)` | Animate from `fromProps` to the target's current values |
| `.fromTo(target, fromProps, toProps, opts)` | Explicit start and end values |
| `.set(target, props, opts)` | Instantly set properties (zero-duration snap) |
| `.call(fn, opts)` | Fire a callback at a specific time; does not advance the cursor |
| `.delay(ms)` | Advance the cursor without adding an entry |

All methods accept an optional `at` field:

| `at` value | Meaning |
|------------|---------|
| _(omitted)_ | Immediately after the previous entry ends |
| `number` | Absolute time in milliseconds |
| `'<'` | Same start time as the previous entry (parallel) |
| `'+=N'` | Cursor + `N` ms (insert gap) |
| `'-=N'` | Cursor − `N` ms (overlap) |

### 11.5 Timeline Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onComplete` | `() => void` | — | Called when the timeline finishes (not called when `loop: true` or `repeat: -1`) |
| `loop` | `boolean` | `false` | Repeat indefinitely |
| `repeat` | `number` | `0` | Extra plays after the first (`-1` = infinite) |
| `repeatDelay` | `number` | `0` | Gap in ms between each repeat cycle |

### 11.6 Timeline State API

```ts
tl.isPlaying     // true when running
tl.isPaused      // true after pause()
tl.isKilled      // true after kill()
tl.isCompleted   // true after natural completion
tl.progress      // normalised [0, 1] position within the current cycle
tl.elapsed       // raw playhead in ms
tl.duration      // total timeline duration in ms
tl.playbackRate  // speed multiplier (1 = normal, 2 = double speed)

tl.pause()
tl.resume()
tl.kill()
tl.reset()              // rewind and replay from the beginning
tl.seek(ms)             // jump playhead; tweens fast-forward silently, callbacks do NOT fire
tl.seekProgress(v)      // normalised seek [0, 1]
```

### 11.7 EventBus Contract

| Event | Direction | Description |
|-------|-----------|-------------|
| `tween/to` | ✗ `emitSync` | Create and register a new tween; returns `{ id }` |
| `tween/kill` | ✗ `emitSync` | Stop tweens by `id`, `target`, or `{ all: true }` |
| `tween/finished` | — emitted | Fired by `TweenManager` when a tween/timeline completes naturally; payload: `{ id?, target? }` |

### 11.8 Usage Examples

```ts
import { createEngine, TweenManager, Tween, Timeline, Easing } from 'inkshot-engine';

const { core } = await createEngine({ plugins: [new TweenManager()] });

const sprite = { x: 0, y: 0, alpha: 1, scaleX: 1, scaleY: 1 };

// ── One-shot tween ────────────────────────────────────────────────────────
const tween = new Tween(sprite, { x: 400, alpha: 0 }, {
  duration: 600,
  ease: Easing.easeOutQuad,
  delay: 100,
  onComplete: () => console.log('entrance done'),
});
tweenManager.add(tween);

// ── Yoyo + finite repeat ──────────────────────────────────────────────────
tweenManager.add(new Tween(sprite, { scaleX: 1.2, scaleY: 1.2 }, {
  duration: 300,
  ease: Easing.easeInOutSine,
  yoyo: true,
  repeat: 3,          // 4 plays total (forward + back × 4)
  repeatDelay: 50,
}));

// ── Timeline sequence ─────────────────────────────────────────────────────
const tl = new Timeline({ onComplete: () => core.events.emitSync('scene/load', { key: 'level-1' }) });

tl
  .fromTo(sprite, { alpha: 0 }, { alpha: 1 }, { duration: 300 })        // fade in
  .to(sprite, { x: 200 }, { duration: 500, ease: Easing.easeOutCubic }) // slide right
  .to(sprite, { y: 100 }, { duration: 300, at: '<' })                   // simultaneously
  .call(() => playSound('whoosh'), { at: '+=100' })                     // 100 ms after last tween
  .delay(200)                                                             // pause
  .set(sprite, { alpha: 0.5 }, { at: 900 });                            // snap at absolute 900 ms

tweenManager.add(tl);

// ── EventBus API ──────────────────────────────────────────────────────────
core.events.emitSync('tween/to', {
  target: sprite,
  props:  { x: 800 },
  duration: 400,
  ease: 'easeOutBack',
  repeat: 2,
  id: 'slide-out',
});

// React to completion
core.events.on('myGame', 'tween/finished', ({ id, target }) => {
  if (id === 'slide-out') cleanUp(target);
});

// Scrub to midpoint during a cutscene skip
tl.seek(tl.duration / 2);

// Fast-forward for a speed-up power-up
tl.playbackRate = 3;
```

### 11.9 Integration with SceneManager

A common pattern is to kill all running tweens when transitioning scenes:

```ts
core.events.on('transitions', 'scene/load', () => {
  tweenManager.killAll();
}, { phase: 'before' });
```

Or animate the camera / hero exit using a `Timeline` triggered from `SceneDescriptor.exit()`:

```ts
const level1: SceneDescriptor = {
  key: 'level-1',
  async exit(core) {
    await new Promise<void>((resolve) => {
      const tl = new Timeline({ onComplete: resolve });
      tl.to(hero, { alpha: 0 }, { duration: 400, ease: Easing.easeInQuad });
      tweenManager.add(tl);
    });
    await core.events.emit('assets/unload', { bundle: 'level-1' });
  },
};
```

---

## 12. TypeScript Style

- **Strict mode** is enabled.  All code must pass `tsc --strict` without error.
- Prefer `interface` over `type` for object shapes; use `type` for unions, aliases, and mapped types.
- Use `readonly` for properties that should not change after construction.
- Public API members must have JSDoc comments.
- Avoid `any`; prefer `unknown` and narrow with type guards.
- Access modifiers: `private` for internal state, `readonly` where mutation is not needed.

---

## 13. Coding Style

- 2-space indentation, single quotes, trailing commas (enforced by the project's formatter).
- Prefer `async/await` over raw Promises.
- Keep classes focused: each class has **one primary responsibility**.
- Prefer composition over inheritance.
- Section long files with visual dividers:
  ```ts
  // ---------------------------------------------------------------------------
  // Section name
  // ---------------------------------------------------------------------------
  ```

---

## 14. Lifecycle Summary

```
createEngine(options)
  │
  ├── Core.init()          → emits `core/init`
  ├── new Renderer(core)   → subscribes to `core/tick`
  ├── plugin.init(core)    → (for each plugin, in order)
  └── Core.start()         → starts ticker → emits `core/start`
                                            → emits `core/tick` every frame

On shutdown:
  Core.destroy()
    ├── Core.pause()       → emits `core/pause`
    ├── plugin.destroy()   → (for each plugin, in reverse order if managed)
    └── emits `core/destroy` → EventBus.clear() → Pixi.destroy()
```
