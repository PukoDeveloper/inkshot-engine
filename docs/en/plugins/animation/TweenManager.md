# TweenManager (`animation`)

Property tweening and easing animations.

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
  plugins: [/* TweenManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `tween/create` | tween/create operation | Listen / Emit |
| `tween/cancel` | tween/cancel operation | Listen / Emit |
| `tween/pause` | tween/pause operation | Listen / Emit |
| `tween/resume` | tween/resume operation | Listen / Emit |
| `tween/complete` | tween/complete operation | Listen / Emit |

---

## Usage Examples

```ts
// Using TweenManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
