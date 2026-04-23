# GameStateManager (`gamestate`)

Finite state machine for game flow.

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
  plugins: [/* GameStateManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `gamestate/transition` | gamestate/transition operation | Listen / Emit |
| `gamestate/current:get` | gamestate/current:get operation | Listen / Emit |
| `gamestate/push` | gamestate/push operation | Listen / Emit |
| `gamestate/pop` | gamestate/pop operation | Listen / Emit |
| `gamestate/changed` | gamestate/changed operation | Listen / Emit |

---

## Usage Examples

```ts
// Using GameStateManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
