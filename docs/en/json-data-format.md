# JSON Data Format Reference

This document describes all data formats in inkshot-engine that are defined using JSON / plain objects, including RPG game data, script definitions, Tilemap, i18n locale files, and save data.

---

## Table of Contents

1. [RPG Game Data (`RpgGameData`)](#1-rpg-game-data-rpggamedata)
   - [Top-level Structure](#11-top-level-structure)
   - [meta — Game Metadata](#12-meta--game-metadata)
   - [classes — Class Definitions](#13-classes--class-definitions)
   - [actors — Actor Definitions](#14-actors--actor-definitions)
   - [items — Item Definitions](#15-items--item-definitions)
   - [statusEffects — Status Effect Definitions](#16-statuseffects--status-effect-definitions)
   - [scripts — Standalone Script Definitions](#17-scripts--standalone-script-definitions)
2. [Script Nodes (`ScriptDef` / `ScriptNode`)](#2-script-nodes-scriptdef--scriptnode)
   - [Script Format](#21-script-format)
   - [Built-in Command Quick Reference](#22-built-in-command-quick-reference)
   - [Command Detailed Reference](#23-command-detailed-reference)
3. [Tilemap Data (`TilemapData`)](#3-tilemap-data-tilemapdata)
   - [TilemapData Top-level Structure](#31-tilemapdata-top-level-structure)
   - [TilesetDef — Tileset Definition](#32-tilesetdef--tileset-definition)
   - [TilemapLayerDef — Layer Definition](#33-tilemaplayer-def--layer-definition)
   - [AnimatedTileDef — Animated Tiles](#34-animatedtiledef--animated-tiles)
   - [AutotileGroupDef — Auto Tiles](#35-autotilegroupdef--auto-tiles)
4. [i18n Locale Files](#4-i18n-locale-files)
5. [Save Data](#5-save-data)
6. [Complete RpgGameData Example](#6-complete-rpggamedata-example)

---

## 1. RPG Game Data (`RpgGameData`)

`RpgGameData` is the root object describing all static data for an RPG game.  
Use `registerRpgData()` to complete all definition injection in one step; or call `loadRpgData()` first to get the converted result and then inject manually.

```ts
import { registerRpgData } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

// Can be defined directly in code
const gameData: RpgGameData = { /* ... */ };

// Or read from a JSON file
// const gameData = await fetch('/data/game.json').then(r => r.json()) as RpgGameData;

// ✅ Recommended: inject into engine in one line
registerRpgData(core, gameData);

// Or pass via createRpgEngine (same effect):
// await createRpgEngine({ container: '#app', gameData });
```

For manual step-by-step injection (advanced usage), use `loadRpgData()`:

```ts
import { loadRpgData } from '@inkshot/engine';

const data = loadRpgData(gameData);
// Use data.actors, data.items, data.expCurves etc. for individual injection
```

---

### 1.1 Top-level Structure

```jsonc
{
  "meta": { /* game metadata */ },
  "classes": [ /* class definition array */ ],
  "actors": [ /* actor definition array */ ],
  "items": [ /* item definition array */ ],
  "statusEffects": [ /* status effect definition array */ ],
  "scripts": [ /* standalone script definition array */ ]
}
```

All fields are optional — only include the parts your game actually uses.

---

### 1.2 `meta` — Game Metadata

```jsonc
{
  "meta": {
    "title": "My RPG",          // Game title (string, optional)
    "version": "1.0.0",         // Version string (optional)
    "locale": "en",             // Default locale code (optional, default "en")
    "initialGold": 100,         // Starting gold (number, optional, default 0)
    "initialVariables": {       // Initial values injected into VariableStoreManager (optional)
      "flags.tutorial": false,
      "counters.battles": 0
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | No | Game title |
| `version` | `string` | No | Version string |
| `locale` | `string` | No | Default locale, passed to `LocalizationManager` (default `"en"`) |
| `initialGold` | `number` | No | Starting gold for new game (default `0`) |
| `initialVariables` | `Record<string, unknown>` | No | Initial variable values, injected into `VariableStoreManager` |

---

### 1.3 `classes` — Class Definitions

Each class generates an **ExpCurveDef** and **StatProfileDef** in the `loadRpgData()` output.

```jsonc
{
  "classes": [
    {
      "id": "warrior",          // Unique identifier (required)
      "name": "Warrior",        // Display name (optional)
      "expCurve": {
        "base": 30,             // Base coefficient (default 30)
        "exp": 2,               // Exponent (default 2)
        "extra": 0,             // Extra linear coefficient (default 0)
        "maxLevel": 99          // Maximum level (default 99)
      },
      "baseStats": {
        // Level 1 base values, any key names are accepted
        "hp": 120,
        "hpMax": 120,
        "mp": 30,
        "mpMax": 30,
        "atk": 15,
        "def": 10,
        "agi": 8,
        "luk": 5
      }
    },
    {
      "id": "mage",
      "name": "Mage",
      "expCurve": { "base": 25, "exp": 2.2 },
      "baseStats": { "hp": 60, "hpMax": 60, "mp": 100, "mpMax": 100, "atk": 8, "def": 4, "agi": 10 }
    }
  ]
}
```

**EXP formula:** `exp(level) = base × level ^ exp + extra × level`

> Note: if only one of `hp` / `hpMax` is provided, `loadRpgData()` automatically fills in the other. Same for `mp`/`mpMax`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | **Yes** | Unique identifier |
| `name` | `string` | No | Display name |
| `expCurve.base` | `number` | No | Base coefficient (default `30`) |
| `expCurve.exp` | `number` | No | Exponent (default `2`) |
| `expCurve.extra` | `number` | No | Extra linear coefficient (default `0`) |
| `expCurve.maxLevel` | `number` | No | Maximum level (default `99`) |
| `baseStats` | `Record<string, number>` | No | Level 1 base attribute values |

---

### 1.4 `actors` — Actor Definitions

Actors are blueprints for NPCs, bosses, the player character, and other entities in the game.  
Each actor definition can create multiple independent instances via the `actor/spawn` event.

```jsonc
{
  "actors": [
    {
      "id": "hero",                   // Unique identifier (required)
      "name": "Hero",                 // Display name (optional)
      "classId": "warrior",           // Matches id in classes, inherits stats and EXP curve (optional)
      "initialLevel": 1,              // Starting level (optional, default 1)
      "initialState": {               // Initial state values (optional, merged into state)
        "isPlayer": true,
        "portrait": "hero.png"
      },
      "scripts": [
        // Scripts used by this actor (see Section 2)
      ],
      "triggers": [
        // Trigger definitions (see below)
      ]
    }
  ]
}
```

#### Trigger Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | **Yes** | Unique within this actor |
| `event` | `string` | **Yes** | EventBus event name that fires this trigger |
| `script` | `string` | **Yes** | Script ID to execute (must be in this actor's `scripts`) |
| `mode` | `'concurrent' \| 'blocking'` | No | Default `'blocking'`. `concurrent`: runs alongside existing scripts; `blocking`: occupies the main execution channel |
| `priority` | `number` | No | Default `10`. Higher priority can preempt lower priority scripts on the same channel |
| `onEnd` | `'restore' \| 'nothing' \| string` | No | Default `'nothing'`. `restore`: re-start the preempted script after ending; `<scriptId>`: run specified script instead |

> **Note:** JSON-format triggers don't support `condition` (condition functions) and `varsFromEvent` (event variable extraction functions) — those require code-defined `ActorDef`.

---

### 1.5 `items` — Item Definitions

```jsonc
{
  "items": [
    {
      "id": "potion",                   // Unique identifier (required)
      "name": "Potion",                 // Display name (required)
      "description": "Restores 100 HP", // Description text (optional)
      "category": "item",               // Category (required): item | weapon | armor | accessory | key
      "price": 50,                      // Shop price (optional)
      "maxStack": 99,                   // Max stack count (optional, default 99)
      "useScriptId": "potion-use"       // Script ID to run when used (optional, only for category=item)
    },
    {
      "id": "iron-sword",
      "name": "Iron Sword",
      "category": "weapon",
      "price": 200,
      "maxStack": 1,
      "equipModifiers": [               // Equipment bonuses (optional, for weapon/armor/accessory)
        { "stat": "atk", "value": 10, "mode": "add" }
      ]
    }
  ]
}
```

#### `equipModifiers` Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stat` | `string` | **Yes** | Attribute key to affect (e.g. `atk`, `def`, `agi`) |
| `value` | `number` | **Yes** | Bonus value |
| `mode` | `'add' \| 'multiply'` | No | Application mode: `add` (additive, default) or `multiply` (multiplicative) |

> Items can include any custom fields — the engine does not filter extra properties.

---

### 1.6 `statusEffects` — Status Effect Definitions

```jsonc
{
  "statusEffects": [
    {
      "id": "poison",                   // Unique identifier (required)
      "name": "Poison",                 // Display name (required)
      "modifiers": [                    // Attribute modifier array (required, can be empty)
        { "stat": "atk", "value": 0.8, "mode": "multiply" }
      ],
      "duration": 15000,               // Duration (ms, optional; omit for permanent)
      "tickDamage": 5,                 // Damage per tick (optional; negative = healing)
      "tickMs": 1000                   // Tick interval (ms, optional, default 1000)
    },
    {
      "id": "haste",
      "name": "Haste",
      "modifiers": [
        { "stat": "agi", "value": 1.5, "mode": "multiply" }
      ],
      "duration": 10000
    },
    {
      "id": "regen",
      "name": "Regen",
      "modifiers": [],                  // No attribute changes, only triggers periodic healing
      "duration": 20000,
      "tickDamage": -10,               // Negative = restore 10 HP per tick
      "tickMs": 2000
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | **Yes** | Unique identifier |
| `name` | `string` | **Yes** | Display name |
| `modifiers` | `StatModifier[]` | **Yes** | Attribute modifier list (can be empty array) |
| `duration` | `number` | No | Duration (ms); omit for permanent |
| `tickDamage` | `number` | No | Per-tick damage (positive) or healing (negative) |
| `tickMs` | `number` | No | Tick interval (ms, default `1000`) |

---

### 1.7 `scripts` — Standalone Script Definitions

Standalone scripts unattached to any actor, suitable for cutscenes, public events, etc. Script format is the same as the scripts within actors — see [Section 2](#2-script-nodes-scriptdef--scriptnode).

```jsonc
{
  "scripts": [
    {
      "id": "intro-cutscene",
      "nodes": [
        { "cmd": "emit", "event": "game/state:set", "params": { "phase": "cutscene" } },
        { "cmd": "say", "text": "Long ago...", "speaker": "Narrator" },
        { "cmd": "wait", "ms": 500 },
        { "cmd": "say", "text": "This world fell into darkness.", "speaker": "Narrator" },
        { "cmd": "emit", "event": "game/state:set", "params": { "phase": "playing" } },
        { "cmd": "end" }
      ]
    }
  ]
}
```

---

## 2. Script Nodes (`ScriptDef` / `ScriptNode`)

### 2.1 Script Format

```jsonc
{
  "id": "my-script",      // Unique identifier (required)
  "nodes": [              // Command node array (required)
    { "cmd": "say",  "text": "Hello!", "speaker": "Alice" },
    { "cmd": "wait", "ms": 1000 },
    { "cmd": "end" }
  ]
}
```

Each node **must** include a `cmd` field; other fields vary by command.

---

### 2.2 Built-in Command Quick Reference

| Command | Description |
|---------|-------------|
| [`label`](#label) | Position marker (no-op at runtime) |
| [`jump`](#jump) | Unconditional jump to marker |
| [`if`](#if--if-not--if-gt--if-lt) | Conditional jump (equal) |
| [`if-not`](#if--if-not--if-gt--if-lt) | Conditional jump (not equal) |
| [`if-gt`](#if--if-not--if-gt--if-lt) | Conditional jump (greater than) |
| [`if-lt`](#if--if-not--if-gt--if-lt) | Conditional jump (less than) |
| [`set`](#set) | Set script variable |
| [`wait`](#wait) | Wait specified milliseconds |
| [`emit`](#emit) | Send EventBus event |
| [`say`](#say) | Show dialogue text and wait for advance |
| [`choices`](#choices) | Show choices and record selection |
| [`end`](#end) | Close dialogue window |
| [`wait-event`](#wait-event) | Wait for event (optional timeout) |
| [`call`](#call) | Inline execute sub-script (wait for completion) |
| [`fork`](#fork) | Start concurrent script (fire-and-forget) |
| [`wait-instance`](#wait-instance) | Wait for specified instance to finish |
| [`stop-instance`](#stop-instance) | Stop specified instance |

---

### 2.3 Command Detailed Reference

#### `label`

Position marker for `jump`, `if`, etc. to jump to. No-op at runtime.

```jsonc
{ "cmd": "label", "name": "loop-start" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | **Yes** | Marker name, must be unique within the script |

---

#### `jump`

Unconditional jump to specified marker.

```jsonc
{ "cmd": "jump", "target": "loop-start" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `target` | `string` | **Yes** | Target marker name (the `name` value of a `label`) |

---

#### `if` / `if-not` / `if-gt` / `if-lt`

Conditional jumps:

```jsonc
{ "cmd": "if",     "var": "choice", "value": 0, "jump": "option-a" }
{ "cmd": "if-not", "var": "flags.done", "value": true, "jump": "not-done" }
{ "cmd": "if-gt",  "var": "counters.kills", "value": 10, "jump": "quest-done" }
{ "cmd": "if-lt",  "var": "hp", "value": 20, "jump": "low-hp-warning" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `var` | `string` | **Yes** | Script variable key to compare |
| `value` | `unknown` | **Yes** | Comparison value (`if`/`if-not` use strict equality; `if-gt`/`if-lt` use numeric comparison) |
| `jump` | `string` | **Yes** | Marker name to jump to if condition is true |

---

#### `set`

Set a script variable value.

```jsonc
{ "cmd": "set", "var": "choice", "value": 0 }
{ "cmd": "set", "var": "flags.met-king", "value": true }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `var` | `string` | **Yes** | Variable key name |
| `value` | `unknown` | **Yes** | Value to set |

---

#### `wait`

Pause script execution for the specified time.

```jsonc
{ "cmd": "wait", "ms": 2000 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ms` | `number` | **Yes** | Milliseconds to wait |

---

#### `emit`

Synchronously emit an EventBus event.

```jsonc
{ "cmd": "emit", "event": "audio/play", "params": { "key": "battle-bgm", "loop": true } }
{ "cmd": "emit", "event": "game/state:set", "params": { "phase": "cutscene" } }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | `string` | **Yes** | EventBus event name |
| `params` | `object` | No | Parameter object to pass to the event |

---

#### `say`

Show dialogue text and wait for the player to advance (click or key press).  
Requires `DialogueManager` plugin.

```jsonc
{ "cmd": "say", "text": "Hello, hero!", "speaker": "Village Elder" }
{ "cmd": "say", "text": "[color=#ff0]Warning![/color] Danger ahead.", "speed": 0.5 }
{ "cmd": "say", "text": "...", "portrait": "npc-sad.png", "speed": 0.3 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | `string` | No | Dialogue text (supports Rich-text markup) |
| `speaker` | `string` | No | Speaker name |
| `portrait` | `string` | No | Speaker portrait image key |
| `speed` | `number` | No | Typing speed multiplier (`1.0` = normal speed, `0.5` = slower) |

**Rich-text markup:**

| Tag | Description | Example |
|-----|-------------|---------|
| `[color=#rrggbb]…[/color]` | Text color | `[color=#ff0000]Red text[/color]` |
| `[speed=n]…[/speed]` | Typing speed | `[speed=0.3]Slow typing[/speed]` |
| `[pause=ms]` | Pause mid-typing | `[pause=500]` |

---

#### `choices`

Show a list of choices; the player's selection index (0-based) is stored in a variable.  
Requires `DialogueManager` plugin.

```jsonc
{
  "cmd": "choices",
  "choices": ["Buy items", "View quests", "Leave"],
  "prompt": "Please choose:",
  "var": "menuChoice"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `choices` | `string[]` | **Yes** | Array of choice text strings |
| `prompt` | `string` | No | Prompt text displayed before choices |
| `var` | `string` | No | Variable key to store the result (0-based index) |

---

#### `end`

Close the dialogue window (emits `dialogue/end` event).

```jsonc
{ "cmd": "end" }
```

No additional fields.

---

#### `wait-event`

Pause the script until the specified event fires. Optional timeout and jump label on timeout.

```jsonc
{ "cmd": "wait-event", "event": "player/interact", "var": "interactPayload" }
{ "cmd": "wait-event", "event": "battle/ended", "timeout": 30000, "timeoutJump": "timeout-fallback" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | `string` | **Yes** | EventBus event name to wait for |
| `var` | `string` | No | Variable key to store the event payload |
| `timeout` | `number` | No | Timeout duration (ms) |
| `timeoutJump` | `string` | No | Marker name to jump to on timeout |

---

#### `call`

Inline execute a sub-script and wait for it to complete before continuing.

```jsonc
{ "cmd": "call", "id": "common-greeting" }
{ "cmd": "call", "id": "battle-intro", "vars": { "enemyId": "boss-1" } }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | **Yes** | Script `id` to call (must be registered with `script/define`) |
| `vars` | `object` | No | Initial variables to pass into the sub-script |

---

#### `fork`

Start a concurrent script instance (fire-and-forget) without waiting for it to complete.

```jsonc
{ "cmd": "fork", "id": "ambient-sound-loop", "instanceId": "ambient" }
{ "cmd": "fork", "id": "npc-patrol", "instanceId": "guard-2", "priority": 0 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | **Yes** | Script `id` to start |
| `instanceId` | `string` | No | Instance identifier (defaults to script `id`) |
| `vars` | `object` | No | Initial variables to pass into the script |
| `priority` | `number` | No | Script execution priority (default `0`) |

---

#### `wait-instance`

Wait for a specified script instance to finish before continuing. Typically used with `fork`.

```jsonc
{ "cmd": "fork",          "id": "battle-animation", "instanceId": "anim" }
{ "cmd": "wait-instance", "instanceId": "anim" }
{ "cmd": "say",           "text": "Battle over!" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instanceId` | `string` | **Yes** | Instance identifier to wait for |

---

#### `stop-instance`

Stop a specified script instance.

```jsonc
{ "cmd": "stop-instance", "instanceId": "ambient" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instanceId` | `string` | **Yes** | Instance identifier to stop |

---

## 3. Tilemap Data (`TilemapData`)

### 3.1 TilemapData Top-level Structure

```jsonc
{
  "id": "world-map",               // Unique identifier (required)
  "tileWidth": 32,                 // Single tile width (pixels, required)
  "tileHeight": 32,                // Single tile height (pixels, required)
  "tilesets": [ /* TilesetDef[] */ ],
  "layers": [ /* TilemapLayerDef[] */ ],
  "animatedTiles": {               // Animated tile definitions (optional, keyed by global tile ID)
    "101": { "frames": [ { "tileId": 101, "duration": 200 }, { "tileId": 102, "duration": 200 } ] }
  },
  "autotileGroups": [ /* AutotileGroupDef[] */ ],  // Auto tile definitions (optional)
  "tileCollisionMap": {            // Tile collision shapes (optional)
    "5": "solid",
    "8": "one-way"
  }
}
```

---

### 3.2 `TilesetDef` — Tileset Definition

```jsonc
{
  "firstgid": 1,           // First global tile ID for this tileset (typically 1 for first tileset)
  "name": "dungeon",       // Display name
  "textureKey": "tileset-dungeon",  // Texture key loaded via assets/load
  "tileWidth": 32,         // Tile width (pixels)
  "tileHeight": 32,        // Tile height (pixels)
  "columns": 16,           // Number of columns in atlas (optional, auto-calculated if omitted)
  "spacing": 0,            // Tile spacing (pixels, optional, default 0)
  "margin": 0              // Atlas border (pixels, optional, default 0)
}
```

> Tile ID `0` is always "empty" — a value of `0` in a layer means no tile in that cell.

---

### 3.3 `TilemapLayerDef` — Layer Definition

```jsonc
{
  "name": "ground",        // Layer name
  "width": 50,             // Layer width (in tiles)
  "height": 50,            // Layer height (in tiles)
  "data": [                // 1D tile ID array, length = width × height, row-major order
    1, 2, 3, 0, 0, 1, /* … */
  ],
  "visible": true,         // Whether visible (optional, default true)
  "opacity": 1.0,          // Opacity (optional, 0.0–1.0, default 1.0)
  "zIndex": 0,             // Render sort order (optional, default 0)
  "collisionEnabled": true // Whether collision is enabled (optional, default false)
}
```

---

### 3.4 `AnimatedTileDef` — Animated Tiles

```jsonc
{
  "animatedTiles": {
    "101": {
      "frames": [
        { "tileId": 101, "duration": 150 },
        { "tileId": 102, "duration": 150 },
        { "tileId": 103, "duration": 150 }
      ]
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `frames[].tileId` | `number` | **Yes** | Global tile ID displayed in this frame |
| `frames[].duration` | `number` | **Yes** | This frame's duration (ms) |

---

### 3.5 `AutotileGroupDef` — Auto Tiles

```jsonc
{
  "autotileGroups": [
    {
      "id": "water",            // Unique identifier
      "mode": "4bit",           // Auto tile mode: "4bit" (4-neighbor) or "8bit" (8-neighbor)
      "tileMap": {              // Bitmask value → tile ID mapping
        "0":   32,
        "1":   33,
        "2":   34,
        "15":  47
      }
    }
  ]
}
```

---

## 4. i18n Locale Files

i18n locale files are plain JSON objects with nested key structure; leaf values are strings or plural objects.  
Load with `i18n/load` event; retrieve translations with `i18n/t` event.

```jsonc
// /assets/i18n/en.json
{
  "ui": {
    "confirm": "Confirm",
    "cancel": "Cancel",
    "back": "Back"
  },
  "menu": {
    "title": "Main Menu",
    "newGame": "New Game",
    "loadGame": "Load Game",
    "settings": "Settings",
    "quit": "Quit"
  },
  "battle": {
    "attack": "Attack",
    "skill": "Skill",
    "item": "Item",
    "flee": "Flee",
    "victory": "Victory!",
    "defeat": "Defeat..."
  },
  "items": {
    "potion": {
      "name": "Potion",
      "description": "Restores {{amount}} HP"
    }
  },
  "achievement": {
    "firstBattle": {
      "one": "Completed 1 battle",
      "other": "Completed {{count}} battles"
    }
  }
}
```

### Interpolation Syntax

Use `{{key}}` in translation strings to insert dynamic values:

```ts
// Get translation with interpolation
const { output } = core.events.emitSync('i18n/t', {
  key: 'items.potion.description',
  params: { amount: 100 },
});
// output.value => "Restores 100 HP"
```

### Pluralization

For strings requiring plural forms, use an object with `one`/`other` keys (following [ICU plural rules](https://unicode-org.github.io/icu/userguide/format_parse/messages/)):

```ts
const { output } = core.events.emitSync('i18n/t', {
  key: 'achievement.firstBattle',
  params: { count: 5 },
});
// output.value => "Completed 5 battles"
```

---

## 5. Save Data

Save data is managed by `SaveManager` and persisted via `save/slot:save` (stored in `localStorage` by default).  
Save format is plain JSON; the following is a reference structure:

```jsonc
// Save slot
{
  "meta": {
    "id": "slot-1",           // Slot ID
    "name": "Save 1",         // Display name
    "createdAt": 1700000000000, // Creation time (Unix ms)
    "updatedAt": 1700001234567, // Last update time (Unix ms)
    "version": 1              // Save format version (managed by SaveMigrationPlugin)
  },
  "data": {
    // Entirely determined by the game — any key-value pairs
    "playerHp": 85,
    "playerGold": 320,
    "mapId": "dungeon-1",
    "variables": { /* VariableStoreManager snapshot */ },
    "inventory": { /* InventorySystem snapshot */ }
  }
}

// Global save data (cross-slot, not belonging to any slot)
{
  "data": {
    "achievements": { /* AchievementPlugin snapshot */ },
    "totalPlayTime": 12345
  },
  "updatedAt": 1700001234567,
  "version": 1
}
```

> The `data` field structure is entirely up to the game developer — the engine does not prescribe its internal format.  
> It is recommended to use `SaveMigrationPlugin` to manage save format version upgrades.

---

## 6. Complete RpgGameData Example

Below is a complete, ready-to-use `RpgGameData` JSON example including classes, actors, items, status effects, and scripts:

```jsonc
{
  "meta": {
    "title": "Hero Legend",
    "version": "1.0.0",
    "locale": "en",
    "initialGold": 100,
    "initialVariables": {
      "flags.tutorial-done": false,
      "counters.battles": 0
    }
  },

  "classes": [
    {
      "id": "warrior",
      "name": "Warrior",
      "expCurve": { "base": 30, "exp": 2, "maxLevel": 50 },
      "baseStats": { "hp": 150, "hpMax": 150, "mp": 20, "mpMax": 20, "atk": 18, "def": 12, "agi": 8, "luk": 5 }
    },
    {
      "id": "mage",
      "name": "Mage",
      "expCurve": { "base": 25, "exp": 2.2, "maxLevel": 50 },
      "baseStats": { "hp": 70, "hpMax": 70, "mp": 120, "mpMax": 120, "atk": 6, "def": 4, "agi": 12, "luk": 8 }
    }
  ],

  "actors": [
    {
      "id": "hero",
      "name": "Hero",
      "classId": "warrior",
      "initialLevel": 1,
      "initialState": { "isPlayer": true }
    },
    {
      "id": "village-elder",
      "name": "Village Elder",
      "scripts": [
        {
          "id": "elder-greet",
          "nodes": [
            { "cmd": "say", "text": "Welcome, brave hero.", "speaker": "Elder" },
            { "cmd": "choices", "choices": ["Tell me about the quest", "Never mind"], "var": "$elderChoice" },
            { "cmd": "if", "var": "$elderChoice", "value": 1, "jump": "farewell" },
            { "cmd": "say", "text": "A great evil threatens our land...", "speaker": "Elder" },
            { "cmd": "label", "name": "farewell" },
            { "cmd": "end" }
          ]
        }
      ],
      "triggers": [
        {
          "id": "on-interact",
          "event": "player/interact",
          "script": "elder-greet",
          "mode": "blocking",
          "onEnd": "nothing"
        }
      ]
    }
  ],

  "items": [
    {
      "id": "potion",
      "name": "Potion",
      "description": "Restores 100 HP",
      "category": "item",
      "price": 50,
      "maxStack": 99,
      "useScriptId": "use-potion"
    },
    {
      "id": "iron-sword",
      "name": "Iron Sword",
      "description": "ATK +10",
      "category": "weapon",
      "price": 200,
      "maxStack": 1,
      "equipModifiers": [
        { "stat": "atk", "value": 10, "mode": "add" }
      ]
    },
    {
      "id": "iron-shield",
      "name": "Iron Shield",
      "description": "DEF +8, AGI -2",
      "category": "armor",
      "price": 150,
      "maxStack": 1,
      "equipModifiers": [
        { "stat": "def", "value": 8, "mode": "add" },
        { "stat": "agi", "value": -2, "mode": "add" }
      ]
    }
  ],

  "statusEffects": [
    {
      "id": "poison",
      "name": "Poison",
      "modifiers": [{ "stat": "atk", "value": 0.8, "mode": "multiply" }],
      "duration": 15000,
      "tickDamage": 5,
      "tickMs": 1000
    },
    {
      "id": "haste",
      "name": "Haste",
      "modifiers": [{ "stat": "agi", "value": 1.5, "mode": "multiply" }],
      "duration": 10000
    }
  ],

  "scripts": [
    {
      "id": "use-potion",
      "nodes": [
        { "cmd": "emit", "event": "stats/heal", "params": { "actorId": "$caster", "amount": 100 } },
        { "cmd": "say", "text": "Used a Potion. Restored 100 HP." },
        { "cmd": "end" }
      ]
    }
  ]
}
```
