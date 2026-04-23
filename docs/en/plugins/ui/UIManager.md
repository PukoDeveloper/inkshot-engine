# UIManager (`ui`)

UI component system (Button, Label, Panel, Dialog, etc.).

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
  plugins: [/* UIManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `ui/create` | ui/create operation | Listen / Emit |
| `ui/destroy` | ui/destroy operation | Listen / Emit |
| `ui/show` | ui/show operation | Listen / Emit |
| `ui/hide` | ui/hide operation | Listen / Emit |
| `ui/update` | ui/update operation | Listen / Emit |
| `ui/event` | ui/event operation | Listen / Emit |

---

## Usage Examples

```ts
// Using UIManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
