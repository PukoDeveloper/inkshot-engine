# SettingsManager (`settings`)

User settings persistence.

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
  plugins: [/* SettingsManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `settings/set` | settings/set operation | Listen / Emit |
| `settings/get` | settings/get operation | Listen / Emit |
| `settings/reset` | settings/reset operation | Listen / Emit |
| `settings/save` | settings/save operation | Listen / Emit |
| `settings/load` | settings/load operation | Listen / Emit |

---

## Usage Examples

```ts
// Using SettingsManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
