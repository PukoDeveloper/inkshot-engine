# TilemapManager (`tilemap`)

Tilemap rendering with multi-layer support.

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
  plugins: [/* TilemapManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `tilemap/load` | tilemap/load operation | Listen / Emit |
| `tilemap/unload` | tilemap/unload operation | Listen / Emit |
| `tilemap/tile:get` | tilemap/tile:get operation | Listen / Emit |
| `tilemap/tile:set` | tilemap/tile:set operation | Listen / Emit |
| `tilemap/layer:get` | tilemap/layer:get operation | Listen / Emit |

---

## Usage Examples

```ts
// Using TilemapManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
