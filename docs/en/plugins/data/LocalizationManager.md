# LocalizationManager (`i18n`)

i18n locale loading and string lookup.

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
  plugins: [/* LocalizationManager */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `i18n/load` | i18n/load operation | Listen / Emit |
| `i18n/set-locale` | i18n/set-locale operation | Listen / Emit |
| `i18n/locale:get` | i18n/locale:get operation | Listen / Emit |
| `i18n/locale-changed` | i18n/locale-changed operation | Listen / Emit |

---

## Usage Examples

```ts
// Using LocalizationManager
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
