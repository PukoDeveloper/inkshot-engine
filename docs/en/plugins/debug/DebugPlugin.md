# DebugPlugin (`debug`)

Frame stats, collision overlay, and debug draw.

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
  plugins: [/* DebugPlugin */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `debug/enable` | debug/enable operation | Listen / Emit |
| `debug/disable` | debug/disable operation | Listen / Emit |
| `debug/log` | debug/log operation | Listen / Emit |
| `debug/draw` | debug/draw operation | Listen / Emit |

---

## Usage Examples

```ts
// Using DebugPlugin
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
