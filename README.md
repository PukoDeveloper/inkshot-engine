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
   - [TimerManager (`timer`)](#timermanager-timer)
   - [SaveManager (`save`)](#savemanager-save)
   - [GameStateManager (`game`)](#gamestatemanager-game)
   - [SceneManager (`scene`)](#scenemanager-scene)
   - [CollisionManager (`collision`)](#collisionmanager-collision)
   - [TweenManager (`tween`)](#tweenmanager-tween)
   - [ParticleManager (`particle`)](#particlemanager-particle)
   - [AudioManager (`audio`)](#audiomanager-audio)
   - [PathfindingManager (`pathfinding`)](#pathfindingmanager-pathfinding)
5. [Script System (ScriptManager)](#script-system-scriptmanager)
6. [Actor System (ActorManager)](#actor-system-actormanager)
7. [Renderer & Layers](#renderer--layers)
8. [Writing Your Own Plugin](#writing-your-own-plugin)
9. [Engine Lifecycle](#engine-lifecycle)
10. [TypeScript Tips](#typescript-tips)

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

Captures keyboard, pointer, and gamepad events from the browser and re-emits them on the bus.  Pointer-move events are throttled to **one per frame** to avoid flooding the bus.  Gamepad state is polled once per `core/tick`; axes are snapshotted into a per-frame cache for consistent reads.

#### Event Contract — Keyboard & Pointer

| Event | Direction | Description |
|-------|-----------|-------------|
| `input/key:down` | — emitted | Key transitions from released → pressed (auto-repeat suppressed) |
| `input/key:up` | — emitted | Key transitions from pressed → released |
| `input/pointer:down` | — emitted | Pointer button pressed |
| `input/pointer:up` | — emitted | Pointer button released |
| `input/pointer:move` | — emitted | Pointer moved (throttled, once per frame) |
| `input/key:pressed` | ✗ `emitSync` | Query whether a key is currently held |
| `input/pointer:state` | ✗ `emitSync` | Query current pointer position and pressed buttons |
| `input/action:bind` | ✗ `emitSync` | Map a logical action to one or more key codes; re-registering replaces the existing binding |
| `input/action:triggered` | — emitted | Fired when a bound action key or button changes state |

#### Event Contract — Gamepad

| Event | Direction | Description |
|-------|-----------|-------------|
| `input/gamepad:button:down` | — emitted | A gamepad button transitions released → pressed |
| `input/gamepad:button:up` | — emitted | A gamepad button transitions pressed → released |
| `input/gamepad:axes` | — emitted | Per-frame raw analog axes (any axis > 0.05 deadzone) |
| `input/gamepad:axis:bind` | ✗ `emitSync` | Map an analog axis to a logical action; re-registering the same tuple replaces the existing binding |
| `input/gamepad:vibrate` | ✗ `emitSync` | Trigger haptic feedback on a connected gamepad |
| `input/gamepad:connected` | — emitted | A gamepad was connected (browser `gamepadconnected` DOM event) |
| `input/gamepad:disconnected` | — emitted | A gamepad was disconnected (browser `gamepaddisconnected` DOM event) |

#### Usage

```ts
import { createEngine, InputManager } from 'inkshot-engine';

const inputManager = new InputManager();
const { core } = await createEngine({
  plugins: [inputManager],
});

// Bind logical actions (keyboard + gamepad together)
core.events.emitSync('input/action:bind', {
  action: 'jump',
  codes: ['Space', 'ArrowUp', 'Gamepad:0:0'],  // keyboard or gamepad button 0
});

// React to actions (decoupled from physical keys)
core.events.on('myGame', 'input/action:triggered', ({ action, state }) => {
  if (action === 'jump' && state === 'pressed') player.jump();
});

// Pull-query for polling-style game logic
core.events.on('myGame', 'core/tick', () => {
  const { output } = core.events.emitSync('input/key:pressed', { code: 'KeyW' });
  if (output.pressed) player.moveForward();

  // Read cached gamepad axes (snapshotted this frame)
  const axes = inputManager.getGamepadAxes(0);
  if (axes[0] > 0.5) player.moveRight();
});

// Bind a gamepad analog axis to a logical action
core.events.emitSync('input/gamepad:axis:bind', {
  action: 'move-right',
  axisIndex: 0,
  direction: 'positive',
  threshold: 0.5,
});

// React to connect / disconnect
core.events.on('myGame', 'input/gamepad:connected', ({ gamepadIndex, id }) => {
  console.log(`Gamepad ${gamepadIndex} connected: ${id}`);
});
```

---

### TimerManager (`timer`)

Provides **one-shot timers**, **repeating intervals**, and **cooldown tracking**, all driven by `core/tick`.  Timers automatically pause and resume with the game loop (`core/pause` / `core/resume`).

A **burst safety cap** (10 fires per tick) prevents a flood of callbacks when the browser tab resumes after being backgrounded with a large accumulated `dt`.

#### Event Contract

| Event | Direction | Description |
|-------|-----------|-------------|
| `timer/once` | ✗ `emitSync` | Fire once after `delay` ms; re-registering the same `id` resets it |
| `timer/interval` | ✗ `emitSync` | Fire every `interval` ms; optionally stop after `repeat` fires |
| `timer/cancel` | ✗ `emitSync` | Cancel a specific timer or cooldown by `id`; emits `timer/cancelled` |
| `timer/cancel-all` | ✗ `emitSync` | Cancel every active timer and cooldown at once; returns `output.cancelledCount` |
| `timer/cooldown` | ✗ `emitSync` | Start/reset a cooldown, or query its readiness; returns `output.ready` |
| `timer/fired` | — emitted | A once or interval timer fired; carries `{ id, count }` |
| `timer/cancelled` | — emitted | A timer/cooldown was explicitly cancelled |

#### Direct Accessor API (pull, no EventBus needed)

When you hold a reference to the `TimerManager` instance you can query state synchronously without going through the bus:

| Method | Returns |
|--------|---------|
| `isTimerActive(id)` | `true` while a once/interval timer is still waiting to fire |
| `getTimeRemaining(id)` | Milliseconds until the next fire (`0` if not active) |
| `getCooldownProgress(id)` | Completion ratio `0`–`1` (`1` when ready / unknown) |

#### Usage

```ts
import { createEngine, TimerManager } from 'inkshot-engine';

const timerManager = new TimerManager();
const { core } = await createEngine({
  plugins: [timerManager],
});

// One-shot: fire once after 2 s
core.events.emitSync('timer/once', { id: 'respawn', delay: 2000 });

// Interval: fire every 500 ms, stop after 5 fires
core.events.emitSync('timer/interval', { id: 'tick', interval: 500, repeat: 5 });

// Listen for fires
core.events.on('myGame', 'timer/fired', ({ id, count }) => {
  if (id === 'respawn') spawnPlayer();
});

// Cooldown: 1 s attack cooldown
core.events.emitSync('timer/cooldown', { id: 'attack', duration: 1000 });
const { output } = core.events.emitSync('timer/cooldown', { id: 'attack' });
if (output.ready) performAttack();

// Pull accessors — no EventBus round-trip needed
core.events.on('myGame', 'core/tick', () => {
  ui.setCountdown(Math.ceil(timerManager.getTimeRemaining('respawn') / 1000));
  attackBar.setFill(timerManager.getCooldownProgress('attack'));
});

// Cancel everything on scene transition
core.events.emitSync('timer/cancel-all', {});
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

### CollisionManager (`collision`)

2D collision detection, movement resolution, spatial queries, and raycasting.  Must be registered **after** `EntityManager`.

#### Event Contract

| Event | Async? | Description |
|-------|--------|-------------|
| `collision/collider:add` | ✗ | Attach a shape + layer mask to an entity |
| `collision/collider:remove` | ✗ | Detach a collider from an entity |
| `collision/tilemap:set` | ✗ | Register or replace the active tile map (see format below) |
| `collision/move` | ✗ | Move a `BODY` entity with full collision resolution; returns `{ x, y, blockedX, blockedY }` |
| `collision/query` | ✗ | Return entity IDs whose colliders overlap a given shape + layer mask |
| `collision/raycast` | ✗ | Cast a ray; return the first hit entity or tile |
| `collision/grid:snap` | ✗ | Snap pixel coordinates to the nearest tile-grid corner |
| `collision/grid:worldToTile` | ✗ | Pixel coords → tile `{ col, row }` |
| `collision/grid:tileToWorld` | ✗ | Tile `{ col, row }` → pixel top-left |
| `collision/hit` | — emitted | First-frame hitbox ↔ hurtbox contact: `{ attackerId, victimId }` |
| `collision/overlap` | — emitted | Sensor overlap begin (`entered: true`) or end (`entered: false`) |

#### Collision Layers

```ts
import { CollisionLayer } from 'inkshot-engine';

// Combine layers with bitwise OR
const layer = CollisionLayer.BODY | CollisionLayer.HURTBOX;
```

| Constant | Purpose |
|---|---|
| `BODY` | Physical obstacle — blocked by solid tiles and other bodies |
| `HITBOX` | Deals damage (weapon swing area) |
| `HURTBOX` | Receives damage (character body) |
| `SENSOR` | Overlap detection without physical blocking |

#### Tile Shapes

The `tileShapes` record maps tile values to collision behaviours:

| Shape | Behaviour |
|---|---|
| `'solid'` | Full block on all sides |
| `'empty'` | Explicitly passable |
| `'top-only'` | One-way platform — blocks downward movement only when entity was above tile top |
| `'slope-ne'` ◣ | Floor ramp rising left-to-right |
| `'slope-nw'` ◢ | Floor ramp falling left-to-right |
| `'slope-se'` ◤ | Ceiling ramp descending left-to-right |
| `'slope-sw'` ◥ | Ceiling ramp ascending left-to-right |

Any custom string is supported via `CollisionManagerOptions.customShapeResolvers`.

#### Usage

```ts
import { createEngine, EntityManager, CollisionManager, CollisionLayer } from 'inkshot-engine';
import type { TileShapeResolver } from 'inkshot-engine';

// Optional: add custom tile shapes
const iceResolver: TileShapeResolver = (shape, ctx) => {
  if (shape !== 'ice') return null;
  if (ctx.axis === 'y' && ctx.dy > 0) {
    return { blocked: true, resolved: ctx.tileY - (ctx.entityAABB.bottom - ctx.entityY) };
  }
  return { blocked: false, resolved: ctx.entityY };
};

const { core } = await createEngine({
  plugins: [
    new EntityManager(),
    new CollisionManager({ customShapeResolvers: [iceResolver] }),
  ],
});

// Register a tilemap
core.events.emitSync('collision/tilemap:set', {
  tileSize: 16,
  layers: myTileGrid,           // number[][]  (row-major)
  tileShapes: {
    1: 'solid',
    2: 'top-only',
    3: 'slope-ne',
    4: 'ice',
  },
});

// Attach a BODY + HURTBOX collider to the player entity
core.events.emitSync('collision/collider:add', {
  entityId: player.id,
  shape: { type: 'rect', width: 14, height: 20, offsetX: -7, offsetY: -10 },
  layer: CollisionLayer.BODY | CollisionLayer.HURTBOX,
});

// Move with full collision resolution each fixed update
core.events.on('myGame', 'core/update', ({ dt }) => {
  const { output: move } = core.events.emitSync('collision/move', {
    entityId: player.id,
    dx: velocityX * dt,
    dy: velocityY * dt,
  });
  if (move.blockedY && velocityY > 0) velocityY = 0; // landed
  if (move.blockedX) velocityX = 0;                  // hit a wall
});

// Hitscan attack
const { output: ray } = core.events.emitSync('collision/raycast', {
  origin: player.position,
  direction: { x: 1, y: 0 },
  maxDistance: 200,
  layerMask: CollisionLayer.HURTBOX,
});
if (ray.hit && ray.entityId) applyDamage(ray.entityId, 25);

// Combat callbacks
core.events.on('combat', 'collision/hit', ({ attackerId, victimId }) => {
  applyDamage(victimId, 10);
});
core.events.on('triggers', 'collision/overlap', ({ entityAId, entityBId, entered }) => {
  if (entered) openDoor(entityAId, entityBId);
});
```

---

### TweenManager (`tween`)

Drives property-based animations (tweens) and sequenced animation timelines, all tied to the engine's `core/tick` event.

#### Easing functions

Over 20 easing functions are available via the `Easing` object:

```ts
import { Easing } from 'inkshot-engine';
// linear, easeInQuad, easeOutQuad, easeInOutQuad,
// easeInCubic, easeOutCubic, easeInOutCubic,
// easeInQuart, easeOutQuart, easeInOutQuart,
// easeInSine, easeOutSine, easeInOutSine,
// easeInExpo, easeOutExpo,
// easeInBack, easeOutBack,
// easeInElastic, easeOutElastic,
// easeInBounce, easeOutBounce
```

Or supply your own: `ease: (t) => t * t`.

#### Direct API — `Tween`

```ts
import { createEngine, TweenManager, Tween, Easing } from 'inkshot-engine';

const { core } = await createEngine({ plugins: [new TweenManager()] });

const sprite = { x: 0, y: 0, alpha: 1 };

// Basic one-shot tween
const tween = new Tween(sprite, { x: 400, alpha: 0 }, {
  duration: 600,
  ease: Easing.easeOutQuad,
  delay: 200,           // ms before the animation begins
  onStart:    ()  => console.log('started'),
  onUpdate:   (t) => console.log('progress', t),
  onComplete: ()  => console.log('done'),
});
tweenManager.add(tween);

// Repeat N times (repeat: 2 = play 3× total)
const bouncer = new Tween(sprite, { y: -50 }, {
  duration: 300,
  repeat: 2,
  repeatDelay: 100,   // ms gap between each repeat
  yoyo: true,         // reverse on alternate passes
});
tweenManager.add(bouncer);

// Infinite loop
const pulsate = new Tween(sprite, { alpha: 0 }, {
  duration: 800,
  loop: true,
  yoyo: true,
});
tweenManager.add(pulsate);

// Control
tween.pause();
tween.resume();
tween.kill();          // stop and leave properties at current values
tween.reset();         // rewind to beginning, replay from scratch

// Scrubbing
tween.seek(300);              // jump to 300 ms within the current pass
tween.seekProgress(0.5);      // jump to 50 %
console.log(tween.progress);  // current progress [0, 1]
```

#### Direct API — `Timeline`

A `Timeline` sequences and groups multiple tweens on a shared time axis.

```ts
import { Timeline, Easing } from 'inkshot-engine';

const tl = new Timeline({
  onComplete: () => console.log('sequence done'),
  repeat: 1,        // play 2× total
  repeatDelay: 500, // 500 ms between cycles
});

tl
  // animate x from current value to 400 over 500 ms
  .to(sprite, { x: 400 }, { duration: 500, ease: Easing.easeOutQuad })
  // immediately after: animate y
  .to(sprite, { y: 200 }, { duration: 300 })
  // in parallel with the y tween (same start time)
  .to(other,  { alpha: 0 }, { duration: 300, at: '<' })
  // fire a callback at the 400 ms mark (absolute)
  .call(() => console.log('at 400 ms'), { at: 400 })
  // insert 200 ms of silence after the last tween
  .delay(200)
  // animate from explicit start → end values
  .fromTo(sprite, { x: 0 }, { x: 800 }, { duration: 400 });

tweenManager.add(tl);

// Control
tl.pause();
tl.resume();
tl.kill();
tl.reset();                  // rewind and replay from beginning

// Scrubbing
tl.seek(350);                // jump playhead to 350 ms
tl.seekProgress(0.75);       // jump to 75 %
console.log(tl.progress);    // current progress within cycle [0, 1]
console.log(tl.elapsed);     // raw playhead in ms
console.log(tl.duration);    // total timeline duration in ms

// Playback speed
tl.playbackRate = 2;         // run at double speed
tl.playbackRate = 0.5;       // slow motion
```

##### Timeline entry positioning (`at`)

| `at` value | Meaning |
|------------|---------|
| _(omitted)_ | Immediately after the previous entry ends (default) |
| `number` | Absolute time in milliseconds |
| `'<'` | Same start time as the previous entry (parallel) |
| `'+=N'` | Cursor + `N` ms (gap) |
| `'-=N'` | Cursor − `N` ms (overlap) |

##### Builder methods

| Method | Description |
|--------|-------------|
| `.to(target, props, options)` | Animate properties to their destination from the target's live values |
| `.from(target, fromProps, options)` | Animate from given values to the target's current values |
| `.fromTo(target, fromProps, toProps, options)` | Explicit start and end values |
| `.set(target, props, options)` | Instantly set properties (zero-duration snap) |
| `.call(fn, options)` | Fire a callback at a specific time |
| `.delay(ms)` | Advance the cursor without adding an entry |

#### EventBus API

```ts
// Create a tween via the bus
const { output } = core.events.emitSync('tween/to', {
  target: sprite,
  props: { x: 400, alpha: 0 },
  duration: 600,
  ease: 'easeOutQuad',   // string key of any Easing function
  delay: 100,
  loop: false,
  yoyo: false,
  repeat: 2,
  repeatDelay: 100,
  id: 'entrance',        // optional stable ID for later cancellation
});
console.log(output.id);  // 'entrance'

// Kill by ID
core.events.emitSync('tween/kill', { id: 'entrance' });

// Kill all tweens on a specific target
core.events.emitSync('tween/kill', { target: sprite });

// Kill everything
core.events.emitSync('tween/kill', { all: true });
```

#### EventBus Contract

| Event | Direction | Description |
|-------|-----------|-------------|
| `tween/to` | ✗ `emitSync` | Create and start a tween; returns `{ id }` |
| `tween/kill` | ✗ `emitSync` | Stop one or more tweens by ID, target, or all |
| `tween/finished` | — emitted | Fired when a tween or timeline completes naturally (not killed); payload: `{ id?, target? }` |

#### Listening for completion

```ts
// React when any tween finishes
core.events.on('myGame', 'tween/finished', ({ id, target }) => {
  console.log(`Tween "${id}" finished on`, target);
});

// Or use the onComplete callback (Tween / Timeline constructor)
const tween = new Tween(sprite, { alpha: 0 }, {
  duration: 400,
  onComplete: () => sprite.visible = false,
});
```

---

### ParticleManager (`particle`)

Drives a 2D particle simulation: burst explosions, continuous fire/smoke trails, VFX effects, and anything else that needs many short-lived display objects.  Integrates with `ObjectPool` to avoid garbage-collection pressure.

#### `ParticleConfig` fields

| Field | Default | Description |
|---|---|---|
| `x`, `y` | — | Emitter world-space origin |
| `speed` | — | Initial particle speed in px/s |
| `speedVariance` | `0` | Random ± applied to `speed` |
| `angle` | `0` | Launch direction in degrees (0 = right, 90 = down) |
| `spread` | `0` | Half-spread in degrees — each particle picks a direction in `[angle−spread, angle+spread]` |
| `lifetime` | — | Particle lifetime in ms |
| `lifetimeVariance` | `0` | Random ± applied to `lifetime` |
| `burst` | `false` | If `true`, emit `burstCount` particles immediately then stop |
| `burstCount` | `10` | Particles to emit in a burst |
| `rate` | `20` | Particles per second in continuous mode |
| `duration` | `undefined` | Max continuous emission time in ms (`undefined` = forever) |
| `repeatBurst` | `false` | Re-emit a new burst after all particles from the previous one expire |
| `repeatInterval` | `1000` | Wait time between burst repeats in ms |
| `gravity` | `0` | Downward acceleration in px/s² |
| `gravityVariance` | `0` | Random ± applied to per-particle gravity |
| `wind` | `0` | Rightward acceleration in px/s² |
| `windVariance` | `0` | Random ± applied to per-particle wind |
| `startRotation` | `0` | Initial particle rotation in degrees |
| `rotationVariance` | `0` | Random ± applied to `startRotation` |
| `angularVelocity` | `0` | Rotation speed in degrees/s |
| `angularVelocityVariance` | `0` | Random ± applied to `angularVelocity` |
| `spawnShape` | `'point'` | Spawn area: `'point'` / `'rect'` / `'circle'` |
| `spawnWidth`, `spawnHeight` | — | Rect spawn dimensions |
| `spawnRadius` | — | Circle spawn radius |
| `startAlpha` | `1` | Alpha at birth |
| `endAlpha` | `0` | Alpha at death |
| `startScale` | `1` | Scale at birth |
| `endScale` | `0` | Scale at death |
| `startColor` | `0xffffff` | Tint at birth |
| `endColor` | `startColor` | Tint at death (no change if omitted) |
| `radius` | `4` | Display circle radius in pixels |
| `texture` | — | `ResourceManager` key — uses a `Sprite` instead of a `Graphics` circle |
| `preWarm` | `0` | Milliseconds to simulate immediately on emitter creation |

#### Event Contract

| Event | Direction | Description |
|-------|-----------|-------------|
| `particle/emit` | ✗ `emitSync` | Create and start an emitter; returns `{ id }` |
| `particle/stop` | ✗ `emitSync` | Stop spawning new particles (live particles continue) |
| `particle/clear` | ✗ `emitSync` | Immediately destroy particles; omit `id` to clear all emitters |
| `particle/move` | ✗ `emitSync` | Relocate an emitter's spawn origin (live particles unaffected) |
| `particle/pause` | ✗ `emitSync` | Freeze one or all emitters; omit `id` to pause all |
| `particle/resume` | ✗ `emitSync` | Unfreeze one or all paused emitters |
| `particle/update` | ✗ `emitSync` | Merge a partial config into a running emitter; affects newly spawned particles only |
| `particle/count` | ✗ `emitSync` | Query `{ emitterCount, particleCount }` |
| `particle/complete` | — emitted | Fired when a burst or continuous+duration emitter ends naturally (not on forced clear) |

#### Usage

```ts
import { createEngine, ParticleManager } from 'inkshot-engine';

const { core } = await createEngine({
  plugins: [new ParticleManager()],
});

// ① One-shot burst explosion
const id = core.events.emitSync('particle/emit', {
  config: {
    x: 400, y: 300,
    burst: true, burstCount: 30,
    speed: 150, speedVariance: 50,
    angle: 270, spread: 180,   // all directions
    gravity: 400,
    lifetime: 800, lifetimeVariance: 200,
    startColor: 0xff8800, endColor: 0xff0000,
    startAlpha: 1, endAlpha: 0,
    startScale: 1, endScale: 0.2,
    spawnShape: 'circle', spawnRadius: 10,
  },
}).output.id;

// ② Continuous fire trail following a character
const fireId = core.events.emitSync('particle/emit', {
  config: {
    x: hero.x, y: hero.y,
    rate: 60,
    speed: 20, spread: 20, angle: 270,
    gravity: -200,           // particles rise
    lifetime: 500,
    startColor: 0xffff00, endColor: 0xff4400,
    startAlpha: 0.9, endAlpha: 0,
    texture: 'spark',        // use a Sprite texture
  },
}).output.id;

// Update emitter position each tick to follow the hero
core.events.on('myGame', 'core/update', () => {
  core.events.emitSync('particle/move', { id: fireId, x: hero.x, y: hero.y });
});

// ③ Repeating burst (e.g. muzzle flash, looping campfire sparks)
core.events.emitSync('particle/emit', {
  config: {
    x: 200, y: 200,
    burst: true, burstCount: 10, lifetime: 300,
    repeatBurst: true, repeatInterval: 500,
    speed: 60, spread: 45,
    startColor: 0xffffff, endColor: 0xffffff,
    preWarm: 500,            // appear mid-stream immediately
  },
});

// ④ Pause / resume
core.events.emitSync('particle/pause', {});   // pause all
core.events.emitSync('particle/resume', {});  // resume all

// ⑤ Hot-update the emission rate
core.events.emitSync('particle/update', { id: fireId, config: { rate: 120 } });

// ⑥ Query live counts
const { output } = core.events.emitSync('particle/count', {});
console.log(output.emitterCount, output.particleCount);

// ⑦ React to natural completion
core.events.on('vfx', 'particle/complete', ({ id }) => {
  console.log(`Emitter ${id} finished`);
});

// ⑧ Force-clear (no particle/complete fires)
core.events.emitSync('particle/clear', { id: fireId });
```

#### Custom display factory

Pass `createDisplay` to swap out Pixi.js for any display back-end (useful in tests):

```ts
const pm = new ParticleManager({
  poolSize: 512,
  createDisplay: () => ({
    x: 0, y: 0, alpha: 1,
    scale: { x: 1, y: 1 },
    rotation: 0, tint: 0xffffff,
  }),
});
```

---

### AudioManager (`audio`)

Provides audio playback via the browser-native **Web Audio API** — no external audio library required.  An `AudioContext` is created lazily on the first `audio/load` or `audio/play` call, satisfying browser autoplay policies.

#### Pause / Resume

`AudioBufferSourceNode` cannot be paused natively.  Pausing is simulated by recording the playback offset, stopping the source, and creating a fresh node on resume.  When a spatial instance is resumed, the new source node is rewired through the existing `PannerNode` so that all distance attenuation and stereo panning settings are fully preserved.

#### Event Contract

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
| `audio/source:move`     | ✗ sync | Reposition a spatial audio source at runtime |

#### Usage

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

// ② Pause / resume (spatial chain is preserved on resume)
core.events.emitSync('audio/pause',  { instanceId: 'bgm' });
core.events.emitSync('audio/resume', { instanceId: 'bgm' });

// ③ Fade out and stop over 2 seconds
core.events.emitSync('audio/fade-stop', { instanceId: 'bgm', duration: 2 });

// ④ Duck BGM category volume during dialogue
core.events.emitSync('audio/volume', { category: 'bgm', volume: 0.2, duration: 0.5 });

// ⑤ Play a one-shot SFX
core.events.emitSync('audio/play', { key: 'sfx:hit', volume: 1.0 });

// ⑥ Query state
const { output: s } = core.events.emitSync('audio/state', { instanceId: 'bgm' });
console.log(s.state, s.currentTime); // "playing", 4.23

// ⑦ List all active instances
const { output: list } = core.events.emitSync('audio/list', {});
console.log(list.instances.map(i => i.instanceId));
```

#### Spatial Audio

Pass a `position` to `audio/play` to create a positional sound source routed through a `PannerNode`.  Pair it with `audio/listener:update` (driven by the camera) for automatic distance attenuation and stereo panning:

```ts
// Play a looping ambient sound at a world-space position
core.events.emitSync('audio/play', {
  key: 'sfx:waterfall',
  loop: true,
  instanceId: 'waterfall',
  position:     { x: 320, y: 240 },
  maxDistance:  400,
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

// Reposition a moving source at runtime (e.g. a walking NPC)
core.events.on('myGame', 'core/update', () => {
  core.events.emitSync('audio/source:move', {
    instanceId: 'waterfall',
    x: npc.x,
    y: npc.y,
  });
});
```

> **Note**: `audio/source:move` emits a `console.warn` in development if `instanceId` is valid but the instance was not created with `position` (i.e. has no `PannerNode`), making misconfigured spatial calls immediately visible.

---

### PathfindingManager (`pathfinding`)

A* pathfinding on top of the collision tile map.  The cost grid is rebuilt automatically whenever `collision/tilemap:set` fires (full reload) or `tilemap/set-tile` fires (single-cell O(1) update).  A 512-entry LRU cache avoids recomputing the same path on consecutive frames.

Must be registered **after** `CollisionManager` and `EntityManager`.

#### Event Contract

| Event                     | Async? | Description |
|---------------------------|--------|-------------|
| `pathfinding/find`        | ✗ sync | Run A* from `from` to `to` (world pixels); returns `path[]`, `cost`, optional `nearest` |
| `pathfinding/weight:set`  | ✗ sync | Override movement cost for a specific tile value |
| `pathfinding/cache:clear` | ✗ sync | Manually invalidate the path cache |

#### `pathfinding/find` parameters

| Parameter                 | Type       | Default    | Description |
|---------------------------|------------|------------|-------------|
| `from`                    | `{x,y}`    | —          | Start position in world pixels |
| `to`                      | `{x,y}`    | —          | Goal position in world pixels |
| `includeDynamicObstacles` | `boolean`  | `false`    | Treat entity tile positions as dynamic obstacles (results not cached) |
| `tagFilter`               | `string[]` | —          | With `includeDynamicObstacles`: only entities carrying **all** of these tags block the path |
| `fallbackToNearest`       | `boolean`  | `false`    | When the goal tile is impassable, BFS outward to the nearest passable cell; actual target returned in `output.nearest` |
| `smoothPath`              | `boolean`  | `false`    | Apply string-pulling (line-of-sight) to remove staircase waypoints from diagonal paths |
| `maxIterations`           | `number`   | `10 000`   | Abort A* after this many iterations |

#### Usage

```ts
import { createEngine, PathfindingManager } from 'inkshot-engine';
import { EntityManager, CollisionManager, TilemapManager } from 'inkshot-engine';
import type { PathfindingFindParams, PathfindingFindOutput } from 'inkshot-engine';

const { core } = await createEngine({
  plugins: [
    new EntityManager(),
    new CollisionManager(),
    new TilemapManager(),
    new PathfindingManager(),           // 4-dir: new PathfindingManager({ directions: 4 })
  ],
});

// ① Basic path request (after tilemap is loaded)
const { output } = core.events.emitSync<PathfindingFindParams, PathfindingFindOutput>(
  'pathfinding/find',
  { from: player.position, to: target.position },
);
if (output.found) followPath(output.path);

// ② Avoid entities tagged 'obstacle' as dynamic obstacles
const { output: dyn } = core.events.emitSync('pathfinding/find', {
  from: npc.position,
  to:   goal.position,
  includeDynamicObstacles: true,
  tagFilter: ['obstacle'],   // decorative sprites / HUD anchors are ignored
});

// ③ Clicking on an impassable tile → nearest reachable cell
const { output: near } = core.events.emitSync('pathfinding/find', {
  from: player.position,
  to:   clickPosition,
  fallbackToNearest: true,
});
if (near.found) {
  if (near.nearest) console.log('Redirected to:', near.nearest);
  followPath(near.path);
}

// ④ Smooth diagonal paths (removes staircase waypoints)
const { output: smooth } = core.events.emitSync('pathfinding/find', {
  from: player.position,
  to:   target.position,
  smoothPath: true,
});

// ⑤ Weighted terrain (mud = 2× cost, lava = impassable)
core.events.emitSync('pathfinding/weight:set', { tileId: 3, cost: 2 });
core.events.emitSync('pathfinding/weight:set', { tileId: 4, cost: Infinity });

// ⑥ Manual cache invalidation (e.g. after a script-driven layout change)
core.events.emitSync('pathfinding/cache:clear', {});
```

---

### UIManager (`ui`)

A flexible, event-driven UI widget system.  Widgets live on the `ui` render layer and are identified by a string id.  Nine widget types are built in; custom types can be registered at any time.

#### Built-in Widget Types

| Type          | Description                                                                         |
|---------------|-------------------------------------------------------------------------------------|
| `label`       | Text display (supports i18n auto-update)                                            |
| `button`      | Clickable button with hover / press highlight and optional i18n label               |
| `panel`       | Styled rounded-rect background container                                            |
| `progressbar` | Horizontal / vertical fill bar (0–1 value)                                          |
| `slider`      | Draggable range input with pointer events                                           |
| `scrollview`  | Masked scrollable content area                                                      |
| `dialog`      | Modal dialog with title, message, confirm and cancel buttons                        |
| `stack`       | Linear layout container (StackPanel) with configurable direction and spacing        |
| `dialoguebox` | Dialogue box that subscribes to `dialogue/*` events (see [DialogueManager](#dialoguemanager-dialogue)) |

#### Event Contract — Commands

| Event        | Async? | Description |
|--------------|--------|-------------|
| `ui/register` | ✗ sync | Register (or replace) a widget factory; returns `{ registered: boolean }` |
| `ui/create`   | ✗ sync | Create a widget and mount it on the ui layer; returns `{ widget }` |
| `ui/show`     | ✗ sync | Make a widget visible |
| `ui/hide`     | ✗ sync | Hide a widget (keeps it in memory) |
| `ui/destroy`  | ✗ sync | Destroy a widget and remove it from the layer |
| `ui/update`   | ✗ sync | Update properties of an existing widget |
| `ui/get`      | ✗ sync | Retrieve a widget instance by id; returns `{ widget }` |

#### Event Contract — Notifications

| Event          | When |
|----------------|------|
| `ui/created`   | After a widget is created and mounted |
| `ui/shown`     | After a widget is made visible |
| `ui/hidden`    | After a widget is hidden |
| `ui/destroyed` | After a widget is destroyed |

#### Usage

```ts
import { createEngine, UIManager } from 'inkshot-engine';

const { core } = await createEngine({ plugins: [new UIManager()] });

// ① Create a label anchored to the top-right corner
const { output } = core.events.emitSync('ui/create', {
  type: 'label',
  id: 'score',
  text: 'Score: 0',
  anchor: 'top-right',
  x: -16,
  y: 16,
});

// ② Update it later
core.events.emitSync('ui/update', { id: 'score', text: 'Score: 42' });

// ③ Show / hide
core.events.emitSync('ui/hide', { id: 'score' });
core.events.emitSync('ui/show', { id: 'score' });

// ④ Register a custom widget type
core.events.emitSync('ui/register', {
  type: 'myGame/hud',
  factory: (id, props, core) => {
    // build and return a UIWidget object
  },
});

// ⑤ Dialogue box (subscribes to dialogue/* events automatically)
core.events.emitSync('ui/create', {
  type: 'dialoguebox',
  id: 'box',
  width: 600,
  height: 160,
  anchor: 'bottom-center',
  y: -20,
});
```

---

### DialogueManager (`dialogue`)

A pure presentation renderer for a dialogue box.  All flow control (branching, conditions, tree traversal) belongs to the script system, which drives DialogueManager by sending commands.

#### Inline Markup

Text passed to `dialogue/show-text` may contain inline markup tags:

| Tag | Description |
|-----|-------------|
| `[c=#rrggbb]…[/c]` | Colour the enclosed text (shorthand) |
| `[color=#rrggbb]…[/color]` | Colour the enclosed text (long form) |
| `[speed=n]…[/speed]` | Override typewriter speed inside the block (chars/sec) |
| `[pause=n]` | Pause the typewriter for `n` milliseconds (self-closing) |

All tags are stripped from the plain text; the `dialogue/text:tick` event carries both the plain text and a `segments` array of styled runs for the display layer to render.

Example:

```
'She [speed=20]slowly said[/speed][pause=400][c=#ff4444]Danger![/c]'
```

Unknown or malformed tags are silently dropped.  Unclosed block tags are automatically closed at the end of the string.

#### Event Contract — Commands

| Event                   | Description |
|-------------------------|-------------|
| `dialogue/show-text`    | Display a line of text (starts typewriter animation) |
| `dialogue/show-choices` | Display a list of player choices |
| `dialogue/advance`      | Skip typewriter **or** signal "ready for next" to the script |
| `dialogue/choice`       | Confirm a player choice by index |
| `dialogue/end`          | End the current session |
| `dialogue/state:get`    | Query current display state (pull pattern) |

#### `dialogue/show-text` Parameters

| Parameter      | Type | Default | Description |
|----------------|------|---------|-------------|
| `text`         | `string` | — | Raw text body (supports inline markup) |
| `i18nKey`      | `string` | — | i18n key for the text (takes precedence over `text`) |
| `i18nArgs`     | `Record<string,string>` | — | Interpolation args forwarded to `i18n/t` |
| `speaker`      | `string` | — | Speaker name shown above the text |
| `speakerI18nKey` | `string` | — | i18n key for the speaker name |
| `portrait`     | `string` | — | Resource key for a speaker portrait image |
| `speed`        | `number` | `40` | Default typewriter speed in chars/sec (can be overridden per-segment with `[speed=n]`) |

#### Event Contract — Notifications

| Event                   | When |
|-------------------------|------|
| `dialogue/started`      | Session opens (first `show-text` or `show-choices` call) |
| `dialogue/node`         | A new text line begins (speaker / portrait changed) |
| `dialogue/text:tick`    | Typewriter advances (and once with `done: true` when complete) |
| `dialogue/choices`      | Choice list becomes active |
| `dialogue/advanced`     | Player advanced after text was fully revealed |
| `dialogue/choice:made`  | Player confirmed a choice (carries `{ index }`) |
| `dialogue/ended`        | Session ends |

#### Usage

```ts
import { createEngine, DialogueManager, UIManager } from 'inkshot-engine';
import type { DialogueTextTickParams } from 'inkshot-engine';

const { core } = await createEngine({
  plugins: [new UIManager(), new DialogueManager({ defaultCharsPerSecond: 40 })],
});

// ① Mount a dialogue box widget (optional — subscribes to events automatically)
core.events.emitSync('ui/create', {
  type: 'dialoguebox',
  id: 'box',
  anchor: 'bottom-center',
  y: -20,
});

// ② Script system sends the first line (markup supported)
core.events.emitSync('dialogue/show-text', {
  text: 'She [speed=20]slowly said[/speed][pause=400][c=#ff4444]Danger![/c]',
  speaker: 'Alice',
});

// ③ Player presses Advance → next line or choices
core.events.on('script', 'dialogue/advanced', () => {
  core.events.emitSync('dialogue/show-choices', {
    choices: [
      { text: 'Run away!', index: 0 },
      { text: 'Stay calm.', index: 1 },
    ],
  });
});

// ④ Player picks a choice → script continues
core.events.on('script', 'dialogue/choice:made', ({ index }) => {
  core.events.emitSync('dialogue/end', {});
});

// ⑤ React to the typewriter tick (e.g. play a beep sound per character)
core.events.on<DialogueTextTickParams>('sfx', 'dialogue/text:tick', ({ done }) => {
  if (!done) playBeep();
});
```

#### `parseDialogueMarkup` — Direct Parser API

The markup parser is also exported for use in custom renderers or unit tests:

```ts
import { parseDialogueMarkup, buildTextSegments, getSpeedAtIndex } from 'inkshot-engine';

const { plain, colorSpans, speedSpans, pauses } = parseDialogueMarkup(
  '[c=#ff0000]Red[/c] normal [speed=200]fast[/speed]'
);
// plain === 'Red normal fast'

// Build the visible portion of styled segments at reveal position 10
const segments = buildTextSegments(plain, 10, colorSpans);

// Get the typewriter speed at character index 12
const speed = getSpeedAtIndex(12, speedSpans, 40);
```

---

## Script System (ScriptManager)

`ScriptManager` executes data-defined scripts as ordered lists of **command nodes**.
Multiple scripts run concurrently as independent *instances* identified by an `instanceId`.

### Built-in Commands

| Command         | Fields                                                  | Description                                                         |
|-----------------|---------------------------------------------------------|---------------------------------------------------------------------|
| `label`         | `name`                                                  | Position marker — no-op at runtime                                  |
| `jump`          | `target`                                                | Unconditional jump to a label                                       |
| `if`            | `var`, `value`, `jump`                                  | Jump when `vars[var] === value`; warns if label missing             |
| `if-not`        | `var`, `value`, `jump`                                  | Jump when `vars[var] !== value`                                     |
| `if-gt`         | `var` (string), `value` (number), `jump`                | Jump when `vars[var] > value` (numeric comparison)                  |
| `if-lt`         | `var` (string), `value` (number), `jump`                | Jump when `vars[var] < value` (numeric comparison)                  |
| `set`           | `var`, `value`                                          | Write a value into the variable store                               |
| `wait`          | `ms`                                                    | Pause for N milliseconds                                            |
| `emit`          | `event`, `params?`                                      | Fire a custom event synchronously                                   |
| `say`           | `text?`, `speaker?`, `portrait?`, `speed?`              | Show dialogue text (requires `DialogueManager`), await advance      |
| `choices`       | `choices`, `prompt?`, `var?`                            | Show choices, store picked index in `var`                           |
| `end`           | —                                                       | Close the dialogue session                                          |
| `wait-event`    | `event`, `var?`, `timeout?` (ms), `timeoutJump?`        | Suspend until an event fires; optional timeout with label fallback  |
| `call`          | `id`, `vars?`                                           | Run a sub-script inline (shared vars, awaited)                      |
| `fork`          | `id`, `instanceId?`, `vars?`, `priority?`               | Launch a concurrent instance (fire-and-forget)                      |
| `wait-instance` | `instanceId`                                            | Suspend until a named instance finishes                             |
| `stop-instance` | `instanceId`                                            | Stop another running instance                                       |

### `wait-event` with Timeout

```ts
// Wait up to 3 seconds for the player to arrive; on timeout jump to 'idle'
{ cmd: 'wait-event', event: 'player/arrived', timeout: 3000, timeoutJump: 'idle' }
```

If the event fires before the timeout the script continues normally.
If the timeout fires first, execution jumps to `timeoutJump` (if given) or falls through.

### Numeric Comparisons

```ts
const huntScript: ScriptDef = {
  id: 'hunt',
  nodes: [
    { cmd: 'set',   var: 'hp', value: 30 },
    { cmd: 'if-lt', var: 'hp', value: 50, jump: 'flee' },   // hp < 50 → flee
    { cmd: 'if-gt', var: 'hp', value: 80, jump: 'charge' }, // hp > 80 → charge
    { cmd: 'jump',  target: 'normal' },
    { cmd: 'label', name: 'flee' },
    // …
  ],
};
```

---

## Actor System (ActorManager)

`ActorManager` manages game characters driven by a **trigger table** and scripts.

### Quick Example

```ts
import { ActorManager, ScriptManager } from 'inkshot-engine';
import type { ActorDef } from 'inkshot-engine';

const merchantDef: ActorDef = {
  id: 'merchant',
  initialState: { isAvailable: true, gold: 500 },
  scripts: [
    { id: 'merchant-patrol',   nodes: [/* … */] },
    { id: 'merchant-dialogue', nodes: [/* … */] },
  ],
  triggers: [
    // Auto-start patrol when spawned (fires only on THIS instance, not existing ones)
    { id: 'auto-patrol',    event: 'actor/spawned',   script: 'merchant-patrol',   mode: 'concurrent' },
    // Player interaction blocks the primary lane; restores patrol after dialogue
    {
      id:            'player-interact',
      event:         'player/interact',
      condition:     (ctx) =>
        ctx.actorState['isAvailable'] === true &&
        (ctx.eventPayload as { targetId: string }).targetId === ctx.actorInstance.id,
      script:        'merchant-dialogue',
      mode:          'blocking',
      priority:      10,
      onEnd:         'restore',
      varsFromEvent: (p) => ({ playerId: (p as { playerId: string }).playerId }),
    },
  ],
};

core.events.emitSync('actor/define', { def: merchantDef });
core.events.emitSync('actor/spawn',  { actorType: 'merchant', instanceId: 'merchant-1' });
```

### Batch State Updates

```ts
// Update three keys with a single notification
core.events.emitSync('actor/state:patch', {
  instanceId: 'merchant-1',
  patch: { gold: 0, isAvailable: false, quest: 'done' },
});
// Emits actor/state:patched once with { patch, previous }
```

### Listing All Live Instances

```ts
import type { ActorListOutput } from 'inkshot-engine';

const { output } = core.events.emitSync<unknown, ActorListOutput>('actor/list', {});
for (const inst of output.instances) {
  console.log(inst.id, inst.actorType, inst.state);
}
```

### Event Reference

| Event                  | Description                                              |
|------------------------|----------------------------------------------------------|
| `actor/define`         | Register an actor type blueprint                         |
| `actor/spawn`          | Create a new instance → `ActorSpawnOutput`               |
| `actor/despawn`        | Remove a live instance                                   |
| `actor/state:set`      | Write a single state key → emits `actor/state:changed`   |
| `actor/state:patch`    | Write multiple keys atomically → emits `actor/state:patched` |
| `actor/state:get`      | Read a deep-cloned snapshot → `ActorStateGetOutput`      |
| `actor/list`           | List all live instances → `ActorListOutput`              |
| `actor/trigger`        | Manually fire a named trigger on an instance             |
| `actor/spawned`        | Emitted after spawn + spawned triggers are fired         |
| `actor/despawned`      | Emitted after an instance is removed                     |
| `actor/script:started` | A trigger caused a script to start                       |
| `actor/script:ended`   | A trigger-started script ended                           |
| `actor/state:changed`  | A single state key was written                           |
| `actor/state:patched`  | Multiple state keys were written                         |

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
  InputGamepadConnectedParams, InputGamepadDisconnectedParams,
  InputGamepadAxisBindParams, InputGamepadAxesParams,
  // Timer
  TimerFiredParams, TimerCancelledParams, TimerCancelAllOutput,
  TimerCooldownOutput,
  // Save
  SaveSlotSaveOutput,
  // Collision
  TileCollisionShape, TileShapeContext, TileShapeResolver,
  CollisionMoveOutput, CollisionQueryOutput, CollisionRaycastOutput,
  ColliderShape,
  // Tween
  TweenToParams, TweenToOutput, TweenKillParams, TweenFinishedParams,
  EasingFn, TweenOptions, Advanceable,
  TimelineOptions,
  // Particle
  ParticleConfig, ParticleEmitOutput, ParticleCompleteParams,
  ParticleMoveParams, ParticlePauseParams, ParticleResumeParams,
  ParticleCountOutput, ParticleUpdateParams,
  // Audio
  AudioPlayParams, AudioPlayOutput,
  AudioListenerUpdateParams, AudioSourceMoveParams,
  AudioStateOutput, AudioListOutput, AudioInstanceInfo,
  // Pathfinding
  PathfindingFindParams, PathfindingFindOutput,
  PathfindingWeightSetParams, PathfindingCacheClearParams,
  // UI
  UICreateParams, UICreateOutput, UIRegisterParams, UIRegisterOutput,
  UIShowParams, UIHideParams, UIDestroyParams, UIUpdateParams,
  UIGetParams, UIGetOutput, UICreatedParams,
  UILabelProps, UIButtonProps, UIPanelProps, UIProgressBarProps,
  UISliderProps, UIScrollViewProps, UIDialogProps, UIStackPanelProps,
  UIDialogueBoxProps,
  // Dialogue
  DialogueShowTextParams, DialogueShowChoicesParams,
  DialogueNodeParams, DialogueTextTickParams, DialogueChoicesParams,
  DialogueAdvancedParams, DialogueChoiceMadeParams,
  DialogueStateGetOutput, DialogueTextSegment,
  // Dialogue markup parser
  ParsedMarkup, ColorSpan, SpeedSpan, PauseMark,
  // Events
  EventHandler, ListenerOptions,
} from 'inkshot-engine';
```

Use them to type your event handlers:

```ts
core.events.on<I18nTParams, I18nTOutput>('ui', 'i18n/t', (params, output) => {
  output.value = params.key.toUpperCase(); // override translation for debug
});

core.events.on<TweenFinishedParams>('fx', 'tween/finished', ({ id, target }) => {
  console.log(`Tween "${id ?? 'anonymous'}" finished on`, target);
});
```

---

## License

ISC

