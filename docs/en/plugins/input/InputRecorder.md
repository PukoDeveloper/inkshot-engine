# InputRecorder (`input-recorder`)

Input recording and playback.

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
  plugins: [/* InputRecorder */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `input-recorder/start` | input-recorder/start operation | Listen / Emit |
| `input-recorder/stop` | input-recorder/stop operation | Listen / Emit |
| `input-recorder/play` | input-recorder/play operation | Listen / Emit |
| `input-recorder/frame` | input-recorder/frame operation | Listen / Emit |

---

## Usage Examples

```ts
// Using InputRecorder
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
