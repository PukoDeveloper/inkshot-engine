# DialogueManager (`dialogue`)

Dialogue system with typewriter effect, rich text, and choices.

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
  plugins: [/* DialogueManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `dialogue/show:text` | dialogue/show:text operation | Listen / Emit |
| `dialogue/advance` | dialogue/advance operation | Listen / Emit |
| `dialogue/show:choices` | dialogue/show:choices operation | Listen / Emit |
| `dialogue/choice:made` | dialogue/choice:made operation | Listen / Emit |
| `dialogue/close` | dialogue/close operation | Listen / Emit |

---

## Usage Examples

```ts
// Using DialogueManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
