# ExperienceSystem (`exp`)

Experience accumulation, leveling, and level management.

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
  plugins: [/* ExperienceSystem */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `exp/curve:define` | exp/curve:define operation | Listen / Emit |
| `exp/actor:init` | exp/actor:init operation | Listen / Emit |
| `exp/gain` | exp/gain operation | Listen / Emit |
| `exp/level:get` | exp/level:get operation | Listen / Emit |
| `exp/leveled-up` | exp/leveled-up operation | Listen / Emit |

---

## Usage Examples

```ts
// Using ExperienceSystem
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
