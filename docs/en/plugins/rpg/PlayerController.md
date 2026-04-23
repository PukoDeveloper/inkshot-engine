# PlayerController (`playerController`)

Input-to-physics player movement controller.

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
  plugins: [/* PlayerController */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `player/move` | player/move operation | Listen / Emit |
| `player/interact` | player/interact operation | Listen / Emit |
| `player/attack` | player/attack operation | Listen / Emit |
| `player/state:get` | player/state:get operation | Listen / Emit |
| `playerController/speed:set` | playerController/speed:set operation | Listen / Emit |

---

## Usage Examples

```ts
// Using PlayerController
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
