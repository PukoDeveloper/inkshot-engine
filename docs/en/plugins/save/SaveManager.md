# SaveManager (`save`)

Save core — manages read/write and slots.

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
  plugins: [/* SaveManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `save/save` | save/save operation | Listen / Emit |
| `save/load` | save/load operation | Listen / Emit |
| `save/delete` | save/delete operation | Listen / Emit |
| `save/list` | save/list operation | Listen / Emit |
| `save/exists` | save/exists operation | Listen / Emit |

---

## Usage Examples

```ts
// Using SaveManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
