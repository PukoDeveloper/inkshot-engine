# LightingPlugin (`lighting`)

Dynamic lighting system.

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
  plugins: [/* LightingPlugin */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `lighting/add` | lighting/add operation | Listen / Emit |
| `lighting/remove` | lighting/remove operation | Listen / Emit |
| `lighting/update` | lighting/update operation | Listen / Emit |
| `lighting/ambient-set` | lighting/ambient-set operation | Listen / Emit |

---

## Usage Examples

```ts
// Using LightingPlugin
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
