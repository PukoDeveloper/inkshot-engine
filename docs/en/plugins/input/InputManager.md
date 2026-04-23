# InputManager (`input`)

Keyboard, mouse, gamepad, and touch input.

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
  plugins: [/* InputManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `input/keydown` | input/keydown operation | Listen / Emit |
| `input/keyup` | input/keyup operation | Listen / Emit |
| `input/mousedown` | input/mousedown operation | Listen / Emit |
| `input/mouseup` | input/mouseup operation | Listen / Emit |
| `input/mousemove` | input/mousemove operation | Listen / Emit |
| `input/gamepad-button` | input/gamepad-button operation | Listen / Emit |
| `input/touch-start` | input/touch-start operation | Listen / Emit |
| `input/touch-end` | input/touch-end operation | Listen / Emit |

---

## Usage Examples

```ts
// Using InputManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
