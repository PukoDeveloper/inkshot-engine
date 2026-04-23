# DataManager (`data`)

Key-value in-memory runtime data store.

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
  plugins: [/* DataManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `data/set` | data/set operation | Listen / Emit |
| `data/get` | data/get operation | Listen / Emit |
| `data/delete` | data/delete operation | Listen / Emit |
| `data/patch` | data/patch operation | Listen / Emit |
| `data/changed` | data/changed operation | Listen / Emit |

---

## Usage Examples

```ts
// Using DataManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
