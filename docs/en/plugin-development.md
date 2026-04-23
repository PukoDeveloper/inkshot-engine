# Custom Plugin Development Guide

This guide explains how to write an inkshot-engine plugin from scratch, covering the complete workflow: structure design, event naming, type definitions, testing, and publishing to `src/index.ts`.

---

## Table of Contents

1. [Minimal Plugin Structure](#1-minimal-plugin-structure)
2. [Event Naming Conventions](#2-event-naming-conventions)
3. [Output Type Design](#3-output-type-design)
4. [Full Example: CounterPlugin](#4-full-example-counterplugin)
   - [Type Definitions](#41-type-definitions)
   - [Plugin Implementation](#42-plugin-implementation)
   - [Tests](#43-tests)
   - [Public API](#44-public-api)
5. [Depending on Other Plugins](#5-depending-on-other-plugins)
6. [Async Operations](#6-async-operations)
7. [Using Event Phases to Extend Behavior](#7-using-event-phases-to-extend-behavior)
8. [Resource and Side-effect Cleanup](#8-resource-and-side-effect-cleanup)
9. [Plugin Development Rules Summary](#9-plugin-development-rules-summary)

---

## 1. Minimal Plugin Structure

Every plugin is a class implementing the `EnginePlugin` interface:

```ts
// src/plugins/MyPlugin.ts
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';

export class MyPlugin implements EnginePlugin {
  readonly namespace = 'myPlugin';     // Unique identifier, matches event prefix

  // Optional: declare dependencies on other plugins
  // readonly dependencies = ['entity', 'assets'] as const;

  init(core: Core): void {
    // ① Initialize internal state
    // ② Register all event listeners
    core.events.on(this.namespace, 'myPlugin/do-something', (params, output) => {
      output.result = 'done';
    });
  }

  destroy(core: Core): void {
    // Release non-event resources (WebGL objects, Web Workers, timers, etc.)
    // EventBus listeners are auto-cleared by core.events.removeNamespace(this.namespace)
  }
}
```

> **Note:** Plugin files go in `src/plugins/` (general) or `src/plugins/rpg/` (RPG-specific).

---

## 2. Event Naming Conventions

All events use the `<namespace>/<event-name>` format:

```
audio/play          ← command (consumer instructs the plugin)
audio/played        ← notification (plugin broadcasts result)
save/slot:save      ← command with sub-resource
save/slot:saved     ← notification
entity/position:get ← query (read operation with return value)
```

| Type | Naming Pattern | Example |
|------|---------------|---------|
| Command (Consumer → Plugin) | Verb form | `audio/play`, `scene/load`, `inventory/item:use` |
| Notification (Plugin → Broadcast) | Past tense | `audio/played`, `scene/changed`, `inventory/item:used` |
| Query (with return value) | Ends with `:get` | `save/slot:get`, `entity/position:get`, `timer/cooldown` |

---

## 3. Output Type Design

### Params Type (Input)

Use `readonly` fields to prevent handlers from accidentally modifying them:

```ts
// src/types/myPlugin.ts
export interface MyPluginDoSomethingParams {
  readonly id: string;
  readonly value?: number;
}
```

### Output Type (Return)

Fields are **not** `readonly`, because handlers need to write to them:

```ts
export interface MyPluginDoSomethingOutput {
  result: string;
  processed: boolean;
}
```

### Notification Payload

Parameters for notification events (broadcasts) also use `readonly`:

```ts
export interface MyPluginDoneParams {
  readonly id: string;
  readonly result: string;
}
```

---

## 4. Full Example: CounterPlugin

Here's a complete development workflow using a **counter plugin** as an example.

### 4.1 Type Definitions

```ts
// src/types/counter.ts

/** Increment counter */
export interface CounterIncrementParams {
  readonly id: string;
  readonly amount?: number;  // default 1
}
export interface CounterIncrementOutput {
  value: number;
}

/** Get counter value */
export interface CounterGetParams {
  readonly id: string;
}
export interface CounterGetOutput {
  value: number;
  found: boolean;
}

/** Reset counter */
export interface CounterResetParams {
  readonly id: string;
}

/** Broadcast: counter reached threshold */
export interface CounterThresholdReachedParams {
  readonly id: string;
  readonly value: number;
  readonly threshold: number;
}
```

### 4.2 Plugin Implementation

```ts
// src/plugins/CounterPlugin.ts
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  CounterIncrementParams,
  CounterIncrementOutput,
  CounterGetParams,
  CounterGetOutput,
  CounterResetParams,
  CounterThresholdReachedParams,
} from '../types/counter.js';

export class CounterPlugin implements EnginePlugin {
  readonly namespace = 'counter';

  private _counters = new Map<string, number>();
  private _thresholds = new Map<string, number>();
  private _core!: Core;

  /**
   * Set a threshold: broadcast when the counter reaches this value
   * @example
   * plugin.setThreshold('kills', 100); // fires notification when kills reach 100
   */
  setThreshold(id: string, threshold: number): void {
    this._thresholds.set(id, threshold);
  }

  init(core: Core): void {
    this._core = core;

    // Increment counter
    core.events.on(
      this.namespace,
      'counter/increment',
      (params: CounterIncrementParams, output: CounterIncrementOutput) => {
        const current = this._counters.get(params.id) ?? 0;
        const next = current + (params.amount ?? 1);
        this._counters.set(params.id, next);
        output.value = next;

        // Check if threshold reached
        const threshold = this._thresholds.get(params.id);
        if (threshold !== undefined && next >= threshold) {
          core.events.emitSync<CounterThresholdReachedParams>('counter/threshold:reached', {
            id: params.id,
            value: next,
            threshold,
          });
        }
      },
    );

    // Query counter value
    core.events.on(
      this.namespace,
      'counter/value:get',
      (params: CounterGetParams, output: CounterGetOutput) => {
        const value = this._counters.get(params.id);
        output.found = value !== undefined;
        output.value = value ?? 0;
      },
    );

    // Reset counter
    core.events.on(this.namespace, 'counter/reset', (params: CounterResetParams) => {
      this._counters.delete(params.id);
    });
  }

  destroy(_core: Core): void {
    this._counters.clear();
    this._thresholds.clear();
    // EventBus listeners are auto-cleared by removeNamespace('counter')
  }
}
```

### 4.3 Tests

```ts
// tests/CounterPlugin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Core } from '../src/core/Core.js';
import { EventBus } from '../src/core/EventBus.js';
import { CounterPlugin } from '../src/plugins/CounterPlugin.js';

describe('CounterPlugin', () => {
  let core: Core;
  let plugin: CounterPlugin;

  beforeEach(() => {
    const events = new EventBus();
    core = { events } as unknown as Core;
    plugin = new CounterPlugin();
    plugin.init(core);
  });

  describe('counter/increment', () => {
    it('starts from 0', () => {
      const { output } = core.events.emitSync<{ value: number }>('counter/increment', {
        id: 'kills',
      });
      expect(output.value).toBe(1);
    });

    it('supports custom increment amount', () => {
      core.events.emitSync('counter/increment', { id: 'score', amount: 100 });
      const { output } = core.events.emitSync<{ value: number }>('counter/increment', {
        id: 'score',
        amount: 50,
      });
      expect(output.value).toBe(150);
    });
  });

  describe('counter/value:get', () => {
    it('returns correct count', () => {
      core.events.emitSync('counter/increment', { id: 'steps' });
      core.events.emitSync('counter/increment', { id: 'steps' });

      const { output } = core.events.emitSync<{ value: number; found: boolean }>(
        'counter/value:get',
        { id: 'steps' },
      );
      expect(output.found).toBe(true);
      expect(output.value).toBe(2);
    });

    it('returns found: false for non-existent id', () => {
      const { output } = core.events.emitSync<{ value: number; found: boolean }>(
        'counter/value:get',
        { id: 'nonexistent' },
      );
      expect(output.found).toBe(false);
      expect(output.value).toBe(0);
    });
  });

  describe('threshold notification', () => {
    it('broadcasts counter/threshold:reached when threshold is hit', () => {
      plugin.setThreshold('kills', 3);

      const reached: unknown[] = [];
      core.events.on('test', 'counter/threshold:reached', (params) => {
        reached.push(params);
      });

      core.events.emitSync('counter/increment', { id: 'kills' });
      core.events.emitSync('counter/increment', { id: 'kills' });
      expect(reached).toHaveLength(0);

      core.events.emitSync('counter/increment', { id: 'kills' });
      expect(reached).toHaveLength(1);
    });
  });
});
```

### 4.4 Public API

After adding the plugin, export it from `src/index.ts`:

```ts
// src/index.ts (add)
export { CounterPlugin } from './plugins/CounterPlugin.js';
export type {
  CounterIncrementParams,
  CounterIncrementOutput,
  CounterGetParams,
  CounterGetOutput,
  CounterResetParams,
  CounterThresholdReachedParams,
} from './types/counter.js';
```

---

## 5. Depending on Other Plugins

If your plugin uses events from other plugins at runtime, declare them in `dependencies`:

```ts
export class QuestPlugin implements EnginePlugin {
  readonly namespace = 'quest';

  // Needs to initialize after entity and store (VariableStoreManager)
  readonly dependencies = ['entity', 'store'] as const;

  init(core: Core): void {
    core.events.on(this.namespace, 'quest/complete', (params) => {
      // Can safely use store/* and entity/* events
      core.events.emitSync('store/set', {
        namespace: 'quest',
        key: `${params.questId}.completed`,
        value: true,
      });
    });
  }
}
```

---

## 6. Async Operations

For async operations (network requests, file reads, etc.), use `async/await` in handlers and let callers use `await core.events.emit()`:

```ts
// Inside the plugin
core.events.on(this.namespace, 'quest/load', async (params, output) => {
  const data = await fetch(`/data/quests/${params.questId}.json`).then(r => r.json());
  output.quest = data;
  output.loaded = true;
});

// At the call site
const { output } = await core.events.emit<{ quest: QuestData; loaded: boolean }>(
  'quest/load',
  { questId: 'main-quest-01' },
);
if (output.loaded) startQuest(output.quest);
```

---

## 7. Using Event Phases to Extend Behavior

Use `before` / `after` phases to let other plugins safely hook into your event flow:

```ts
// Plugin A: before phase hook (let external plugins validate or cancel)
core.events.on(this.namespace, 'inventory/item:use-before', (params, output, control) => {
  // Reserved for external plugins to implement validation
});

// Plugin A: main phase — primary logic
core.events.on(this.namespace, 'inventory/item:use', (params, output) => {
  output.used = true;
});

// Plugin A: after phase — broadcast notifications
core.events.on(this.namespace, 'inventory/item:use-after', (params) => {
  core.events.emitSync('ui/inventory:refresh', {});
});

// Plugin B (external): add immunity check in before phase
core.events.on('statusPlugin', 'inventory/item:use-before', (params, _output, control) => {
  const { output: status } = core.events.emitSync('stats/status:has', {
    actorId: params.actorId,
    statusId: 'item-seal',
  });
  if (status.active) {
    control.break(); // Sealed status: cancel item use
  }
});
```

---

## 8. Resource and Side-effect Cleanup

Clean up all non-event resources in `destroy()`:

```ts
export class AudioPlugin implements EnginePlugin {
  readonly namespace = 'audio';
  private _audioCtx: AudioContext | null = null;
  private _workers: Worker[] = [];
  private _timers: ReturnType<typeof setInterval>[] = [];

  init(core: Core): void {
    this._audioCtx = new AudioContext();
  }

  destroy(_core: Core): void {
    this._audioCtx?.close();
    this._audioCtx = null;

    this._workers.forEach(w => w.terminate());
    this._workers = [];

    this._timers.forEach(id => clearInterval(id));
    this._timers = [];

    // Note: EventBus listeners are auto-handled by core.events.removeNamespace('audio')
  }
}
```

---

## 9. Plugin Development Rules Summary

| Item | Rule |
|------|------|
| **File location** | General plugins → `src/plugins/PascalCase.ts`; RPG-specific → `src/plugins/rpg/PascalCase.ts` |
| **Type location** | `src/types/<pluginName>.ts` (separated from implementation) |
| **namespace** | Short, lowercase; must match event prefix exactly |
| **Event naming** | Commands use verb form; notifications use past tense; queries end with `:get` |
| **Params fields** | Use `readonly` |
| **Output fields** | Do not use `readonly` |
| **Cross-plugin communication** | Only via EventBus, never direct imports |
| **Dependency declaration** | List all runtime dependencies in `dependencies` |
| **Public API** | Add exports to `src/index.ts` |
| **Tests** | Place in `tests/<PluginName>.test.ts` |
| **JSDoc** | Add JSDoc (with `@example`) to all public methods and types |

---

## Further Reading

- [Core Concepts](./core-concepts.md) — Complete explanation of EventBus and Phases
- [Architecture](../../ARCHITECTURE.md) — Detailed design philosophy and style guide
- [Contributing Guide](../../CONTRIBUTING.md) — PR process, test standards, version releases
