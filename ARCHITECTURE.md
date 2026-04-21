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
  readonly namespace: string;               // e.g. 'audio', 'saves', 'myGame/combat'
  readonly dependencies?: readonly string[]; // namespaces that must init first
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
5. **Declares its prerequisites in `dependencies`** so `createEngine` can guarantee correct init order regardless of how the caller orders the `plugins` array.

### 3.3 Plugin Sources

Plugins may be supplied as:

- **Objects** (TypeScript class instances / plain objects) — recommended for first-party plugins.
- **URL strings** — the factory will dynamically `import()` the module and expect its `default` export to be an `EnginePlugin`.  Useful for lazy-loading or third-party plugins served from a CDN.

### 3.4 Dependency Declaration & Init Order

`createEngine` performs a **topological sort** (stable Kahn's algorithm) on all registered plugins before calling any `init()`.  This means the order in which plugins appear in the `plugins` array does **not** need to match the dependency order — only the `dependencies` field matters.

```ts
class KinematicPhysicsAdapter implements EnginePlugin {
  readonly namespace = 'physics';
  // KinematicPhysicsAdapter uses entity/query at runtime → EntityManager must be ready first
  readonly dependencies = ['entity'] as const;

  init(core: Core) { ... }
}

// The caller can supply plugins in any order:
createEngine({
  plugins: [
    new KinematicPhysicsAdapter(), // listed before EntityManager — still init'd after it
    new SceneManager(),
    new EntityManager(),
  ],
});
```

**Rules enforced at startup:**

| Situation | Result |
|---|---|
| Dependency not in the `plugins` list | `createEngine` throws immediately |
| Circular dependency (A → B → A) | `createEngine` throws immediately |
| Duplicate `namespace` values | `createEngine` throws immediately |
| No `dependencies` field | Plugin is treated as having no prerequisites |

When no ordering constraint exists between two plugins, their relative order from the original `plugins` array is preserved (stable sort).

`destroy()` is always called in **reverse init order**, so teardown mirrors startup automatically.

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

- An `AudioBufferSourceNode` (the decoded audio data).
- A per-instance `GainNode` for volume control.
- When `position` is supplied: a `PannerNode` for spatial distance attenuation and stereo panning.
- The audio graph: `source → [PannerNode →] instanceGain → [categoryGain →] masterGain → destination`.

The master `GainNode` is shared across all instances, so a single
`audio/volume` call (without `instanceId`) affects everything at once.

Category `GainNode`s (one per `category` string, e.g. `'bgm'`, `'sfx'`, `'vo'`) sit between the
per-instance gain and the master gain, allowing independent volume control per audio category.

The `AudioContext` is **lazy-initialised** on the first `audio/load` or
`audio/play` call.  This defers creation until after a user gesture, which
satisfies browser autoplay policies.

### 7.2 Pause / Resume

`AudioBufferSourceNode` cannot be paused natively.  Pausing is simulated by:

1. Recording `offset = context.currentTime − startedAt`.
2. Calling `source.stop()`.
3. On resume, creating a new source node and calling `source.start(0, offset)`.

For **spatial** instances the new source is reconnected through the existing `PannerNode`
(`newSource.connect(inst.pannerNode ?? inst.gainNode)`) so that all spatial position,
distance model, and roll-off settings are fully preserved across pause/resume cycles.

### 7.3 Event Contract

| Event                   | Async? | Description |
|-------------------------|--------|-------------|
| `audio/load`            | ✓      | Fetch, decode, and cache an audio clip by alias key |
| `audio/play`            | ✗ sync | Start playback; returns `{ instanceId }`.  Pass `position` for spatial audio. |
| `audio/stop`            | ✗ sync | Stop a specific instance, all instances of a key/category, or all sounds |
| `audio/pause`           | ✗ sync | Pause a playing instance, recording the playback offset |
| `audio/resume`          | ✗ sync | Resume a paused instance from the saved offset (spatial chain preserved) |
| `audio/volume`          | ✗ sync | Set master / category / per-instance volume (with optional linear fade) |
| `audio/fade-stop`       | ✗ sync | Fade a specific instance to silence over `duration` seconds, then stop it |
| `audio/unload`          | ✗ sync | Remove a decoded buffer from cache |
| `audio/state`           | ✗ `emitSync` | Pull: query `state` and `currentTime` for an instance |
| `audio/list`            | ✗ `emitSync` | Pull: list all active (playing/paused) instances |
| `audio/listener:update` | ✗ sync | Update the spatial listener position (typically driven by the camera) |
| `audio/source:move`     | ✗ sync | Reposition a spatial audio source at runtime; warns if the instance has no `PannerNode` |

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

// ① Play looping background music in the 'bgm' category
core.events.emitSync('audio/play', {
  key: 'bgm:town',
  loop: true,
  volume: 0.6,
  instanceId: 'bgm',
  category: 'bgm',
});

// ② Play a one-shot SFX (auto-generated ID)
core.events.emitSync('audio/play', { key: 'sfx:hit', volume: 1.0 });

// ③ Pause the music during a menu (spatial chain preserved on resume)
core.events.emitSync('audio/pause',  { instanceId: 'bgm' });
core.events.emitSync('audio/resume', { instanceId: 'bgm' });

// ④ Fade out and stop over 2 seconds (e.g. scene transition)
core.events.emitSync('audio/fade-stop', { instanceId: 'bgm', duration: 2 });

// ⑤ Duck BGM category during dialogue
core.events.emitSync('audio/volume', { category: 'bgm', volume: 0.2, duration: 0.5 });

// ⑥ Query state and list all instances
const { output: s } = core.events.emitSync('audio/state', { instanceId: 'bgm' });
console.log(s.state, s.currentTime); // "playing", 4.23

const { output: list } = core.events.emitSync('audio/list', {});
console.log(list.instances.map(i => i.instanceId));

// ⑦ Stop and release
core.events.emitSync('audio/stop',   { instanceId: 'bgm' });
core.events.emitSync('audio/unload', { key: 'bgm:town' });
```

### 7.5 Spatial Audio

Pass a `position` to `audio/play` to create a positional sound source routed through a
`PannerNode`.  Drive the listener with `audio/listener:update` (typically from the camera) so
that distance attenuation and stereo panning are computed automatically:

```ts
// Play a looping ambient sound at a world-space position
core.events.emitSync('audio/play', {
  key: 'sfx:waterfall',
  loop: true,
  instanceId: 'waterfall',
  position:      { x: 320, y: 240 },
  maxDistance:   400,
  rolloffFactor: 1,
  distanceModel: 'linear',
});

// Drive the listener from the camera every render frame
core.events.on('myGame', 'core/render', () => {
  const cam = core.events.emitSync('camera/state', {}).output;
  core.events.emitSync('audio/listener:update', {
    x: cam.x + cam.width  / 2,
    y: cam.y + cam.height / 2,
  });
});

// Reposition a moving spatial source at runtime (e.g. a walking NPC)
core.events.on('myGame', 'core/update', () => {
  core.events.emitSync('audio/source:move', {
    instanceId: 'waterfall',
    x: npc.x,
    y: npc.y,
  });
});
```

`audio/source:move` logs a `console.warn` if the target instance exists but was created
without a `position` parameter (i.e. has no `PannerNode`), making misconfigured spatial
calls immediately visible during development.

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

Because each built-in plugin declares its `dependencies`, `createEngine` automatically sorts them into the correct sequence.  The order in the `plugins` array no longer needs to be manually maintained:

```ts
createEngine({
  plugins: [
    new ResourceManager(),
    new AudioManager(),
    new LocalizationManager(),
    new InputManager(),
    new SaveManager(),
    new GameStateManager(),
    new EntityManager(),
    new SpriteAnimator(),
    new KinematicPhysicsAdapter(),   // declares dependencies: ['entity'] — sorted automatically
    new TilemapManager(),
    new TweenManager(),
    new ParticleManager(),
    new SceneManager(),
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
    ├── SpriteAnimator.init()       → registers animator/define, animator/play, …
    ├── KinematicPhysicsAdapter.init() → registers physics/body:add, physics/move, …
    ├── TilemapManager.init()       → registers tilemap/load, tilemap/set-tile, …
    ├── TweenManager.init()         → registers tween/to, tween/kill, …
    ├── ParticleManager.init()      → registers particle/emit, particle/clear, …
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

## 10. Physics System (KinematicPhysicsAdapter / PhysicsAdapter)

The physics system provides 2D collision detection, movement resolution, spatial queries, and raycasting.  It is built around a **unified `PhysicsAdapter` interface** (namespace `physics`) so that any backend — kinematic, rigid-body, or custom — can be swapped in without changing a single line of game code.

### 10.1 Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Game code emits:  physics/body:add  physics/move  physics/query  …  │
│                                  │                                   │
│                           EventBus (namespace: 'physics')            │
│                                  │                                   │
│          ┌───────────────────────┼──────────────────┐               │
│          ▼                       ▼                  ▼               │
│  KinematicPhysicsAdapter  MatterPhysicsAdapter  RapierPhysicsAdapter │
│  (default — tile-based    (Matter.js rigid-body  (Rapier WASM —      │
│   kinematic movement)      — good for browsers)   high-perf rigid)  │
└──────────────────────────────────────────────────────────────────────┘
```

All physics events live under the `physics` namespace.  Only **one** physics backend may be registered at a time — registering two plugins with `namespace = 'physics'` causes `createEngine` to throw a duplicate-namespace error.

**Colliders stored per entity.** When a collider is attached via `physics/body:add` the active backend stores it internally (keyed by entity ID).  There are no changes to the `Entity` interface.  Colliders are automatically cleaned up when their owning entity is destroyed (`entity/destroyed`).

### 10.2 Collider Shapes

| Shape    | Required fields     | Description                        |
|----------|---------------------|------------------------------------|
| `rect`   | `width`, `height`   | Axis-aligned bounding box (AABB)   |
| `circle` | `radius`            | Circle collider                    |
| `point`  | —                   | Zero-size point                    |

All shapes accept optional `offsetX` / `offsetY` fields, relative to the entity's logical position.

### 10.3 Collision Layers

Use `CollisionLayer` constants and combine with bitwise `|`:

```ts
import { CollisionLayer } from 'inkshot-engine';

const layer = CollisionLayer.BODY | CollisionLayer.HURTBOX;
```

| Constant  | Bit | Purpose                                                      |
|-----------|-----|--------------------------------------------------------------|
| `BODY`    |   1 | Physical obstacle — blocked by solid tiles and other bodies  |
| `HITBOX`  |   2 | Deals damage (weapon swing area)                             |
| `HURTBOX` |   4 | Receives damage (character body)                             |
| `SENSOR`  |   8 | Overlap detection without physical blocking                  |

### 10.4 Event Contract

All physics backends **must** handle these events:

| Event                        | Async? | Description                                     |
|------------------------------|--------|-------------------------------------------------|
| `physics/body:add`           | ✗ sync | Attach a shape + layer mask to an entity        |
| `physics/body:remove`        | ✗ sync | Detach a collider from an entity                |
| `physics/tilemap:set`        | ✗ sync | Register or replace the active tile map         |
| `physics/move`               | ✗ sync | Move a BODY entity with full collision resolution; returns resolved `(x, y)` and `blockedX`/`blockedY` flags |
| `physics/query`              | ✗ sync | Return entity IDs whose colliders overlap a given shape + layer mask |
| `physics/raycast`            | ✗ sync | Cast a ray; return the first hit entity or tile |
| `physics/grid:snap`          | ✗ sync | Snap pixel coordinates to the nearest tile-grid corner |
| `physics/grid:worldToTile`   | ✗ sync | Convert pixel coords → tile `{ row, col }`      |
| `physics/grid:tileToWorld`   | ✗ sync | Convert tile `{ row, col }` → pixel top-left    |

The following event is **optional** (rigid-body backends may handle it; kinematic backends ignore it):

| Event              | Async? | Description                                         |
|--------------------|--------|-----------------------------------------------------|
| `physics/impulse`  | ✗ sync | Apply an impulse force to a rigid-body entity       |

Notification events **emitted** by the active backend:

| Event              | Description                                                                    |
|--------------------|--------------------------------------------------------------------------------|
| `physics/hit`      | Fired on the **first frame** a hitbox contacts a hurtbox; `{ attackerId, victimId }` |
| `physics/overlap`  | Fired when a sensor overlap begins (`entered: true`) or ends (`entered: false`) |

### 10.5 Movement Resolution

`physics/move` resolves axes **independently** (X first, then Y) to prevent corner-cutting:

```
1. Apply dx  →  check tile AABB  →  check BODY entities  →  snap if blocked
2. Apply dy  →  check tile AABB  →  check BODY entities  →  snap if blocked
3. [BODY colliders with movementMode:'grid'] snap to tile grid
```

The `blockedX` / `blockedY` flags let game code react (e.g. zero out velocity when hitting a floor or wall).

### 10.6 Tilemap Format

```ts
core.events.emitSync('physics/tilemap:set', {
  tileSize: 16,
  layers: [
    [0, 0, 0, 0],   // row 0 — open
    [0, 0, 0, 0],   // row 1 — open
    [1, 1, 1, 1],   // row 2 — solid floor
    [2, 2, 2, 2],   // row 3 — one-way platform
  ],
  tileShapes: {
    1: 'solid',     // full block on all sides
    2: 'top-only',  // one-way platform
  },
});
```

Internally the manager builds an O(1) `Map<"row,col", string>` lookup so per-frame tile checking adds negligible overhead regardless of map size.

### 10.7 Tile Shapes

The `tileShapes` record maps tile values to a `TileCollisionShape` string (or any custom string handled by a registered resolver):

| Shape | Behaviour |
|---|---|
| `'solid'` | Full impassable block on all four sides. |
| `'empty'` | Explicitly passable — overrides any inherited non-zero tile value. |
| `'top-only'` | One-way platform.  Blocks downward movement **only** when the entity's bottom edge was above the tile top before the move (prevents tunnelling). |
| `'slope-ne'` ◣ | Floor slope rising left-to-right.  Blocks downward movement; surface height is computed from the entity's horizontal centre. |
| `'slope-nw'` ◢ | Floor slope falling left-to-right.  Same as above, mirror geometry. |
| `'slope-se'` ◤ | Ceiling slope descending left-to-right.  Blocks upward movement. |
| `'slope-sw'` ◥ | Ceiling slope ascending left-to-right.  Blocks upward movement. |

Any tile value absent from the `tileShapes` record (or mapped to `'empty'`) is treated as passable.

### 10.8 Custom Tile Shape Resolvers

For tile shapes not covered by the built-in set, pass `customShapeResolvers` to the `KinematicPhysicsAdapter` constructor:

```ts
import { KinematicPhysicsAdapter } from 'inkshot-engine';
import type { TileShapeResolver } from 'inkshot-engine';

const iceResolver: TileShapeResolver = (shape, ctx) => {
  if (shape !== 'ice') return null; // pass to next resolver

  // Ice: behaves like a solid floor but only on the Y axis.
  if (ctx.axis === 'y' && ctx.dy > 0) {
    return {
      blocked: true,
      resolved: ctx.tileY - (ctx.entityAABB.bottom - ctx.entityY),
    };
  }
  return { blocked: false, resolved: ctx.entityY };
};

const { core } = await createEngine({
  plugins: [
    new EntityManager(),
    new KinematicPhysicsAdapter({ customShapeResolvers: [iceResolver] }),
  ],
});

core.events.emitSync('physics/tilemap:set', {
  tileSize: 16,
  layers: myTileData,
  tileShapes: {
    1: 'solid',
    2: 'top-only',
    3: 'slope-ne',
    4: 'ice',       // handled by iceResolver above
  },
});
```

The `TileShapeContext` supplied to each resolver contains:

| Field | Type | Description |
|---|---|---|
| `tileX` | `number` | World-space X of the tile's left edge |
| `tileY` | `number` | World-space Y of the tile's top edge |
| `tileSize` | `number` | Tile size in pixels |
| `entityAABB` | `{ left, top, right, bottom }` | Entity bounding box after the partial move |
| `entityShape` | `ColliderShape` | Entity's collider shape (for offset data) |
| `entityX` | `number` | Entity world X after the move |
| `entityY` | `number` | Entity world Y after the move |
| `dx` | `number` | Horizontal displacement (0 when resolving Y) |
| `dy` | `number` | Vertical displacement (0 when resolving X) |
| `axis` | `'x' \| 'y'` | Which axis is being resolved |

Resolvers are tried in registration order.  The first non-`null` result wins.  If all resolvers return `null`, the tile is treated as passable.

### 10.9 Pixel Mode vs Grid Mode

| `movementMode` | Behaviour |
|---|---|
| `'pixel'` (default) | Free sub-pixel movement; collision resolution snaps to tile boundaries only when blocked. |
| `'grid'` | Same resolution, but the entity is additionally snapped to the nearest tile corner after each `physics/move`. Useful for strict tile-locked movement (e.g. puzzle RPGs). |

### 10.10 Ranged Weapons

Two composable patterns — no changes to the physics backend needed for either:

**Hitscan (instant):** emit `physics/raycast` from the muzzle origin.  The first `HURTBOX` entity (or solid tile) in the ray's path is the hit.

**Physical projectiles (arrows, fireballs):** spawn a projectile entity tagged `['projectile']` with a `circle` collider on the `HITBOX` layer.  The active physics backend automatically emits `physics/hit` on the first frame it overlaps a `HURTBOX` entity.

### 10.11 Usage

```ts
import { createEngine, EntityManager, KinematicPhysicsAdapter, CollisionLayer } from 'inkshot-engine';

const { core } = await createEngine({
  plugins: [
    new EntityManager(),
    new KinematicPhysicsAdapter(),  // must come after EntityManager
    // To add custom tile shapes: new KinematicPhysicsAdapter({ customShapeResolvers: [...] })
  ],
});

// ── Register tilemap ────────────────────────────────────────────────────
core.events.emitSync('physics/tilemap:set', {
  tileSize: 16,
  layers: myTileData,
  tileShapes: {
    1: 'solid',
    2: 'solid',
    3: 'top-only',  // one-way platform
    4: 'slope-ne',  // ◣ ramp
  },
});

// ── Attach colliders ────────────────────────────────────────────────────
const { output } = core.events.emitSync('entity/create', {
  tags: ['player'], position: { x: 64, y: 64 },
});
const player = output.entity;

core.events.emitSync('physics/body:add', {
  entityId: player.id,
  shape: { type: 'rect', width: 14, height: 20, offsetX: -7, offsetY: -10 },
  layer: CollisionLayer.BODY | CollisionLayer.HURTBOX,
});

// ── Move each fixed update ──────────────────────────────────────────────
core.events.on('myGame', 'core/update', ({ dt }) => {
  const { output: move } = core.events.emitSync('physics/move', {
    entityId: player.id,
    dx: velocityX * dt,
    dy: velocityY * dt,
  });
  if (move.blockedY && velocityY > 0) velocityY = 0; // landed
  if (move.blockedX) velocityX = 0;                  // hit a wall
});

// ── Query nearby enemies ────────────────────────────────────────────────
const { output: q } = core.events.emitSync('physics/query', {
  shape: { type: 'circle', radius: 80 },
  position: player.position,
  layerMask: CollisionLayer.HURTBOX,
  excludeEntityId: player.id,
});
// q.entities → IDs of all nearby hurtbox entities

// ── Hitscan attack ──────────────────────────────────────────────────────
const { output: ray } = core.events.emitSync('physics/raycast', {
  origin: player.position,
  direction: { x: 1, y: 0 },
  maxDistance: 200,
  layerMask: CollisionLayer.HURTBOX,
});
if (ray.hit && ray.entityId) applyDamage(ray.entityId, 25);

// ── React to combat events ──────────────────────────────────────────────
core.events.on('combat', 'physics/hit', ({ attackerId, victimId }) => {
  applyDamage(victimId, 10);
});
core.events.on('triggers', 'physics/overlap', ({ entityAId, entityBId, entered }) => {
  if (entered) openDoor(entityAId, entityBId);
});
```

### 10.12 Recommended Plugin Order

`KinematicPhysicsAdapter` must be registered **after** `EntityManager` because it uses
`entity/query` to read entity positions at runtime:

```ts
createEngine({
  plugins: [
    new ResourceManager(),
    new AudioManager(),
    new LocalizationManager(),
    new InputManager(),
    new SaveManager(),
    new GameStateManager(),
    new EntityManager(),
    new KinematicPhysicsAdapter(),   // ← after EntityManager
    new SceneManager(),
    new TweenManager(),
  ],
});
```

### 10.13 Implementing a Custom Physics Backend

Any class that implements `EnginePlugin` with `namespace = 'physics'` is a valid physics backend.  Implement the `PhysicsAdapter` marker interface and register handlers for all required events:

```ts
import type { Core } from 'inkshot-engine';
import type { EnginePlugin, PhysicsAdapter } from 'inkshot-engine';

export class MyRigidBodyAdapter implements EnginePlugin, PhysicsAdapter {
  readonly namespace = 'physics' as const;
  readonly dependencies = ['entity'] as const;

  init(core: Core): void {
    const { events } = core;

    events.on(this.namespace, 'physics/body:add', (params) => {
      // Create a rigid body in your physics engine and track it by entityId
    });

    events.on(this.namespace, 'physics/body:remove', ({ entityId }) => {
      // Remove the rigid body
    });

    events.on(this.namespace, 'physics/tilemap:set', (params) => {
      // Convert tile data to static collision bodies
    });

    events.on(this.namespace, 'physics/move', (params, output) => {
      // Step the simulation and write resolved position to output
      output.x = /* resolved x */;
      output.y = /* resolved y */;
      output.blockedX = /* … */;
      output.blockedY = /* … */;
    });

    events.on(this.namespace, 'physics/query', (params, output) => {
      output.entities = /* overlapping entity IDs */;
    });

    events.on(this.namespace, 'physics/raycast', (params, output) => {
      output.hit = /* … */;
    });

    // grid helpers
    events.on(this.namespace, 'physics/grid:snap',        (p, o) => { /* … */ });
    events.on(this.namespace, 'physics/grid:worldToTile', (p, o) => { /* … */ });
    events.on(this.namespace, 'physics/grid:tileToWorld', (p, o) => { /* … */ });

    // Optional: handle impulses for rigid-body backends
    events.on(this.namespace, 'physics/impulse', ({ entityId, forceX, forceY }) => {
      // Apply impulse to the rigid body
    });

    // Emit physics/hit and physics/overlap notifications as appropriate
    // during your simulation step (e.g. via collision callbacks).
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }
}
```

Register it like any other plugin — the engine guarantees only one `physics` namespace is active:

```ts
createEngine({
  plugins: [
    new EntityManager(),
    new MyRigidBodyAdapter(),  // replaces KinematicPhysicsAdapter
  ],
});
```

> **Implementation invariant — position sync**
>
> If your backend steps a physics engine each `core/update` and then syncs body positions back to
> `entity.position`, **only sync non-BODY-layer bodies**.  `BODY`-layer colliders are kinematic:
> their position is authoritative from `physics/move`.  Syncing them from the physics world would
> silently overwrite the resolved kinematic position with whatever the integrator produced (e.g.
> gravity drift), breaking movement resolution every frame.
>
> ```ts
> // ✅ Correct — skip BODY-layer (kinematic) bodies
> for (const [entityId, record] of this._records) {
>   if (record.layer & CollisionLayer.BODY) continue;  // ← kinematic: skip
>   entity.position.x = body.translation().x - offsetX;
>   entity.position.y = body.translation().y - offsetY;
> }
> ```

---

## 11. File & Module Conventions

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
| `AudioManager.ts` | `audio` | Web Audio API playback with spatial audio (`PannerNode`), categories, fade, pause/resume |
| `SaveManager.ts` | `save` | In-memory save slots and global save data |
| `GameStateManager.ts` | `game` | High-level game phase state machine |
| `InputManager.ts` | `input` | Keyboard, pointer, and gamepad input; action bindings; per-frame axes cache |
| `TimerManager.ts` | `timer` | One-shot timers, repeating intervals, cooldown tracking, and `cancel-all` |
| `ResourceManager.ts` | `assets` | Multi-mode asset loading with cache-first guarantee |
| `LocalizationManager.ts` | `i18n` | JSON locale loading, key lookup, variable substitution, and token interpolation |
| `SceneManager.ts` | `scene` | Scene registration, lifecycle management, and transition orchestration |
| `EntityManager.ts` | `entity` | ECS-lite entity creation, destruction, and tag-based queries |
| `SpriteAnimator.ts` | `animator` | Frame-based sprite animation driven by `EntityManager` entities |
| `KinematicPhysicsAdapter.ts` | `physics` | Default physics backend — tile-based kinematic movement, AABB/circle/point collision, tilemap resolution, raycasting, spatial queries |
| `MatterPhysicsAdapter.ts` | `physics` | Alternate physics backend using Matter.js — rigid-body simulation, good for browser games |
| `RapierPhysicsAdapter.ts` | `physics` | Alternate physics backend using Rapier.js (WASM) — high-performance rigid-body/soft-body simulation |
| `TweenManager.ts` | `tween` | Property-based animation driver; hosts `Tween` and `Timeline` objects |
| `Timeline.ts` | _(n/a)_ | Fluent builder for sequenced/parallel tween animations (used via `TweenManager`) |
| `TilemapManager.ts` | `tilemap` | Chunk-based tilemap rendering with autotile, animated tiles, and multi-layer support |
| `ParticleManager.ts` | `particle` | 2D particle emitter system with burst/continuous modes, spawn shapes, and ObjectPool reuse |
| `PathfindingManager.ts` | `pathfinding` | A* pathfinding with weighted terrain, LRU cache, dynamic obstacles (tag-filtered), `fallbackToNearest`, and `smoothPath` |
| `UIManager.ts` | `ui` | Event-driven UI widget system; nine built-in types; extensible via `ui/register` |
| `DialogueManager.ts` | `dialogue` | Typewriter dialogue box with inline markup (colour, speed, pause), choice display, and i18n integration |
| `DialogueMarkupParser.ts` | _(n/a)_ | Pure parser for `[c=]` / `[speed=]` / `[pause=]` tags; exported as `parseDialogueMarkup`, `buildTextSegments`, `getSpeedAtIndex` |
| `ScriptManager.ts` | `script` | Data-defined script execution with async command nodes and built-in commands (jump/if/wait/emit/say/choices/fork/call/wait-event) |
| `ActorManager.ts` | `actor` | Game-character management driven by trigger tables and scripts; integrates with `ScriptManager` |
| `VariableStoreManager.ts` | `store` | Namespaced two-level key-value store; snapshot/restore; auto-integrates with `save/slot:save` and `save/slot:load` |
| `DebugPlugin.ts` | `debug` | Dev-mode overlay: FPS graph, collider visualiser, entity inspector, tilemap grid, EventBus log panel; toggled by `` ` `` / F12 |
| `LocalStorageSaveAdapter.ts` | _(n/a)_ | `localStorage`-backed persistence adapter for `SaveManager` |
| `LoadingScreen.ts` | `loading` | Built-in fade-in/fade-out loading overlay wired to `scene/load` |

Rules:

- `src/index.ts` **only re-exports**.  It must not contain logic.
- Internal modules import from relative paths with the `.js` extension (required for ESM).
- **No circular imports.**  The dependency graph flows: `types` ← `core` ← `plugins` ← `rendering` ← `createEngine` ← `index`.

---

## 12. Tween & Timeline System (TweenManager)

The `TweenManager` is a built-in `EnginePlugin` (namespace `tween`) that drives **property-based animations** on arbitrary JavaScript objects.  It subscribes to `core/tick` and advances every registered animation each frame.

### 12.1 Architecture

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

### 12.2 Tween Options

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

### 12.3 Tween State API

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

### 12.4 Timeline Builder API

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

### 12.5 Timeline Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onComplete` | `() => void` | — | Called when the timeline finishes (not called when `loop: true` or `repeat: -1`) |
| `loop` | `boolean` | `false` | Repeat indefinitely |
| `repeat` | `number` | `0` | Extra plays after the first (`-1` = infinite) |
| `repeatDelay` | `number` | `0` | Gap in ms between each repeat cycle |

### 12.6 Timeline State API

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

### 12.7 EventBus Contract

| Event | Direction | Description |
|-------|-----------|-------------|
| `tween/to` | ✗ `emitSync` | Create and register a new tween; returns `{ id }` |
| `tween/kill` | ✗ `emitSync` | Stop tweens by `id`, `target`, or `{ all: true }` |
| `tween/finished` | — emitted | Fired by `TweenManager` when a tween/timeline completes naturally; payload: `{ id?, target? }` |

### 12.8 Usage Examples

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

### 12.9 Integration with SceneManager

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

## 13. Particle System (ParticleManager)

The `ParticleManager` is a built-in `EnginePlugin` (namespace `particle`) that drives a 2D particle simulation.  It integrates with `ObjectPool` to reuse display objects and avoid garbage-collection pressure.

### 13.1 Architecture

```
core/update  (fixed tick)
    │
    ▼
ParticleManager._update(dt)
    │
    ├── for each Emitter (active, not paused)
    │       ├── continuous: accumulate dt → spawn new particles at rate
    │       ├── burst:      already spawned; wait for particles to expire
    │       └── _stepEmitter(emitter, dt)
    │               ├── advance each Particle (physics + visual interpolation)
    │               └── reap dead particles → pool.release(display)
    │
    └── remove finished emitters → emit particle/complete (if natural end)
```

Each emitter owns an `ObjectPool<ParticleDisplay>`.  When a particle dies its display object is returned to the pool; when a new particle is spawned the pool is checked first before allocating.

### 13.2 Emission Modes

| Mode | Trigger | `particle/complete` |
|---|---|---|
| **Burst** (`burst: true`) | Emits `burstCount` immediately, then waits for all to die | ✓ fired after last particle dies |
| **Continuous** (default) | Emits at `rate` per second until `duration` elapses or `stop()` is called | ✓ fired after `duration` expires **and** last particle dies (natural end only) |
| **Repeat burst** (`repeatBurst: true`) | Burst cycles indefinitely; `repeatInterval` ms between cycles | ✗ not fired between cycles |

### 13.3 Pre-warm

Setting `preWarm > 0` fast-forwards the simulation by that many milliseconds immediately after the emitter is created.  The engine uses 16 ms steps (60 fps cadence) so the state is physically accurate.  Use this to make continuous effects (fire, smoke) appear mid-stream when a scene opens:

```ts
core.events.emitSync('particle/emit', {
  config: {
    x: 100, y: 400,
    rate: 60, lifetime: 800,
    speed: 40, gravity: -200,
    preWarm: 1000,   // start 1 second in
  },
});
```

### 13.4 Spawn Shapes

| `spawnShape` | Description |
|---|---|
| `'point'` (default) | All particles originate at `(x, y)` |
| `'rect'` | Uniform random offset within `[−w/2, w/2] × [−h/2, h/2]` |
| `'circle'` | Uniform random offset within a disc (`√random` for area-uniform distribution) |

### 13.5 Event Contract

| Event | Async? | Description |
|---|---|---|
| `particle/emit` | ✗ `emitSync` | Create and start an emitter; returns `{ id }` |
| `particle/stop` | ✗ `emitSync` | Stop spawning new particles; live particles continue |
| `particle/clear` | ✗ `emitSync` | Immediately remove one or all emitters and their particles |
| `particle/move` | ✗ `emitSync` | Relocate an emitter's spawn origin |
| `particle/pause` | ✗ `emitSync` | Freeze one or all emitters (no spawn, no advance) |
| `particle/resume` | ✗ `emitSync` | Unfreeze one or all paused emitters |
| `particle/update` | ✗ `emitSync` | Merge a partial config into a running emitter |
| `particle/count` | ✗ `emitSync` | Query `{ emitterCount, particleCount }` |
| `particle/complete` | — emitted | Fired when an emitter ends **naturally** |

### 13.6 Direct API

```ts
import { createEngine, ParticleManager } from 'inkshot-engine';

const { core } = await createEngine({
  plugins: [new ParticleManager({ poolSize: 512 })],
});

// Start a continuous flame
const id = core.events.emitSync('particle/emit', {
  config: {
    x: 200, y: 400,
    rate: 80,
    speed: 30, spread: 20, angle: 270,
    gravity: -300,
    lifetime: 600,
    startColor: 0xffff00, endColor: 0xff2200,
    angularVelocity: 90, angularVelocityVariance: 45,
    spawnShape: 'circle', spawnRadius: 8,
    preWarm: 600,
  },
}).output.id;

// Move with the hero each tick
core.events.on('myGame', 'core/update', () => {
  core.events.emitSync('particle/move', { id, x: hero.x, y: hero.y });
});

// Slow it down in pause menu
core.events.emitSync('particle/pause',  {});
core.events.emitSync('particle/resume', {});

// Hot-swap rate without stopping the emitter
core.events.emitSync('particle/update', { id, config: { rate: 160 } });

// Query
const { output } = core.events.emitSync('particle/count', {});
console.log(`${output.emitterCount} emitters, ${output.particleCount} particles`);

// Stop and wait for live particles to die naturally
core.events.emitSync('particle/stop', { id });
core.events.on('vfx', 'particle/complete', ({ id }) => console.log(`${id} done`));

// Force clear immediately
core.events.emitSync('particle/clear', {});   // clear all
```

### 13.7 Custom Display Factory

For tests or non-Pixi environments pass a `createDisplay` factory:

```ts
const pm = new ParticleManager({
  createDisplay: () => ({
    x: 0, y: 0, alpha: 1,
    scale: { x: 1, y: 1 },
    rotation: 0, tint: 0xffffff,
  }),
});
```

The default factory creates a `Sprite` (when `config.texture` is set) or a small filled `Graphics` circle (using `config.radius`, default `4`).

---

## 14. Pathfinding System (PathfindingManager)

The `PathfindingManager` is a built-in `EnginePlugin` (namespace `pathfinding`) that provides
tile-based A* navigation.  It depends on both the active physics backend (for the tile grid) and
`EntityManager` (for optional dynamic obstacles).

### 14.1 Architecture

```
physics/tilemap:set    ──► _buildGrid()         rebuild full cost grid
tilemap/set-tile       ──► _updateCell(row,col)  O(1) single-cell update
pathfinding/find       ──► _find(params)          A* search → path[]
```

- **Cost grid** — built from the physics tile map.  `'solid'` tiles (and any tile with a
  non-empty, non-passable shape) are set to `Infinity` (impassable).  All other cells default
  to cost `1`.  Costs can be overridden per tile value via `pathfinding/weight:set`.
- **Dynamic obstacles** — when `includeDynamicObstacles: true` is set, entity positions are
  queried via `entity/query`.  Use `tagFilter` to restrict which entities count as obstacles
  (without a filter every entity, including HUD anchors and decorative sprites, would block
  the path).  Dynamic-obstacle results are never cached.
- **Path cache** — static A* results are stored in a 512-entry **LRU** `Map` keyed by
  `"fromRow,fromCol→toRow,toCol"`.  The oldest entry is evicted on overflow, bounding memory
  use on large open maps.  The cache is fully cleared on `physics/tilemap:set` and on
  `tilemap/set-tile` (which also updates the affected grid cell in O(1)).

### 14.2 A* Details

| Setting | Value |
|---------|-------|
| Heuristic (8-dir) | Chebyshev distance |
| Heuristic (4-dir) | Manhattan distance |
| Diagonal movement | Supported by default (`directions: 8`); disable with `directions: 4` |
| Diagonal cost | `√2 ≈ 1.414` × base cell cost |

**Start-cell guard** — if the starting tile is itself impassable (entity knocked into a wall,
teleport into a solid), `_find` returns `found: false` immediately instead of running A*
outward from an unreachable origin.

### 14.3 Event Contract

| Event                     | Async? | Description |
|---------------------------|--------|-------------|
| `pathfinding/find`        | ✗ sync | A* path from `from` to `to` (world px); returns `path[]`, `cost`, optional `nearest` |
| `pathfinding/weight:set`  | ✗ sync | Override the movement cost for a tile value |
| `pathfinding/cache:clear` | ✗ sync | Manually invalidate the path cache |

### 14.4 `pathfinding/find` Parameters

| Parameter                 | Type       | Default    | Description |
|---------------------------|------------|------------|-------------|
| `from`                    | `{x,y}`    | —          | Start position in world pixels |
| `to`                      | `{x,y}`    | —          | Goal position in world pixels |
| `includeDynamicObstacles` | `boolean`  | `false`    | Treat entity tile positions as dynamic obstacles (results not cached) |
| `tagFilter`               | `string[]` | —          | With `includeDynamicObstacles`: only entities with **all** listed tags block the path |
| `fallbackToNearest`       | `boolean`  | `false`    | BFS from the goal to the nearest passable cell when the goal tile is impassable; actual target in `output.nearest` |
| `smoothPath`              | `boolean`  | `false`    | String-pull (Bresenham LoS) post-pass to remove staircase waypoints from diagonal paths |
| `maxIterations`           | `number`   | `10 000`   | Abort A* after this many iterations to protect against pathological inputs |

### 14.5 Constructor Options

```ts
new PathfindingManager({ directions: 4 | 8 })
// directions — 4: cardinal only; 8: cardinal + diagonal (default)
```

### 14.6 Usage

```ts
import { createEngine, EntityManager, KinematicPhysicsAdapter, TilemapManager, PathfindingManager } from 'inkshot-engine';
import type { PathfindingFindParams, PathfindingFindOutput } from 'inkshot-engine';

const { core } = await createEngine({
  plugins: [
    new EntityManager(),
    new KinematicPhysicsAdapter(),
    new TilemapManager(),
    new PathfindingManager(),   // or { directions: 4 } for 4-dir only
  ],
});

// ── Basic path request ──────────────────────────────────────────────────
const { output } = core.events.emitSync<PathfindingFindParams, PathfindingFindOutput>(
  'pathfinding/find',
  { from: player.position, to: target.position },
);
if (output.found) followPath(output.path);

// ── Dynamic obstacles scoped to tagged entities ─────────────────────────
const { output: dyn } = core.events.emitSync('pathfinding/find', {
  from: npc.position,
  to:   goal.position,
  includeDynamicObstacles: true,
  tagFilter: ['obstacle'],   // only entities tagged 'obstacle' block the path
});

// ── Fallback when clicking on a wall ───────────────────────────────────
const { output: near } = core.events.emitSync('pathfinding/find', {
  from: player.position,
  to:   clickPosition,
  fallbackToNearest: true,
});
if (near.found) {
  if (near.nearest) console.log('Redirected to:', near.nearest);
  followPath(near.path);
}

// ── Smooth diagonal paths ────────────────────────────────────────────
const { output: smooth } = core.events.emitSync('pathfinding/find', {
  from: player.position,
  to:   target.position,
  smoothPath: true,   // string-pulls LoS to remove staircase waypoints
});

// ── Weighted terrain ─────────────────────────────────────────────────
core.events.emitSync('pathfinding/weight:set', { tileId: 3, cost: 2 });        // mud (2× cost)
core.events.emitSync('pathfinding/weight:set', { tileId: 4, cost: Infinity }); // lava (impassable)

// ── Manual cache flush (script-driven layout changes) ────────────────
core.events.emitSync('pathfinding/cache:clear', {});
```

### 14.7 Automatic Grid Synchronisation

The grid is kept in sync with two event sources:

| Event                   | Handler behaviour |
|-------------------------|-------------------|
| `physics/tilemap:set`   | Full grid rebuild (`O(rows × cols)`) + cache clear |
| `tilemap/set-tile`      | Single-cell update (`O(1)`) + cache clear |

This means opening a door (`tilemap/set-tile` with an empty tile) or placing a block is
immediately reflected in all subsequent `pathfinding/find` calls — no manual intervention
needed.

---

## 15. UI Widget System (UIManager)

The `UIManager` is a built-in `EnginePlugin` (namespace `ui`) that provides a flexible,
event-driven widget layer.  Widgets live on the `ui` render layer and are identified by a
developer-assigned string id.

### 15.1 Architecture

```
ui/register   ──► _factories.set(type, factory)
ui/create     ──► factory(id, props, core) → UIWidget  (mounted on ui layer)
ui/show|hide  ──► widget.show() / hide()
ui/destroy    ──► widget.destroy()  (removed from layer + factory map)
ui/update     ──► widget.update(newProps)
ui/get        ──► returns widget reference (pull pattern)
```

- **Widget factories** — a factory is a pure function `(id, props, core) => UIWidget`.
  Nine factories are registered at startup; additional ones can be added via `ui/register`.
- **Widget lifecycle** — widgets are mounted on creation and unmounted on destruction.
  `show()` / `hide()` only toggle `container.visible`; the Pixi object stays in memory.
- **Anchor layout** — if `anchor` and optional pixel offsets are supplied in `ui/create`,
  `UIManager` queries the viewport bounds via `renderer/layer` and positions the widget
  relative to the chosen edge/corner.

### 15.2 Built-in Widget Types

| Type          | Description |
|---------------|-------------|
| `label`       | Text display; subscribes to `i18n/changed` when an `i18nKey` is set |
| `button`      | Hover / press highlight; emits a callback on tap |
| `panel`       | Rounded-rect background with optional alpha |
| `progressbar` | Horizontal fill bar (0–1); updates via `ui/update` |
| `slider`      | Draggable knob; fires pointer callbacks on change |
| `scrollview`  | Masked content area with mouse-wheel scroll |
| `dialog`      | Modal dialog with Confirm / Cancel buttons |
| `stack`       | Linear layout container with configurable axis and spacing |
| `dialoguebox` | Dialogue rendering widget (see §15) |

### 15.3 Event Contract

| Event        | Async? | Description |
|--------------|--------|-------------|
| `ui/register` | ✗ sync | Register (or replace) a widget factory; returns `{ registered }` |
| `ui/create`   | ✗ sync | Create and mount a widget; returns `{ widget }` |
| `ui/show`     | ✗ sync | Make a widget visible |
| `ui/hide`     | ✗ sync | Hide a widget (keeps it in memory) |
| `ui/destroy`  | ✗ sync | Destroy and remove a widget from the layer |
| `ui/update`   | ✗ sync | Update properties of an existing widget |
| `ui/get`      | ✗ sync | Pull: retrieve a widget by id; returns `{ widget }` |

**Notifications**

| Event          | When |
|----------------|------|
| `ui/created`   | After a widget is created and mounted |
| `ui/shown`     | After `widget.show()` is called |
| `ui/hidden`    | After `widget.hide()` is called |
| `ui/destroyed` | After a widget is destroyed and removed |

### 15.4 Custom Widget Registration

```ts
core.events.emitSync('ui/register', {
  type: 'myGame/healthbar',
  factory: (id, props, core) => {
    const container = new Container();
    // … build Pixi objects …
    return {
      id, type: 'myGame/healthbar', container,
      show()  { container.visible = true; },
      hide()  { container.visible = false; },
      destroy() { container.destroy({ children: true }); },
      update(newProps) { /* live update */ },
    };
  },
});
```

### 15.5 Usage

```ts
import { createEngine, UIManager } from 'inkshot-engine';

const { core } = await createEngine({ plugins: [new UIManager()] });

// Create widgets
core.events.emitSync('ui/create', { type: 'label',       id: 'score',  text: 'Score: 0',       anchor: 'top-right', x: -16, y: 16 });
core.events.emitSync('ui/create', { type: 'button',      id: 'pause',  text: 'Pause',          anchor: 'top-left',  x:  16, y: 16, onClick: () => core.pause() });
core.events.emitSync('ui/create', { type: 'progressbar', id: 'hp',     value: 1.0, width: 200, anchor: 'bottom-left', x: 16, y: -16 });
core.events.emitSync('ui/create', { type: 'dialoguebox', id: 'box',    width: 600, height: 160, anchor: 'bottom-center', y: -20 });

// Dynamic updates
core.events.emitSync('ui/update', { id: 'score', text: 'Score: 42' });
core.events.emitSync('ui/update', { id: 'hp',    value: 0.5 });
```

---

## 16. Dialogue System (DialogueManager)

The `DialogueManager` is a built-in `EnginePlugin` (namespace `dialogue`) that handles the
**presentation layer** of a dialogue box: typewriter animation, inline-markup styling, player
input forwarding, and choice display.  All flow control (branching, conditions, tree traversal)
belongs to the external script system, which drives `DialogueManager` by emitting command events.

### 16.1 Architecture

```
dialogue/show-text     ──► parseDialogueMarkup() → session reset + DialogueNodeParams
core/update            ──► per-character typewriter loop
                            · getSpeedAtIndex() for per-char speed
                            · pauseRemainingMs drain for inline pauses
                            ──► dialogue/text:tick { text, done, segments[] }
dialogue/advance       ──► skip typewriter / cancel pause ──► dialogue/advanced
dialogue/show-choices  ──► session update ──► dialogue/choices
dialogue/choice        ──► dialogue/choice:made
dialogue/end           ──► dialogue/ended
dialogue/state:get     ──► pull: { active, text, textDone, choices }
```

### 16.2 Inline Markup

The text string supplied to `dialogue/show-text` may contain square-bracket tags that are
parsed by `DialogueMarkupParser` before the typewriter starts.

| Tag | Effect |
|-----|--------|
| `[c=#rrggbb]…[/c]` or `[color=#rrggbb]…[/color]` | Inline colour (3- or 6-digit hex) |
| `[speed=n]…[/speed]` | Override typewriter speed in chars/sec within the block |
| `[pause=n]` | Pause the typewriter for `n` ms (self-closing) |

The tags are fully stripped before the plain text is fed to the typewriter.  `dialogue/text:tick`
carries both `text` (plain) and `segments` (styled runs) so any rendering backend can choose
which representation to use.

**ReDoS safety** — the parser regex `[^\]\[]+` forbids nested brackets inside tags, ensuring
the regex engine backtracks in O(n) time even on adversarial input.

### 16.3 Typewriter Loop

Each `core/update` tick, the loop processes accumulated milliseconds one character at a time:

```
while remainingMs > 0 and not done:
    if pauseRemainingMs > 0:
        drain remainingMs into pauseRemainingMs; continue
    cost = 1000 / getSpeedAtIndex(charIndex, speedSpans, default)
    if remainingMs < cost:
        save remainder in accumMs; break
    remainingMs -= cost
    charIndex++
    check if a pause fires at charIndex → set pauseRemainingMs
```

This design means `dialogue/advance` (skip) simply sets `charIndex = len`, clears
`pauseRemainingMs`, and emits the final tick.

### 16.4 Event Contract

| Event                   | Async? | Description |
|-------------------------|--------|-------------|
| `dialogue/show-text`    | ✗ sync | Begin a text line; starts or resets the typewriter |
| `dialogue/show-choices` | ✗ sync | Display a choice list; text is pre-revealed |
| `dialogue/advance`      | ✗ sync | Skip typewriter **or** emit `dialogue/advanced` |
| `dialogue/choice`       | ✗ sync | Confirm choice at `index`; emits `dialogue/choice:made` |
| `dialogue/end`          | ✗ sync | End the session; emits `dialogue/ended` |
| `dialogue/state:get`    | ✗ sync | Pull: returns `{ active, text, textDone, choices }` |

**Notifications**

| Event                  | Carries | When |
|------------------------|---------|------|
| `dialogue/started`     | `{}` | Session opens (first `show-text` or `show-choices`) |
| `dialogue/node`        | `{ speaker, portrait }` | New text line begins |
| `dialogue/text:tick`   | `{ text, done, segments[] }` | Each typewriter step; also on skip |
| `dialogue/choices`     | `{ choices[] }` | Choices become active |
| `dialogue/advanced`    | `{}` | Player advanced after text fully revealed |
| `dialogue/choice:made` | `{ index }` | Player confirmed a choice |
| `dialogue/ended`       | `{}` | Session ends |

### 16.5 `DialogueTextSegment`

```ts
interface DialogueTextSegment {
  text:   string;      // portion of the plain text
  color?: number;      // Pixi hex value (e.g. 0xff4444); absent = widget default colour
}
```

`dialogue/text:tick` always carries `segments: ReadonlyArray<DialogueTextSegment>`.
The built-in `dialoguebox` widget renders them as `<span style="color:…">…</span>` HTML via
PixiJS `HTMLText`.  Custom renderers can consume `segments` directly.

### 16.6 `parseDialogueMarkup` — Public API

```ts
import { parseDialogueMarkup, buildTextSegments, getSpeedAtIndex } from 'inkshot-engine';
import type { ParsedMarkup, ColorSpan, SpeedSpan, PauseMark } from 'inkshot-engine';

const result: ParsedMarkup = parseDialogueMarkup(
  '[speed=20]Slow…[/speed][pause=300][c=#ff0000]Red![/c]'
);
// result.plain        === 'Slow…Red!'
// result.speedSpans   === [{ start: 0, end: 5, speed: 20 }]
// result.pauses       === [{ afterIndex: 5, ms: 300 }]
// result.colorSpans   === [{ start: 5, end: 9, color: 0xff0000 }]

// Build styled segments for the first 7 revealed characters
const segs = buildTextSegments(result.plain, 7, result.colorSpans);

// Query speed at position 2
const speed = getSpeedAtIndex(2, result.speedSpans, 40);  // → 20
```

### 16.7 Usage

```ts
import { createEngine, UIManager, DialogueManager } from 'inkshot-engine';
import type { DialogueTextTickParams } from 'inkshot-engine';

const { core } = await createEngine({
  plugins: [new UIManager(), new DialogueManager({ defaultCharsPerSecond: 40 })],
});

// Create the dialogue box widget
core.events.emitSync('ui/create', {
  type: 'dialoguebox',
  id: 'box',
  anchor: 'bottom-center',
  y: -20,
});

// Script sends a line with markup
core.events.emitSync('dialogue/show-text', {
  text: 'She [speed=20]slowly said[/speed][pause=400][c=#ff4444]Danger![/c]',
  speaker: 'Alice',
});

// React to player advance
core.events.on('script', 'dialogue/advanced', () => {
  core.events.emitSync('dialogue/show-choices', {
    choices: [{ text: 'Run!', index: 0 }, { text: 'Stay.', index: 1 }],
  });
});

// React to choice
core.events.on('script', 'dialogue/choice:made', ({ index }) => {
  core.events.emitSync('dialogue/end', {});
});
```

---

## 17. Script System (ScriptManager)

`ScriptManager` drives data-defined behaviours as ordered lists of command nodes.

### 17.1 Architecture

Scripts are registered with `script/define` and started with `script/run`.  Each
run is isolated by an `instanceId`; different IDs execute **concurrently** in
JavaScript's single-threaded event loop.

```
script/run  instanceId: 'guard-1'  ──wait─────────────────►
script/run  instanceId: 'guard-2'      ──wait─────────────►
script/run  instanceId: 'cutscene'           ──say─►end
```

### 17.2 Built-in Commands

| Command         | Key fields                                                   | Description                                                           |
|-----------------|--------------------------------------------------------------|-----------------------------------------------------------------------|
| `label`         | `name`                                                       | Position marker — no-op at runtime                                    |
| `jump`          | `target`                                                     | Unconditional jump to a label                                         |
| `if`            | `var`, `value`, `jump`                                       | Jump when `vars[var] === value`; warns if label missing               |
| `if-not`        | `var`, `value`, `jump`                                       | Jump when `vars[var] !== value`                                       |
| `if-gt`         | `var` (string), `value` (number), `jump`                     | Jump when `vars[var] > value` (numeric)                               |
| `if-lt`         | `var` (string), `value` (number), `jump`                     | Jump when `vars[var] < value` (numeric)                               |
| `set`           | `var`, `value`                                               | Write a value into the variable store                                 |
| `wait`          | `ms`                                                         | Pause for N milliseconds                                              |
| `emit`          | `event`, `params?`                                           | Fire a custom event synchronously                                     |
| `say`           | `text?`, `speaker?`, `portrait?`, `speed?`                   | Show dialogue text via `DialogueManager`, await advance               |
| `choices`       | `choices`, `prompt?`, `var?`                                 | Show choices, store picked index in `var`                             |
| `end`           | —                                                            | Close the dialogue session                                            |
| `wait-event`    | `event`, `var?`, `timeout?` (ms), `timeoutJump?`             | Suspend until an event fires; optional timeout with label fallback    |
| `call`          | `id`, `vars?`                                                | Run a sub-script inline (shared vars, same instance lane)             |
| `fork`          | `id`, `instanceId?`, `vars?`, `priority?`                    | Launch a concurrent instance (fire-and-forget)                        |
| `wait-instance` | `instanceId`                                                 | Suspend until a named instance finishes                               |
| `stop-instance` | `instanceId`                                                 | Stop another running instance                                         |

### 17.3 `wait-event` with Timeout

The optional `timeout` / `timeoutJump` fields let a script give up waiting after
a deadline:

```ts
// Wait up to 3 seconds for the player to arrive; otherwise branch to 'idle'
{ cmd: 'wait-event', event: 'player/arrived', timeout: 3000, timeoutJump: 'idle' }
```

If the event fires before the timeout, execution continues normally from the
next node.  If the timeout fires first:
- If `timeoutJump` is provided, execution jumps to that label.
- Otherwise execution falls through to the next node.

### 17.4 Event Contract

| Event                     | Direction | Description                                     |
|---------------------------|-----------|-------------------------------------------------|
| `script/define`           | → SM      | Register or overwrite a script definition       |
| `script/run`              | → SM      | Start a script instance                         |
| `script/stop`             | → SM      | Stop one or all running instances               |
| `script/register-command` | → SM      | Register a custom command handler               |
| `script/state:get`        | → SM      | Query execution state → `ScriptStateGetOutput`  |
| `script/started`          | SM →      | A script instance began execution               |
| `script/ended`            | SM →      | A script instance finished or was stopped       |
| `script/step`             | SM →      | Before each command node executes               |
| `script/error`            | SM →      | A command handler threw an unhandled error      |

---

## 18. Actor System (ActorManager)

`ActorManager` manages game characters whose behaviour is driven by a trigger
table and a set of scripts.

### 18.1 Concepts

- **ActorDef** — Blueprint declaring scripts, triggers, and initial state.
- **ActorInstance** — A live copy with its own independent `state` store.
- **TriggerDef** — Binds an event to a script run on the actor.

### 18.2 Trigger Modes

| Mode | Lane | Typical use |
|------|------|-------------|
| `'concurrent'` | `<actorId>:<triggerId>` | Looping background behaviours (patrol, ambient VFX) |
| `'blocking'`   | `<actorId>` (primary)   | Interrupting sequences (dialogue, cutscene)         |

`blocking` supports `priority` (preempts lower-priority scripts) and `onEnd`
(`'restore'` re-launches the preempted script after the blocking script ends).

### 18.3 `actor/spawned` Trigger Behaviour

Triggers with `event: 'actor/spawned'` are fired **directly** on the newly
spawned instance at spawn time, **not** via the event bus.  This ensures that
existing instances are never affected when a new instance is spawned.

### 18.4 State Management

| Event                | Description                                                                 |
|----------------------|-----------------------------------------------------------------------------|
| `actor/state:set`    | Write a single key; emits `actor/state:changed`                             |
| `actor/state:patch`  | Write multiple keys atomically; emits **one** `actor/state:patched` event   |
| `actor/state:get`    | Returns a **deep clone** of the state (mutations do not affect live state)  |
| `actor/list`         | Returns all live `ActorInstance` objects                                    |

`actor/state:patch` example:

```ts
// Update three keys and receive one notification
core.events.emitSync('actor/state:patch', {
  instanceId: 'merchant-1',
  patch: { gold: 0, isAvailable: false, quest: 'done' },
});
// → emits actor/state:patched once with { patch, previous }
```

### 18.5 Full Event Contract

| Event                   | Direction | Description                                            |
|-------------------------|-----------|--------------------------------------------------------|
| `actor/define`          | → AM      | Register an actor type blueprint                       |
| `actor/spawn`           | → AM      | Create a new instance → `ActorSpawnOutput`             |
| `actor/despawn`         | → AM      | Remove a live instance                                 |
| `actor/state:set`       | → AM      | Write one state key                                    |
| `actor/state:patch`     | → AM      | Write multiple state keys atomically                   |
| `actor/state:get`       | → AM      | Read a deep-cloned snapshot → `ActorStateGetOutput`    |
| `actor/list`            | → AM      | List all live instances → `ActorListOutput`            |
| `actor/trigger`         | → AM      | Manually fire a named trigger on an instance           |
| `actor/spawned`         | AM →      | Emitted after spawn + spawned triggers are fired       |
| `actor/despawned`       | AM →      | Emitted after an instance is removed                   |
| `actor/script:started`  | AM →      | A trigger caused a script to start                     |
| `actor/script:ended`    | AM →      | A trigger-started script ended                         |
| `actor/state:changed`   | AM →      | A single state key was written via `actor/state:set`   |
| `actor/state:patched`   | AM →      | Multiple state keys written via `actor/state:patch`    |

---

## 19. TypeScript Style

- **Strict mode** is enabled.  All code must pass `tsc --strict` without error.
- Prefer `interface` over `type` for object shapes; use `type` for unions, aliases, and mapped types.
- Use `readonly` for properties that should not change after construction.
- Public API members must have JSDoc comments.
- Avoid `any`; prefer `unknown` and narrow with type guards.
- Access modifiers: `private` for internal state, `readonly` where mutation is not needed.

---

## 20. Coding Style

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

## 21. Lifecycle Summary

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
