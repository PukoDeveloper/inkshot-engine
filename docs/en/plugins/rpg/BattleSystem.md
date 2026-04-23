# BattleSystem (`battle`)

Turn-based combat system.

---

## Table of Contents

1. [Installation & Setup](#installation--setup)
2. [Event Contract](#event-contract)
3. [Usage Examples](#usage-examples)
4. [Integration with Other Plugins](#integration-with-other-plugins)
5. [Common Patterns](#common-patterns)

---

## Installation & Setup

```ts
import { createEngine } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [/* BattleSystem */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `battle/start` | battle/start operation | Listen / Emit |
| `battle/end` | battle/end operation | Listen / Emit |
| `battle/action` | battle/action operation | Listen / Emit |
| `battle/resolve` | battle/resolve operation | Listen / Emit |
| `battle/turn-start` | battle/turn-start operation | Listen / Emit |
| `battle/turn-end` | battle/turn-end operation | Listen / Emit |
| `battle/combatant:defeated` | battle/combatant:defeated operation | Listen / Emit |
| `battle/ended` | battle/ended operation | Listen / Emit |

---

## Usage Examples

```ts
// Using BattleSystem
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
