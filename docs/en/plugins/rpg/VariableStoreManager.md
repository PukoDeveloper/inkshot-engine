# VariableStoreManager (`store`)

Namespaced key-value game variable store.

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
  plugins: [/* VariableStoreManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `store/set` | store/set operation | Listen / Emit |
| `store/get` | store/get operation | Listen / Emit |
| `store/patch` | store/patch operation | Listen / Emit |
| `store/namespace:get` | store/namespace:get operation | Listen / Emit |
| `store/changed` | store/changed operation | Listen / Emit |

---

## Usage Examples

```ts
// Using VariableStoreManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
