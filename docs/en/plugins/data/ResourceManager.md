# ResourceManager (`assets`)

Async asset preloading and caching.

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
  plugins: [/* ResourceManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `assets/load` | assets/load operation | Listen / Emit |
| `assets/unload` | assets/unload operation | Listen / Emit |
| `assets/get` | assets/get operation | Listen / Emit |
| `assets/loaded` | assets/loaded operation | Listen / Emit |

---

## Usage Examples

```ts
// Using ResourceManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
