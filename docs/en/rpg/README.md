# RPG System Overview

This document describes the **RPG subsystem bundle** built into inkshot-engine, including functionality descriptions and API quick-reference for each subsystem, as well as integration relationships between systems.

---

## Table of Contents

1. [RPG Bundle Setup](#1-rpg-bundle-setup)
2. [Subsystem Overview](#2-subsystem-overview)
3. [Subsystem API Quick Reference](#3-subsystem-api-quick-reference)
   - [StatsSystem (`stats`)](#31-statssystem-stats)
   - [InventorySystem (`inventory`)](#32-inventorysystem-inventory)
   - [ExperienceSystem (`exp`)](#33-experiencesystem-exp)
   - [BattleSystem (`battle`)](#34-battlesystem-battle)
   - [ShopSystem (`shop`)](#35-shopsystem-shop)
   - [DialogueManager (`dialogue`)](#36-dialoguemanager-dialogue)
   - [ScriptManager (`script`)](#37-scriptmanager-script)
   - [ActorManager (`actor`)](#38-actormanager-actor)
   - [VariableStoreManager (`store`)](#39-variablestoremanager-store)
   - [PlayerController (`playerController`)](#310-playercontroller-playercontroller)
   - [RpgMenuSystem (`rpgMenu`)](#311-rpgmenusystem-rpgmenu)
4. [System Integration Relationships](#4-system-integration-relationships)
5. [RPG Data Loading Flow](#5-rpg-data-loading-flow)
6. [Related Documents](#6-related-documents)

---

## 1. RPG Bundle Setup

### One-line Startup (Recommended)

```ts
import { createRpgEngine } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

const gameData: RpgGameData = {
  meta: { title: 'My RPG', initialGold: 200 },
  classes: [{ id: 'warrior', baseStats: { hp: 120, atk: 15 } }],
  actors:  [{ id: 'hero', name: 'Hero', classId: 'warrior' }],
  items:   [{ id: 'potion', name: 'Potion', category: 'item', price: 50 }],
};

const { core, rpg } = await createRpgEngine({
  container: '#app',
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  gameData,   // ← After initialization, all definitions are auto-injected
});
```

`createRpgEngine` accepts an optional `gameData` field: when provided, it automatically calls `registerRpgData(core, gameData)` after the engine finishes initializing, completing all plugin definition injection in one step.

If you don't need to pass data at startup, you can call it manually later:

```ts
import { createRpgEngine, registerRpgData } from '@inkshot/engine';

const { core } = await createRpgEngine({ container: '#app' });
registerRpgData(core, gameData);   // Can be called at any time
```

`createRpgEngine` automatically loads the full RPG plugin bundle and returns a typed `rpg` namespace accessor:

| `rpg.*` | Corresponding System |
|---------|---------------------|
| `rpg.stats` | StatsSystem |
| `rpg.inventory` | InventorySystem |
| `rpg.exp` | ExperienceSystem |
| `rpg.battle` | BattleSystem |
| `rpg.shop` | ShopSystem |
| `rpg.dialogue` | DialogueManager |
| `rpg.script` | ScriptManager |
| `rpg.actor` | ActorManager |
| `rpg.variableStore` | VariableStoreManager |
| `rpg.menu` | RpgMenuSystem |

### Manual Assembly

If you only need some subsystems, use `buildRpgPluginBundle()` to get an ordered plugin array and pass it to `createEngine`:

```ts
import { createEngine, buildRpgPluginBundle } from '@inkshot/engine';

const rpgPlugins = buildRpgPluginBundle();   // Full RPG plugin array with dependency ordering

const { core } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  plugins: [
    ...rpgPlugins,
    // Add your custom plugins
  ],
});
```

---

## 2. Subsystem Overview

| System | Namespace | Description |
|--------|-----------|-------------|
| **StatsSystem** | `stats` | Base attributes (HP/MP/ATK etc.), additive/multiplicative modifiers, status effects (Buffs/Debuffs) |
| **InventorySystem** | `inventory` | Per-actor independent inventory, item stacking, equipment slots |
| **ExperienceSystem** | `exp` | Experience accumulation, level-up checks, configurable EXP curves |
| **BattleSystem** | `battle` | Turn-based combat, multiple concurrent battles, damage formulas, action resolution |
| **ShopSystem** | `shop` | Buy/sell transactions, gold managed via VariableStore |
| **DialogueManager** | `dialogue` | Typewriter effect, Rich-text markup, choice selection, i18n integration |
| **ScriptManager** | `script` | Async command node execution, multiple concurrent instances, built-in command set |
| **ActorManager** | `actor` | ActorDef definitions, state machine, trigger conditions, batch management |
| **VariableStoreManager** | `store` | Namespaced key-value storage, save system integration |
| **PlayerController** | `playerController` | Input action → physics movement, auto-detects player entity |
| **RpgMenuSystem** | `rpgMenu` | Pause menu state machine, page navigation |

---

## 3. Subsystem API Quick Reference

### 3.1 StatsSystem (`stats`)

Manages actor numeric attributes and status effects.

#### Key Events

| Event | Description |
|-------|-------------|
| `stats/profile:define` | Define an attribute template (StatProfileDef) |
| `stats/actor:init` | Initialize actor attributes (apply profile) |
| `stats/modifier:add` | Add additive or multiplicative modifier (equipment, Buff) |
| `stats/modifier:remove` | Remove a modifier |
| `stats/value:get` | Get actor's final attribute value (including all modifiers) |
| `stats/status:define` | Define a status effect (Buff/Debuff) |
| `stats/status:apply` | Apply a status effect to an actor |
| `stats/status:remove` | Remove a status effect |
| `stats/status:tick` | Trigger tick damage/healing (effects with `tickDamage`) |
| `stats/damaged` | Broadcast: actor took damage |
| `stats/healed` | Broadcast: actor was healed |
| `stats/status:applied` | Broadcast: status effect was applied |
| `stats/status:expired` | Broadcast: status effect expired |

```ts
// Initialize actor
core.events.emitSync('stats/actor:init', {
  actorId: 'hero',
  profileId: 'warrior-lv1',   // corresponds to ID defined by stats/profile:define
});

// Get final ATK (including all modifiers)
const { output } = core.events.emitSync('stats/value:get', {
  actorId: 'hero',
  stat: 'atk',
});
console.log(output.value); // computed final value

// Apply poison status
core.events.emitSync('stats/status:apply', {
  actorId: 'hero',
  statusId: 'poison',
});
```

---

### 3.2 InventorySystem (`inventory`)

Each actor has an independent inventory and equipment slots.

#### Key Events

| Event | Description |
|-------|-------------|
| `inventory/item:define` | Define an item (ItemDef) |
| `inventory/item:add` | Add item to actor's inventory |
| `inventory/item:remove` | Remove item from actor's inventory |
| `inventory/item:use` | Use an item (executes `useScriptId`) |
| `inventory/item:equip` | Equip an item (applies `equipModifiers` to StatsSystem) |
| `inventory/item:unequip` | Unequip an item |
| `inventory/list:get` | Get actor's inventory list |
| `inventory/item:added` | Broadcast: item was added |
| `inventory/item:removed` | Broadcast: item was removed |
| `inventory/item:equipped` | Broadcast: item was equipped |

```ts
// Give player an item
core.events.emitSync('inventory/item:add', {
  actorId: 'hero',
  itemId: 'potion',
  quantity: 3,
});

// Equip a weapon
core.events.emitSync('inventory/item:equip', {
  actorId: 'hero',
  itemId: 'iron-sword',
  slot: 'weapon',
});

// Query inventory
const { output } = core.events.emitSync('inventory/list:get', { actorId: 'hero' });
console.log(output.items); // [{ itemId, quantity, equipped }, ...]
```

---

### 3.3 ExperienceSystem (`exp`)

Manages actor experience points, level, and level-up flow.

#### Key Events

| Event | Description |
|-------|-------------|
| `exp/curve:define` | Define a level-up curve (ExpCurveDef) |
| `exp/actor:init` | Initialize actor level and experience |
| `exp/gain` | Award experience to actor (automatically triggers level-up) |
| `exp/level:get` | Query actor's current level |
| `exp/leveled-up` | Broadcast: actor leveled up (includes new level, old level) |

```ts
// Award EXP after winning a battle
await core.events.emit('exp/gain', {
  actorId: 'hero',
  curveId: 'warrior',   // use the warrior class level-up curve
  amount: 50,
});

// Listen for level-up event
core.events.on('game', 'exp/leveled-up', ({ actorId, oldLevel, newLevel }) => {
  showLevelUpAnimation(actorId, newLevel);
});
```

---

### 3.4 BattleSystem (`battle`)

Turn-based combat supporting multiple simultaneous battles.

#### Key Events

| Event | Description |
|-------|-------------|
| `battle/start` | Start a battle, returns `battleId` |
| `battle/action` | Declare a turn action (attack / item / flee) |
| `battle/resolve` | Resolve the turn (execute all declared actions) |
| `battle/end` | End a battle |
| `battle/combatant:defeated` | Broadcast: combatant was defeated |
| `battle/ended` | Broadcast: battle ended (includes outcome) |

```ts
// Start a battle
const { output: startOut } = await core.events.emit('battle/start', {
  allies:  [{ id: 'hero',  stats: { hp: 120, hpMax: 120, atk: 15, def: 10 } }],
  enemies: [{ id: 'slime', stats: { hp: 30,  hpMax: 30,  atk: 5,  def: 2  } }],
});
const { battleId } = startOut;

// Declare action
core.events.emitSync('battle/action', {
  battleId,
  combatantId: 'hero',
  action: { type: 'attack', targetId: 'slime' },
});

// Resolve the turn
const { output: resolveOut } = await core.events.emit('battle/resolve', { battleId });
console.log(resolveOut.log); // action log

// End battle
core.events.emitSync('battle/end', { battleId, outcome: 'victory' });
```

---

### 3.5 ShopSystem (`shop`)

Buy/sell transactions with gold managed via `VariableStoreManager`.

#### Key Events

| Event | Description |
|-------|-------------|
| `shop/define` | Define a shop (item list and prices) |
| `shop/open` | Open a shop session, returns `sessionId` |
| `shop/buy` | Purchase an item |
| `shop/sell` | Sell an item |
| `shop/close` | Close the session |

---

### 3.6 DialogueManager (`dialogue`)

Text typewriter effect, Rich-text markup, choice selection.

#### Key Events

| Event | Description |
|-------|-------------|
| `dialogue/show:text` | Display text (with typewriter effect) |
| `dialogue/advance` | Advance dialogue |
| `dialogue/show:choices` | Show choices |
| `dialogue/choice:made` | Broadcast: player selected a choice |
| `dialogue/close` | Close dialogue box |

#### Rich-text Markup

| Tag | Description |
|-----|-------------|
| `[color=#RRGGBB]text[/color]` | Text color |
| `[speed=multiplier]text[/speed]` | Typing speed (1.0 = normal, 2.0 = double speed) |
| `[pause=ms]` | Pause N milliseconds before continuing |

---

### 3.7 ScriptManager (`script`)

Async command node execution engine supporting multiple concurrent script instances.

#### Key Events

| Event | Description |
|-------|-------------|
| `script/define` | Define a script (ScriptDef) |
| `script/run` | Execute a script |
| `script/cancel` | Cancel a running script |
| `script/ended` | Broadcast: script finished executing |

#### Built-in Commands

| Command | Description |
|---------|-------------|
| `say` | Show dialogue (uses DialogueManager) |
| `choices` | Show choices, store result in variable |
| `if` | Conditional jump to `jump` label |
| `jump` | Unconditional jump |
| `label` | Define jump target |
| `wait` | Wait N milliseconds |
| `wait-event` | Wait for EventBus event |
| `emit` | Emit EventBus event |
| `call` | Call sub-script |
| `fork` | Execute sub-script concurrently |
| `store-set` | Write to VariableStore |
| `end` | End script |

---

### 3.8 ActorManager (`actor`)

Actor definitions, spawning, state machine, and trigger management.

#### Key Events

| Event | Description |
|-------|-------------|
| `actor/define` | Define ActorDef (includes scripts and triggers) |
| `actor/spawn` | Spawn an actor instance in the scene |
| `actor/despawn` | Remove actor instance from scene |
| `actor/state:set` | Set actor state (triggers state machine) |
| `actor/state:get` | Query actor state |
| `actor/spawned` | Broadcast: actor was spawned |
| `actor/despawned` | Broadcast: actor was removed |

---

### 3.9 VariableStoreManager (`store`)

Two-level namespaced key-value storage, automatically integrated with the save system.

#### Key Events

| Event | Description |
|-------|-------------|
| `store/set` | Set a single key-value pair |
| `store/get` | Query a single key-value pair |
| `store/patch` | Batch update (shallow merge) |
| `store/namespace:get` | Get entire namespace data |
| `store/changed` | Broadcast: a key-value was modified |

```ts
// Set a flag
core.events.emitSync('store/set', {
  ns: 'flags',
  key: 'tutorial.completed',
  value: true,
});

// Read it back
const { output } = core.events.emitSync('store/get', {
  ns: 'flags',
  key: 'tutorial.completed',
});
console.log(output.value); // true

// Batch update
core.events.emitSync('store/patch', {
  ns: 'player',
  patch: { gold: 500, level: 5 },
});
```

---

### 3.10 PlayerController (`playerController`)

Maps input actions to physics movement, auto-detects entities tagged with `'player'`.

```ts
// PlayerController automatically finds entities with the 'player' tag
core.events.emitSync('entity/tag:set', {
  entityId: heroEntityId,
  tags: ['player'],
});

// Set movement speed (pixels/frame)
core.events.emitSync('playerController/speed:set', { speed: 3 });
```

---

### 3.11 RpgMenuSystem (`rpgMenu`)

Pause menu state machine handling page navigation and key bindings.

```ts
// Open pause menu
core.events.emitSync('rpgMenu/open', {});

// Navigate to items page
core.events.emitSync('rpgMenu/navigate', { page: 'items' });

// Close menu
core.events.emitSync('rpgMenu/close', {});
```

---

## 4. System Integration Relationships

```
InventorySystem ──equip──► StatsSystem ◄──apply── BattleSystem
      │                        │                       │
      └──use(item)──► ScriptManager ◄──save/load── SaveManager
                           │                           │
ActorManager ──trigger──►  │ ◄──flag/variable── VariableStoreManager
                           │
DialogueManager ◄──say──── │ ──emit──► EventBus (any system)
```

**Key Integration Points:**

| Integration | Description |
|-------------|-------------|
| `InventorySystem` ↔ `StatsSystem` | Equipment automatically applies/removes `equipModifiers` |
| `InventorySystem` ↔ `ScriptManager` | Using an item executes its `useScriptId` script |
| `VariableStoreManager` ↔ `SaveManager` | All namespaces are automatically serialized on save |
| `ExperienceSystem` ↔ `StatsSystem` | After leveling up, attributes can be updated via events |
| `ShopSystem` ↔ `VariableStoreManager` | Gold is stored under the `'player'` namespace `'gold'` key |
| `ActorManager` ↔ `ScriptManager` | When trigger conditions are met, scripts execute automatically |

---

## 5. RPG Data Loading Flow

### Recommended: `registerRpgData` (one-liner)

Use `registerRpgData()` to inject a `RpgGameData` object directly into the engine, automatically handling all plugin definitions:

```ts
import { registerRpgData } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

const gameData: RpgGameData = { /* ... */ };

registerRpgData(core, gameData);
```

Or pass via `createRpgEngine`'s `gameData` option at startup for zero extra steps:

```ts
const { core } = await createRpgEngine({
  container: '#app',
  gameData,   // Automatically calls registerRpgData after engine initialization
});
```

`registerRpgData` emits the following events in order:

| Data Field | Event Emitted | Target System |
|------------|---------------|---------------|
| `classes` | `stats/profile:define` | `StatsSystem` |
| `classes` | `exp/curve:define` | `ExperienceSystem` |
| `actors` | `actor/define` | `ActorManager` |
| `items` | `inventory/item:define` | `InventorySystem` |
| `statusEffects` | `stats/status:define` | `StatsSystem` |
| `scripts` | `script/define` | `ScriptManager` |
| `meta.initialGold` | `store/set` (`player.gold`) | `VariableStoreManager` |
| `meta.initialVariables` | `store/patch` (`game` namespace) | `VariableStoreManager` |

### Advanced: Manual Injection (Full Control)

If you need to customize injection order or insert additional logic between data items, first call `loadRpgData()` to get the converted result and then inject manually:

```ts
import { loadRpgData } from '@inkshot/engine';

const data = loadRpgData(gameData);

for (const profile of data.statProfiles) {
  core.events.emitSync('stats/profile:define', { profile });
}
for (const curve of data.expCurves) {
  core.events.emitSync('exp/curve:define', { curve });
}
for (const actor of data.actors) {
  core.events.emitSync('actor/define', { def: actor });
}
for (const item of data.items) {
  core.events.emitSync('inventory/item:define', { item });
}
for (const effect of data.statusEffects) {
  core.events.emitSync('stats/status:define', { effect });
}
for (const script of data.scripts) {
  core.events.emitSync('script/define', { script });
}
if (data.initialGold > 0) {
  core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: data.initialGold });
}
if (Object.keys(data.initialVariables).length > 0) {
  core.events.emitSync('store/patch', { ns: 'game', patch: data.initialVariables });
}
```

For the complete data format specification, see [JSON Data Format Reference](../json-data-format.md).

---

## 6. Related Documents

| Document | Description |
|----------|-------------|
| [RPG Quickstart](../rpg-quickstart.md) | Build a working RPG project from scratch with full code examples |
| [JSON Data Format Reference](../json-data-format.md) | Complete specification for `RpgGameData`, script nodes, and Tilemap format |
| [Full API Reference](../../README.md) | Event contracts for all built-in plugins |
