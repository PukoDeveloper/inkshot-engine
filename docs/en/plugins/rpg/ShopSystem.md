# ShopSystem (`shop`)

Shop buy/sell transaction system.

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
  plugins: [/* ShopSystem */],
});
```

---

## Event Contract

| Event | Description | Direction |
|-------|-------------|-----------|
| `shop/define` | shop/define operation | Listen / Emit |
| `shop/open` | shop/open operation | Listen / Emit |
| `shop/buy` | shop/buy operation | Listen / Emit |
| `shop/sell` | shop/sell operation | Listen / Emit |
| `shop/close` | shop/close operation | Listen / Emit |

---

## Usage Examples

```ts
// Using ShopSystem
// Call events via core.events.emit / emitSync as shown in the table above.
```

---

## Integration with Other Plugins

See the [RPG System Overview](../../rpg/README.md) and [Core Concepts](../../core-concepts.md).

---

## Common Patterns

See [Getting Started](../../getting-started.md) and related plugin docs for complete examples.
