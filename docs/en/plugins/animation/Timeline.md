# Timeline (`animation`)

Keyframe-based sequenced tween timelines.

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
  plugins: [/* Timeline */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `timeline/create` | timeline/create operation | Listen / Emit |
| `timeline/start` | timeline/start operation | Listen / Emit |
| `timeline/pause` | timeline/pause operation | Listen / Emit |
| `timeline/resume` | timeline/resume operation | Listen / Emit |
| `timeline/complete` | timeline/complete operation | Listen / Emit |

---

## Usage Examples

```ts
// Using Timeline
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
