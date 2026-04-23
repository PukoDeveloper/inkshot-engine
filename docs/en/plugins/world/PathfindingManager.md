# PathfindingManager (`pathfinding`)

A* pathfinding system.

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
  plugins: [/* PathfindingManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `pathfinding/find` | pathfinding/find operation | Listen / Emit |
| `pathfinding/cancel` | pathfinding/cancel operation | Listen / Emit |
| `pathfinding/result` | pathfinding/result operation | Listen / Emit |
| `pathfinding/update-map` | pathfinding/update-map operation | Listen / Emit |

---

## Usage Examples

```ts
// Using PathfindingManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
