# StatsSystem (`stats`)

Character attributes, modifiers, and status effects.

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
  plugins: [/* StatsSystem */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `stats/profile:define` | stats/profile:define operation | Listen / Emit |
| `stats/actor:init` | stats/actor:init operation | Listen / Emit |
| `stats/value:get` | stats/value:get operation | Listen / Emit |
| `stats/modifier:add` | stats/modifier:add operation | Listen / Emit |
| `stats/status:apply` | stats/status:apply operation | Listen / Emit |
| `stats/status:remove` | stats/status:remove operation | Listen / Emit |
| `stats/damaged` | stats/damaged operation | Listen / Emit |
| `stats/healed` | stats/healed operation | Listen / Emit |

---

## Usage Examples

```ts
// Using StatsSystem
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
