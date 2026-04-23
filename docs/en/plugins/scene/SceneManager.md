# SceneManager (`scene`)

Scene management and async scene loading.

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
  plugins: [/* SceneManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `scene/register` | scene/register operation | Listen / Emit |
| `scene/load` | scene/load operation | Listen / Emit |
| `scene/unload` | scene/unload operation | Listen / Emit |
| `scene/preload` | scene/preload operation | Listen / Emit |
| `scene/ready` | scene/ready operation | Listen / Emit |
| `scene/changed` | scene/changed operation | Listen / Emit |
| `scene/pause` | scene/pause operation | Listen / Emit |
| `scene/resume` | scene/resume operation | Listen / Emit |

---

## Usage Examples

```ts
// Using SceneManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
