# RapierPhysicsAdapter (`physics`)

Rapier WASM high-performance physics.

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
  plugins: [/* RapierPhysicsAdapter */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `physics/body-add` | physics/body-add operation | Listen / Emit |
| `physics/body-remove` | physics/body-remove operation | Listen / Emit |
| `physics/collide` | physics/collide operation | Listen / Emit |
| `physics/step` | physics/step operation | Listen / Emit |

---

## Usage Examples

```ts
// Using RapierPhysicsAdapter
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
