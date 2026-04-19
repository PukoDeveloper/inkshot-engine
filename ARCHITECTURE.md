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

## 6. File & Module Conventions

| Path | Purpose |
|---|---|
| `src/core/` | Engine core (`Core`, `EventBus`, built-in plugins) |
| `src/rendering/` | Renderer wrapper and layer definitions |
| `src/types/` | Shared TypeScript interfaces and type aliases |
| `src/createEngine.ts` | Public factory function |
| `src/index.ts` | Public package entry point — only re-exports |

Notable built-in plugins in `src/core/`:

| File | Namespace | Description |
|---|---|---|
| `SaveManager.ts` | `save` | In-memory save slots and global save data |
| `GameStateManager.ts` | `game` | High-level game phase state machine |
| `InputManager.ts` | `input` | Keyboard and pointer input |
| `ResourceManager.ts` | `assets` | Multi-mode asset loading with cache-first guarantee |

Rules:

- `src/index.ts` **only re-exports**.  It must not contain logic.
- Internal modules import from relative paths with the `.js` extension (required for ESM).
- **No circular imports.**  The dependency graph flows: `types` ← `core` ← `rendering` ← `createEngine` ← `index`.

---

## 7. TypeScript Style

- **Strict mode** is enabled.  All code must pass `tsc --strict` without error.
- Prefer `interface` over `type` for object shapes; use `type` for unions, aliases, and mapped types.
- Use `readonly` for properties that should not change after construction.
- Public API members must have JSDoc comments.
- Avoid `any`; prefer `unknown` and narrow with type guards.
- Access modifiers: `private` for internal state, `readonly` where mutation is not needed.

---

## 8. Coding Style

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

## 9. Lifecycle Summary

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
