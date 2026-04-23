# SpriteAnimator (`sprite`)

Frame-based sprite sheet animations.

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
  plugins: [/* SpriteAnimator */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `sprite/play` | sprite/play operation | Listen / Emit |
| `sprite/stop` | sprite/stop operation | Listen / Emit |
| `sprite/set-frame` | sprite/set-frame operation | Listen / Emit |
| `sprite/complete` | sprite/complete operation | Listen / Emit |

---

## Usage Examples

```ts
// Using SpriteAnimator
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
