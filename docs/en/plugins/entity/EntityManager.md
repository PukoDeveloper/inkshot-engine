# EntityManager (`entity`)

ECS entity creation, component management, and queries.

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
  plugins: [/* EntityManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `entity/create` | entity/create operation | Listen / Emit |
| `entity/destroy` | entity/destroy operation | Listen / Emit |
| `entity/component:add` | entity/component:add operation | Listen / Emit |
| `entity/component:remove` | entity/component:remove operation | Listen / Emit |
| `entity/component:get` | entity/component:get operation | Listen / Emit |
| `entity/query` | entity/query operation | Listen / Emit |

---

## Usage Examples

```ts
// Using EntityManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
