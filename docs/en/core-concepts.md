# Core Concepts

This document explains the three core mechanisms of inkshot-engine: **EventBus**, **Plugin System**, and **Event Phases**.  
Understanding these three concepts is fundamental to using this engine.

---

## Table of Contents

1. [EventBus — Unified Communication Channel](#1-eventbus--unified-communication-channel)
   - [Subscribing to Events (on / once)](#11-subscribing-to-events-on--once)
   - [Emitting Events (emit / emitSync)](#12-emitting-events-emit--emitsync)
   - [Output Object](#13-output-object)
   - [Removing Listeners](#14-removing-listeners)
2. [Event Phases](#2-event-phases)
   - [Phase Flow](#21-phase-flow)
   - [Flow Control — break / skipPhase](#22-flow-control--break--skipphase)
   - [Priority — Execution Order within a Phase](#23-priority--execution-order-within-a-phase)
3. [Plugin System](#3-plugin-system)
   - [Plugin Interface](#31-plugin-interface)
   - [Dependencies — Declaration and Init Order](#32-dependencies--declaration-and-init-order)
   - [Plugin Sources (Object / URL)](#33-plugin-sources-object--url)
4. [Core Lifecycle Events](#4-core-lifecycle-events)
5. [Design Principles Summary](#5-design-principles-summary)

---

## 1. EventBus — Unified Communication Channel

All subsystems in inkshot-engine communicate through a **shared `EventBus` (`core.events`)**. There are no direct method calls or cross-plugin `import` references.

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

### 1.1 Subscribing to Events (on / once)

```ts
// Persistent subscription (returns an unsubscribe function)
const unsubscribe = core.events.on(
  'myPlugin',           // namespace — matches the plugin's namespace field
  'audio/play',         // event name to listen for
  (params, output, control) => {
    // params  — incoming parameter object (read-only)
    // output  — writable return value object
    // control — flow control (break / skipPhase)
  }
);

// Unsubscribe
unsubscribe();

// Fire once then auto-unsubscribe
core.events.once('myPlugin', 'audio/play', (params, output) => {
  console.log('fires only once');
});
```

**Listener options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `phase` | `'before' \| 'main' \| 'after'` | `'main'` | Which phase to fire in |
| `priority` | `number` | `0` | Execution priority within a phase (higher = earlier) |

```ts
// Listen at before phase with priority 100
core.events.on('myPlugin', 'save/slot:save', handler, {
  phase: 'before',
  priority: 100,
});
```

### 1.2 Emitting Events (emit / emitSync)

**Async `emit`** (recommended for events that may have async handlers):

```ts
const { output, stopped } = await core.events.emit('audio/play', {
  key: 'bgm',
  loop: true,
  volume: 0.8,
});

// output   — return values written by handlers
// stopped  — whether the event was stopped by control.break()
```

**Sync `emitSync`** (all handlers must not return a Promise):

```ts
const { output } = core.events.emitSync<{ instanceId: string }>('audio/play', {
  key: 'sfx-hit',
});
console.log(output.instanceId);
```

> **Convention:** Use `await emit()` when you need to wait for a result; use `emitSync()` for reading cache or triggering synchronous state changes.

### 1.3 Output Object

The `output` object allows handlers to return data to the caller, avoiding global state:

```ts
// Inside a plugin handler (writing to output)
core.events.on('myPlugin', 'entity/count:get', (_params, output: { count: number }) => {
  output.count = this._entities.size;
});

// At the call site (reading output)
const { output } = core.events.emitSync<{ count: number }>('entity/count:get', {});
console.log(output.count); // 42
```

Multiple handlers can write to different `output` fields; the last value written wins.

### 1.4 Removing Listeners

```ts
// Remove a single listener
const unsub = core.events.on('myPlugin', 'some/event', handler);
unsub();

// Remove all listeners in a namespace
// (typically done in plugin.destroy())
core.events.removeNamespace('myPlugin');
```

---

## 2. Event Phases

Each `emit()` fires **three phases** in sequence, using the same base event name:

```
<namespace>/<event>-before  →  <namespace>/<event>  →  <namespace>/<event>-after
        (before)                      (main)                    (after)
```

### 2.1 Phase Flow

| Phase | Purpose |
|-------|---------|
| `before` | Pre-validation, preprocessing, or cancelling subsequent phases |
| `main` | Primary logic processing |
| `after` | Post-processing, notifying other systems, cleanup |

**Example — Save flow:**

```ts
// before phase: environment plugin reads raw data from localStorage
core.events.on('localStorage', 'save/slot:load', (params, output) => {
  const raw = localStorage.getItem(`save:${params.id}`);
  if (raw) output.raw = JSON.parse(raw); // SaveManager uses this in main phase
}, { phase: 'before' });

// main phase: SaveManager (built-in) parses output.raw and restores the save

// after phase: game logic restores the scene after loading
core.events.on('myGame', 'save/slot:load', async ({ id }) => {
  const slot = core.events.emitSync('save/slot:get', { id }).output.slot;
  await core.events.emit('scene/load', { key: slot.data.currentScene });
}, { phase: 'after' });
```

### 2.2 Flow Control — break / skipPhase

Use the `control` parameter in any handler to control execution flow:

```ts
core.events.on('myPlugin', 'battle/start-before', (params, output, control) => {
  if (!params.combatants || params.combatants.length < 2) {
    output.error = 'At least 2 combatants required';
    control.break(); // Stops all subsequent phases (main and after won't run)
  }
});

core.events.on('myPlugin', 'battle/start-before', (params, output, control) => {
  if (isAlreadyInBattle()) {
    control.skipPhase(); // Skip remaining handlers in this phase; main/after still run
  }
});
```

| Method | Effect |
|--------|--------|
| `control.break()` | Stops all subsequent phases (before → stops; main and after don't run) |
| `control.skipPhase()` | Skips remaining handlers in this phase; the next phase still runs normally |

### 2.3 Priority — Execution Order within a Phase

Higher priority numbers execute **first** (default is `0`):

```ts
// Validation logic needs to run first (priority: 100)
core.events.on('validation', 'inventory/item:use-before', handler, {
  phase: 'before',
  priority: 100,
});

// Normal logic runs after (priority: 0, default)
core.events.on('myGame', 'inventory/item:use-before', anotherHandler, {
  phase: 'before',
});
```

> **Convention:** Framework-level uses ±1000; business logic uses ±10–±100; general use stays at default 0.

---

## 3. Plugin System

### 3.1 Plugin Interface

Each plugin must implement the `EnginePlugin` interface:

```ts
interface EnginePlugin {
  readonly namespace: string;               // Unique identifier, e.g. 'audio', 'myGame/combat'
  readonly dependencies?: readonly string[]; // List of namespaces that must be initialized first
  init(core: Core): void | Promise<void>;   // Initialize (register listeners, load assets, etc.)
  destroy?(core: Core): void | Promise<void>; // Destroy (release non-event resources)
}
```

**Plugin behavior rules:**

1. **All event listeners are registered in `init()`**, using the plugin's own `namespace`
2. **Only communicate with other plugins via EventBus** — no direct imports or method calls
3. **Release non-event resources in `destroy()`** — WebGL objects, Web Workers, timers, etc.  
   (EventBus listeners are auto-cleared by `core.events.removeNamespace()`)
4. **Declare a unique `namespace`** — must match the event prefix exactly

### 3.2 Dependencies — Declaration and Init Order

`createEngine` uses **topological sorting** to ensure correct initialization order, regardless of the order in the `plugins` array:

```ts
class PlayerController implements EnginePlugin {
  readonly namespace = 'playerController';

  // Declare dependencies: entity and physics must be initialized first
  readonly dependencies = ['entity', 'physics'] as const;

  init(core: Core) {
    // EntityManager and PhysicsAdapter are ready at this point
    core.events.on(this.namespace, 'core/tick', () => {
      // Use entity/* and physics/* events safely
    });
  }
}

// Order in the array doesn't matter; engine auto-sorts by dependency
await createEngine({
  plugins: [
    new PlayerController(),   // Listed first, but initialized after entity and physics
    new EntityManager(),
    new KinematicPhysicsAdapter(),
  ],
});
```

**Dependency error handling:**

| Situation | Result |
|-----------|--------|
| Depended-on namespace not in `plugins` | `createEngine` throws immediately |
| Circular dependency (A → B → A) | `createEngine` throws immediately |
| Duplicate `namespace` values | `createEngine` throws immediately |

**Destruction order**: `destroy()` is called in **reverse initialization order**, ensuring correct resource cleanup.

### 3.3 Plugin Sources (Object / URL)

Plugins can be objects (class instances) or URL strings (dynamic import):

```ts
await createEngine({
  plugins: [
    new ResourceManager(),                         // Object form (recommended)
    'https://cdn.example.com/my-plugin.js',        // URL form (dynamic loading)
  ],
});
```

URL-form modules must set their `default export` to an `EnginePlugin` instance.

---

## 4. Core Lifecycle Events

These events are fired automatically by the engine — no manual emit required:

| Event | When | Payload |
|-------|------|---------|
| `core/init` | After all plugin `init()` calls complete | `{}` |
| `core/start` | After the game loop starts | `{}` |
| `core/tick` | Every frame | `{ delta: number, elapsed: number }` |
| `core/pause` | When `core.pause()` is called | `{}` |
| `core/resume` | When `core.resume()` is called | `{}` |
| `core/destroy` | After `core.destroy()` is called, before plugin teardown | `{}` |

```ts
core.events.on('myPlugin', 'core/tick', ({ delta, elapsed }) => {
  // delta   — time since last frame (Pixi Ticker units, ~1 at 60fps)
  // elapsed — milliseconds since game start
  update(delta);
});
```

---

## 5. Design Principles Summary

| Principle | Description |
|-----------|-------------|
| **EventBus is the only communication channel** | Plugins don't directly import or call each other |
| **Plugin isolation** | Each plugin has its own `namespace` and can be unloaded at any time |
| **Testability** | Any system can be tested in isolation with a minimal EventBus, no full engine needed |
| **Extensibility** | Third-party plugins can intercept, enhance, or cancel any built-in event |
| **Data-oriented** | Game state is represented as plain data objects, read and written via events |

---

## Further Reading

- [Custom Plugin Development](./plugin-development.md) — Writing a plugin from scratch
- [Architecture](../../ARCHITECTURE.md) — Full design philosophy and style guide
- [Full API Reference](../../README.md) — Event contracts for all built-in plugins
