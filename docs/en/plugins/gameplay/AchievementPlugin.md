# AchievementPlugin (`achievement`)

Achievement unlock and tracking system.

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
  plugins: [/* AchievementPlugin */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `achievement/define` | achievement/define operation | Listen / Emit |
| `achievement/unlock` | achievement/unlock operation | Listen / Emit |
| `achievement/progress:update` | achievement/progress:update operation | Listen / Emit |
| `achievement/list:get` | achievement/list:get operation | Listen / Emit |
| `achievement/unlocked` | achievement/unlocked operation | Listen / Emit |

---

## Usage Examples

```ts
// Using AchievementPlugin
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
