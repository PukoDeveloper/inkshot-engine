# TilemapEditorPlugin (`mapeditor`)

In-browser lightweight visual tile map editor.

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
  plugins: [/* TilemapEditorPlugin */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `mapeditor/open` | mapeditor/open operation | Listen / Emit |
| `mapeditor/close` | mapeditor/close operation | Listen / Emit |
| `mapeditor/tile-paint` | mapeditor/tile-paint operation | Listen / Emit |
| `mapeditor/save` | mapeditor/save operation | Listen / Emit |

---

## Usage Examples

```ts
// Using TilemapEditorPlugin
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
