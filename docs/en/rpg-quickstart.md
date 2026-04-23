# RPG Quickstart Guide

This guide explains how to use **inkshot-engine**'s RPG features to build a working RPG project from scratch.  
The entire workflow requires no external tools — all data is defined in TypeScript / JSON.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Initializing the Engine](#2-initializing-the-engine)
3. [Defining Game Data](#3-defining-game-data)
   - [3-1 Classes and Experience Curves](#3-1-classes-and-experience-curves)
   - [3-2 Actors](#3-2-actors)
   - [3-3 Items](#3-3-items)
   - [3-4 Status Effects (Buffs / Debuffs)](#3-4-status-effects-buffs--debuffs)
   - [3-5 Scripts](#3-5-scripts)
4. [Loading Data into the Engine](#4-loading-data-into-the-engine)
5. [Battle Flow](#5-battle-flow)
6. [Dialogue System](#6-dialogue-system)
7. [Shop System](#7-shop-system)
8. [Save and Load](#8-save-and-load)
9. [Complete Example](#9-complete-example)
10. [EventBus Quick Reference](#10-eventbus-quick-reference)

---

## 1. Installation

```bash
npm install @inkshot/engine
```

> The engine is published as an ES Module. Make sure your project has `"type": "module"` set, or use a bundler (Vite, Webpack, etc.).

---

## 2. Initializing the Engine

Use `createRpgEngine` to start the engine with the full RPG plugin suite in one line.  
Pass game data via the optional `gameData` field to auto-inject all definitions when the engine is ready:

```ts
import { createRpgEngine } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

const gameData: RpgGameData = { /* see Section 3 for details */ };

const { core, rpg } = await createRpgEngine({
  container: '#app',   // DOM selector for mounting the Canvas
  width: 1280,
  height: 720,
  dataRoot: '/assets/',
  gameData,            // ← Auto-injects all RPG definitions, no extra loop needed
});

console.log('Engine started and data loaded!');
```

If you don't want to pass data at startup, you can call `registerRpgData` at any time:

```ts
import { createRpgEngine, registerRpgData } from '@inkshot/engine';

const { core, rpg } = await createRpgEngine({ container: '#app', width: 1280, height: 720 });
registerRpgData(core, gameData);   // Same effect as passing gameData above
```

`createRpgEngine` automatically initializes the following subsystems:

| Subsystem | Access Path | Description |
|-----------|------------|-------------|
| Stats | `rpg.stats` | Actor base attributes, equipment bonuses, status effects |
| Inventory | `rpg.inventory` | Pick up, use, and equip items |
| Shop | `rpg.shop` | Buy and sell transactions |
| Experience | `rpg.exp` | Level-up and EXP curves |
| Battle | `rpg.battle` | Turn-based combat |
| Script | `rpg.script` | NPC behavior scripts, cutscene events |
| Dialogue | `rpg.dialogue` | Text typewriter |
| Actor | `rpg.actor` | Actor instance management |
| Variable Store | `rpg.variableStore` | Global flags and variables |
| Menu | `rpg.menu` | RPG pause menu |

---

## 3. Defining Game Data

All game data is described in an `RpgGameData` object, then passed to `loadRpgData()` for conversion to the engine-readable format.  
You can define it directly in code, or `fetch` from a JSON file and pass it in.

```ts
import { loadRpgData } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

const gameData: RpgGameData = {
  // See subsections below for details
};

const data = loadRpgData(gameData);
```

---

### 3-1 Classes and Experience Curves

The `classes` array defines base stats and level-up curves per class.  
Each class automatically generates a **StatProfile** (level 1 attributes) and an **ExpCurve** (experience required to level up).

```ts
classes: [
  {
    id: 'warrior',
    name: 'Warrior',
    expCurve: {
      base: 30,       // Base coefficient
      exp: 2,         // Exponent (default 2 = quadratic curve)
      extra: 5,       // Extra linear coefficient (default 0)
      maxLevel: 99,   // Maximum level (default 99)
    },
    baseStats: {
      hp: 120, hpMax: 120,
      mp: 20,  mpMax: 20,
      atk: 15, def: 10, agi: 8, luk: 5,
    },
  },
  {
    id: 'mage',
    name: 'Mage',
    expCurve: { base: 25, exp: 2 },
    baseStats: {
      hp: 60,  hpMax: 60,
      mp: 100, mpMax: 100,
      atk: 6,  def: 4, agi: 10, luk: 8,
    },
  },
],
```

**Level-up formula:** `exp(level) = base × level ^ exp + extra × level`

> **Tip:** If only one of `hp` / `hpMax` is provided, `loadRpgData` will automatically fill in the other.

---

### 3-2 Actors

The `actors` array defines the types of characters that can be spawned on the map (player, NPCs, bosses, etc.).  
Each actor can carry scripts and triggers that describe its behavior.

```ts
actors: [
  {
    id: 'hero',
    name: 'Hero',
    classId: 'warrior',     // corresponds to classes[].id
    initialLevel: 1,
    initialState: {
      isPartyLeader: true,  // custom initial state
    },
    scripts: [
      {
        id: 'hero-idle',
        nodes: [
          { cmd: 'wait', duration: 3000 },
          { cmd: 'say', text: '...' },
        ],
      },
    ],
    triggers: [
      {
        id: 'on-spawn',
        event: 'actor/spawned',
        script: 'hero-idle',
        mode: 'concurrent',   // 'concurrent' | 'blocking'
      },
    ],
  },
  {
    id: 'merchant',
    name: 'Merchant',
    scripts: [
      {
        id: 'merchant-greet',
        nodes: [
          { cmd: 'say', text: 'Welcome! What can I do for you?', speaker: 'Merchant' },
        ],
      },
    ],
    triggers: [
      {
        id: 'on-interact',
        event: 'player/interact',
        script: 'merchant-greet',
        mode: 'blocking',
        onEnd: 'restore',     // restore original script after dialogue ends
      },
    ],
  },
],
```

#### Trigger Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique within this actor |
| `event` | `string` | EventBus event name that triggers this |
| `script` | `string` | Script ID to execute |
| `mode` | `'concurrent' \| 'blocking'` | `concurrent` = runs alongside other scripts; `blocking` = takes over main execution channel |
| `priority` | `number` | Blocking priority, default `10` |
| `onEnd` | `'restore' \| 'nothing' \| string` | Action after script ends; `'restore'` = re-run the preempted script |

---

### 3-3 Items

The `items` array defines all items, weapons, armor, and key items.

```ts
items: [
  // Consumable
  {
    id: 'potion',
    name: 'Potion',
    description: 'Restores 50 HP',
    category: 'item',    // 'item' | 'weapon' | 'armor' | 'accessory' | 'key'
    price: 50,
    maxStack: 99,
    useScriptId: 'use-potion',   // script ID to run when used (optional)
  },
  // Weapon
  {
    id: 'iron-sword',
    name: 'Iron Sword',
    description: 'ATK +10',
    category: 'weapon',
    price: 200,
    maxStack: 1,
    equipModifiers: [
      { stat: 'atk', value: 10, mode: 'add' },
    ],
  },
  // Armor
  {
    id: 'leather-armor',
    name: 'Leather Armor',
    description: 'DEF +5',
    category: 'armor',
    price: 150,
    maxStack: 1,
    equipModifiers: [
      { stat: 'def', value: 5, mode: 'add' },
    ],
  },
  // Key item (cannot be discarded)
  {
    id: 'dungeon-key',
    name: 'Dungeon Key',
    category: 'key',
    price: 0,
  },
],
```

#### Equipment Modifier Modes (`mode`)

| Value | Description |
|-------|-------------|
| `'add'` | Add directly: `atk + 10` |
| `'multiply'` | Multiply by rate: `atk × 1.5` |

---

### 3-4 Status Effects (Buffs / Debuffs)

`statusEffects` defines temporary effects that can be applied to actors.

```ts
statusEffects: [
  {
    id: 'poison',
    name: 'Poison',
    modifiers: [
      { stat: 'agi', value: 0.9, mode: 'multiply' },  // AGI ×0.9
    ],
    duration: 15000,   // lasts 15 seconds (milliseconds)
    tickDamage: 5,     // deal 5 HP per tick (positive = damage)
    tickMs: 1000,      // trigger every 1 second
  },
  {
    id: 'haste',
    name: 'Haste',
    modifiers: [
      { stat: 'agi', value: 1.5, mode: 'multiply' },  // AGI ×1.5
    ],
    duration: 10000,   // lasts 10 seconds
  },
  {
    id: 'regen',
    name: 'Regen',
    modifiers: [],
    tickDamage: -20,   // negative = healing
    tickMs: 2000,
    // duration omitted = permanent effect, must be manually removed
  },
],
```

---

### 3-5 Scripts

Standalone scripts (not attached to any actor) are suitable for cutscenes, event triggers, and more.

```ts
scripts: [
  {
    id: 'opening-cutscene',
    nodes: [
      { cmd: 'say',     text: 'In a distant kingdom, a dark force was awakening...', speaker: 'Narrator' },
      { cmd: 'wait',    ms: 2000 },
      { cmd: 'say',     text: 'Hero, rise!', speaker: 'King' },
      { cmd: 'choices', choices: ['I am ready', 'Give me a moment'], var: '$hero_choice' },
      { cmd: 'if',      var: '$hero_choice', value: 0, jump: 'ready' },
      { cmd: 'say',     text: 'No hesitation — there is no time!', speaker: 'King' },
      { cmd: 'label',   name: 'ready' },
      { cmd: 'end' },
    ],
  },
],
```

#### Built-in Script Commands

| `cmd` | Parameters | Description |
|-------|-----------|-------------|
| `say` | `text`, `speaker?`, `portrait?` | Show dialogue (typewriter effect); `text` supports `{$var}` interpolation and `[tag]` markup |
| `choices` | `choices[]`, `var` | Show choices (supports `{$var}` interpolation), store result in `var` |
| `if` | `var`, `op?`, `value`, `jump` | Conditional jump; `op`: `eq` (default) `ne` `gt` `lt` `gte` `lte` |
| `set` | `var`, `value` | Write to script variable (`$name`) or persistent store (`$ns.key`) |
| `wait` | `ms` | Wait specified milliseconds |
| `label` | `name` | Define jump target |
| `jump` | `target` | Unconditional jump to label |
| `call` | `scriptId` | Call another script (subroutine) |
| `emit` | `event`, `params?` | Emit EventBus event |
| `end` | — | End script |

#### Variable Reference Format

| Format | Corresponds To |
|--------|---------------|
| `$name` | Script local variable `vars.name` |
| `$ns.key` | Persistent variable store (`store/get` `store/set`) |

In `say` and `choices` text fields, embed `{$name}` or `{$ns.key}` placeholders for automatic substitution at runtime:

```ts
{ cmd: 'say', text: 'Your HP: {$player.hp}, Gold: {$gold}' }
```

---

## 4. Loading Data into the Engine

### Recommended: `registerRpgData` (one step)

Call `registerRpgData(core, gameData)` to automatically inject all definitions into the engine:

```ts
import { registerRpgData } from '@inkshot/engine';

registerRpgData(core, gameData);
// ✅ Done! All actors, items, classes, status effects, and scripts are injected.
```

Equivalent to passing the `gameData` option when calling `createRpgEngine` (see Section 2).

### Advanced: Manual Injection (Full Control)

If you need to insert custom logic between data items, first call `loadRpgData()` for the converted result then inject manually:

```ts
import { loadRpgData } from '@inkshot/engine';

async function loadGameData(core) {
  const data = loadRpgData(gameData);

  // 1. Base attribute profiles (must come before actors)
  for (const profile of data.statProfiles) {
    core.events.emitSync('stats/profile:define', { profile });
  }

  // 2. Experience curves
  for (const curve of data.expCurves) {
    core.events.emitSync('exp/curve:define', { curve });
  }

  // 3. Actor definitions (includes scripts and triggers)
  for (const actor of data.actors) {
    core.events.emitSync('actor/define', { def: actor });
  }

  // 4. Item definitions
  for (const item of data.items) {
    core.events.emitSync('inventory/item:define', { item });
  }

  // 5. Status effect definitions
  for (const effect of data.statusEffects) {
    core.events.emitSync('stats/status:define', { effect });
  }

  // 6. Standalone scripts
  for (const script of data.scripts) {
    core.events.emitSync('script/define', { script });
  }

  // 7. Initialize global variables and starting gold
  if (Object.keys(data.initialVariables).length > 0) {
    core.events.emitSync('store/patch', { ns: 'game', patch: data.initialVariables });
  }
  if (data.initialGold > 0) {
    core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: data.initialGold });
  }
}
```

---

## 5. Battle Flow

`BattleSystem` uses a **turn-based** architecture and supports multiple simultaneous battles.

```ts
// 1. Start a battle
const { battleId } = await core.events.emit('battle/start', {
  allies: [
    { id: 'hero',  stats: { hp: 120, hpMax: 120, atk: 15, def: 10 } },
  ],
  enemies: [
    { id: 'slime', stats: { hp: 30,  hpMax: 30,  atk: 5,  def: 2  } },
  ],
});

// 2. Declare actions (one per combatant)
core.events.emitSync('battle/action', {
  battleId,
  combatantId: 'hero',
  action: { type: 'attack', targetId: 'slime' },
});

// 3. Resolve the turn
const result = await core.events.emit('battle/resolve', { battleId });
console.log(result.log);   // array of action records

// 4. End battle after victory
core.events.emitSync('battle/end', { battleId, outcome: 'victory' });
```

#### Action Types (`action.type`)

| Type | Description |
|------|-------------|
| `'attack'` | Physical attack, requires `targetId` |
| `'item'` | Use item, requires `targetId` and `itemId` |
| `'flee'` | Flee (outcome becomes `'fled'`) |

#### Listening to Battle Events

```ts
core.events.on('battle', 'battle/combatant:defeated', ({ combatantId }) => {
  console.log(`${combatantId} was defeated!`);
});

core.events.on('battle', 'battle/ended', async ({ battleId, outcome }) => {
  if (outcome === 'victory') {
    // Award experience
    await core.events.emit('exp/gain', {
      actorId: 'hero',
      curveId: 'warrior',
      amount: 50,
    });
  }
});
```

---

## 6. Dialogue System

### Triggering Dialogue via Script (Recommended)

```ts
core.events.emitSync('script/run', {
  id: 'opening-cutscene',
  instanceId: 'cutscene',
});
```

### Manual Dialogue Control

```ts
// Show text
core.events.emitSync('dialogue/show-text', {
  text: 'Welcome to my shop!',
  speaker: 'Merchant',
});

// Wait for player to press confirm and advance
core.events.emitSync('dialogue/advance', {});

// Show choices
core.events.emitSync('dialogue/show-choices', {
  choices: ['Buy', 'Sell', 'Leave'],
});

// After player selects
core.events.on('dialogue', 'dialogue/choice:made', ({ index }) => {
  console.log(`Player selected option ${index}`);
});
```

### Dialogue Markup Syntax

The `say` command's `text` supports the following inline markup:

| Markup | Description | Example |
|--------|-------------|---------|
| `[color=#FF0000]red[/color]` | Text color | `[color=#FFD700]Gold[/color]` |
| `[speed=0.5]slow[/speed]` | Typing speed multiplier | `[speed=2]fast text[/speed]` |
| `[pause=500]` | Pause N milliseconds | `Hello[pause=1000], friend.` |

---

## 7. Shop System

```ts
// 1. Define a shop
core.events.emitSync('shop/define', {
  shop: {
    id: 'town-shop',
    name: 'Village Shop',
    stock: [
      { itemId: 'potion',       price: 50  },
      { itemId: 'iron-sword',   price: 200 },
      { itemId: 'leather-armor', price: 150 },
    ],
  },
});

// 2. Open shop (customer ID = buyer actor ID)
const { sessionId } = await core.events.emit('shop/open', {
  shopId: 'town-shop',
  customerId: 'hero',
});

// 3. Purchase
const buyResult = await core.events.emit('shop/buy', {
  sessionId,
  itemId: 'potion',
  quantity: 3,
});
console.log(buyResult.success, buyResult.remainingGold);

// 4. Sell
await core.events.emit('shop/sell', {
  sessionId,
  itemId: 'iron-sword',
  quantity: 1,
});

// 5. Close
core.events.emitSync('shop/close', { sessionId });
```

> **Gold storage:** Gold is stored in `VariableStoreManager` under the `'player'` namespace, key `'gold'`.  
> Set initial gold like this:
> ```ts
> core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 500 });
> ```

---

## 8. Save and Load

```ts
// Save to slot 1
await core.events.emit('save/slot:save', { slot: 1 });

// Load slot 1
const { data, loaded } = await core.events.emit('save/slot:load', { slot: 1 });
if (loaded) {
  console.log('Save loaded successfully');
}

// List all save slots
const { slots } = await core.events.emit('save/slot:list', {});
```

---

## 9. Complete Example

The following is a complete flow from engine startup to the first battle (using `registerRpgData` for one-shot injection):

```ts
import { createRpgEngine, registerRpgData } from '@inkshot/engine';
import type { RpgGameData } from '@inkshot/engine';

// ── 1. Define game data ────────────────────────────────────────────────────
const gameData: RpgGameData = {
  meta: {
    title: 'Hero Legend',
    version: '1.0.0',
    locale: 'en',
    initialGold: 100,
  },
  classes: [
    {
      id: 'warrior',
      name: 'Warrior',
      expCurve: { base: 30, exp: 2, extra: 5 },
      baseStats: { hp: 120, hpMax: 120, mp: 20, mpMax: 20, atk: 15, def: 10, agi: 8, luk: 5 },
    },
  ],
  actors: [
    {
      id: 'hero',
      name: 'Hero',
      classId: 'warrior',
      initialLevel: 1,
    },
    {
      id: 'merchant',
      name: 'Merchant',
      scripts: [
        {
          id: 'merchant-dialogue',
          nodes: [
            { cmd: 'say',     text: 'Welcome!', speaker: 'Merchant' },
            { cmd: 'choices', choices: ['Buy', 'Leave'], var: '$choice' },
            { cmd: 'if',      var: '$choice', value: 1, jump: 'bye' },
            { cmd: 'emit', event: 'shop/open', params: { shopId: 'town-shop', customerId: 'hero' } },
            { cmd: 'label', name: 'bye' },
            { cmd: 'end' },
          ],
        },
      ],
      triggers: [
        {
          id: 'on-interact',
          event: 'player/interact',
          script: 'merchant-dialogue',
          mode: 'blocking',
          onEnd: 'restore',
        },
      ],
    },
  ],
  items: [
    { id: 'potion',      name: 'Potion',     category: 'item',   price: 50,  maxStack: 99 },
    { id: 'iron-sword',  name: 'Iron Sword', category: 'weapon', price: 200, maxStack: 1,
      equipModifiers: [{ stat: 'atk', value: 10, mode: 'add' }] },
  ],
  statusEffects: [
    { id: 'poison', name: 'Poison', modifiers: [], duration: 15000, tickDamage: 5, tickMs: 1000 },
  ],
};

// ── 2. Start engine and inject data simultaneously (simplest form) ─────────
const { core, rpg } = await createRpgEngine({
  container: '#app',
  width: 1280,
  height: 720,
  gameData,   // ← completes all definition injection in one step
});

// ── 3. Spawn player actor ──────────────────────────────────────────────────
const { instance } = await core.events.emit('actor/spawn', {
  actorType: 'hero',
  instanceId: 'player',
});

// Set actor base attributes (level 1)
core.events.emitSync('stats/base:set', {
  actorId: 'player',
  patch: { hp: 120, hpMax: 120, mp: 20, mpMax: 20, atk: 15, def: 10, agi: 8, luk: 5 },
});

// ── 4. Define shop ────────────────────────────────────────────────────────
core.events.emitSync('shop/define', {
  shop: {
    id: 'town-shop',
    name: 'Village Shop',
    stock: [
      { itemId: 'potion',     price: 50  },
      { itemId: 'iron-sword', price: 200 },
    ],
  },
});

// ── 5. Start a battle ─────────────────────────────────────────────────────
const { battleId } = await core.events.emit('battle/start', {
  allies:  [{ id: 'player', stats: { hp: 120, hpMax: 120, atk: 15, def: 10 } }],
  enemies: [{ id: 'slime',  stats: { hp: 30,  hpMax: 30,  atk: 5,  def: 2  } }],
});

core.events.emitSync('battle/action', {
  battleId,
  combatantId: 'player',
  action: { type: 'attack', targetId: 'slime' },
});

const result = await core.events.emit('battle/resolve', { battleId });
console.log('Battle resolved:', result.log);
```

---

## 10. EventBus Quick Reference

### Actor

| Event | Description |
|-------|-------------|
| `actor/define` | Register actor type definition |
| `actor/spawn` | Spawn actor instance |
| `actor/despawn` | Remove actor instance |
| `actor/state:set` | Set single actor state key |
| `actor/state:patch` | Batch update actor state |
| `actor/state:get` | Read actor state |
| `actor/trigger` | Manually trigger actor trigger |

### Stats

| Event | Description |
|-------|-------------|
| `stats/profile:define` | Register class stat profile |
| `stats/status:define` | Register status effect definition |
| `stats/base:set` | Set actor base attributes |
| `stats/base:get` | Read base attributes |
| `stats/modifier:add` | Add equipment / buff modifier |
| `stats/modifier:remove` | Remove modifier |
| `stats/compute` | Compute full attributes (including all modifiers) |
| `stats/status:apply` | Apply status effect |
| `stats/status:remove` | Remove status effect |

### Inventory

| Event | Description |
|-------|-------------|
| `inventory/item:define` | Register item definition |
| `inventory/add` | Add item |
| `inventory/remove` | Remove item |
| `inventory/use` | Use item |
| `inventory/equip` | Equip item |
| `inventory/unequip` | Unequip item |
| `inventory/list` | List actor inventory |
| `inventory/has` | Check if actor has an item |

### Experience

| Event | Description |
|-------|-------------|
| `exp/curve:define` | Register level-up curve |
| `exp/gain` | Gain experience (auto-handles level-up) |
| `exp/set` | Directly set experience value |
| `exp/get` | Read current experience and level |

### Battle

| Event | Description |
|-------|-------------|
| `battle/start` | Start battle |
| `battle/action` | Declare action |
| `battle/resolve` | Resolve current turn |
| `battle/end` | End battle |
| `battle/state:get` | Read battle state |

### Script

| Event | Description |
|-------|-------------|
| `script/define` | Register script |
| `script/run` | Execute script |
| `script/stop` | Stop script |
| `script/register-command` | Add custom command |
| `script/state:get` | Read script execution state |

### Dialogue

| Event | Description |
|-------|-------------|
| `dialogue/show-text` | Show text |
| `dialogue/show-choices` | Show choices |
| `dialogue/advance` | Advance dialogue |
| `dialogue/choice` | Select choice |
| `dialogue/end` | Force end dialogue |
| `dialogue/state:get` | Read dialogue state |

### Shop

| Event | Description |
|-------|-------------|
| `shop/define` | Register shop |
| `shop/open` | Open shop |
| `shop/buy` | Buy item |
| `shop/sell` | Sell item |
| `shop/close` | Close shop |

---

> For more advanced usage, see the type definitions in each subsystem's API (`src/types/` directory).
