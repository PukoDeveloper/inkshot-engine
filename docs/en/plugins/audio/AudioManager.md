# AudioManager (`audio`)

BGM, SFX, and spatial audio playback.

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
  plugins: [/* AudioManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `audio/play:bgm` | audio/play:bgm operation | Listen / Emit |
| `audio/stop:bgm` | audio/stop:bgm operation | Listen / Emit |
| `audio/play:sfx` | audio/play:sfx operation | Listen / Emit |
| `audio/stop:sfx` | audio/stop:sfx operation | Listen / Emit |
| `audio/volume:set` | audio/volume:set operation | Listen / Emit |
| `audio/volume:get` | audio/volume:get operation | Listen / Emit |

---

## Usage Examples

```ts
// Using AudioManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
