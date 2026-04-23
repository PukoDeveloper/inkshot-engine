# FogOfWarPlugin (`fog-of-war`)

Fog of war system.

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
  plugins: [/* FogOfWarPlugin */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `fog-of-war/reveal` | fog-of-war/reveal operation | Listen / Emit |
| `fog-of-war/hide` | fog-of-war/hide operation | Listen / Emit |
| `fog-of-war/update` | fog-of-war/update operation | Listen / Emit |
| `fog-of-war/reset` | fog-of-war/reset operation | Listen / Emit |

---

## Usage Examples

```ts
// Using FogOfWarPlugin
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
