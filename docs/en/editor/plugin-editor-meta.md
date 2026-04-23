# Plugin Editor Metadata (`editorMeta`)

When developing plugins for inkshot-engine's visual editor, the `editorMeta` field in the plugin definition
describes how the editor should render and interact with your plugin's data. This document covers all
conventions, schema formats, and extension points available through `editorMeta`.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Field Reference](#2-field-reference)
3. [Schema Format](#3-schema-format)
4. [schemaExtensions](#4-schemaextensions)
5. [Events Declaration](#5-events-declaration)
6. [Scenes Declaration](#6-scenes-declaration)
7. [Complete Plugin Examples](#7-complete-plugin-examples)
8. [Editor Parsing Logic](#8-editor-parsing-logic)
9. [Design Notes](#9-design-notes)

---

## 1. Overview

The `editorMeta` field is an optional top-level property of a plugin definition object. It is consumed
exclusively by the visual editor (`SceneEditorPlugin`, `ScriptNodeEditorPlugin`, etc.) and is ignored
at runtime when running the engine outside the editor.

```ts
import type { PluginDef } from '@inkshot/engine';

const myPlugin: PluginDef = {
  id: 'my-plugin',
  version: '1.0.0',

  // Runtime behavior
  install(core) { /* … */ },

  // Editor metadata (optional)
  editorMeta: {
    label: 'My Plugin',
    description: 'Adds custom game mechanics.',
    icon: 'plugin-icon',
    schema: { /* … */ },
    schemaExtensions: [ /* … */ ],
    events: [ /* … */ ],
    scenes: [ /* … */ ],
  },
};
```

---

## 2. Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | `string` | No | Human-readable display name shown in the editor UI |
| `description` | `string` | No | Short description shown in the plugin inspector |
| `icon` | `string` | No | Icon key (from the editor's icon registry) |
| `schema` | `EditorSchema` | No | Schema describing the plugin's own configuration data |
| `schemaExtensions` | `SchemaExtension[]` | No | Extensions that add fields to other plugins' schemas |
| `events` | `EventDeclaration[]` | No | EventBus events this plugin publishes or consumes |
| `scenes` | `SceneDeclaration[]` | No | Scene types this plugin registers (for the scene editor) |

---

## 3. Schema Format

`schema` describes the structure of the plugin's editable configuration object. The editor uses this
schema to auto-generate property panels, validation, and serialization.

### Schema Object Structure

```ts
interface EditorSchema {
  type: 'object';
  properties: Record<string, SchemaField>;
  required?: string[];
}

type SchemaField =
  | StringField
  | NumberField
  | BooleanField
  | EnumField
  | ArrayField
  | ObjectField
  | RefField;
```

### Primitive Fields

```jsonc
{
  "type": "object",
  "properties": {
    "displayName": {
      "type": "string",
      "label": "Display Name",
      "default": "Unnamed",
      "placeholder": "Enter name…"
    },
    "health": {
      "type": "number",
      "label": "Max HP",
      "default": 100,
      "minimum": 1,
      "maximum": 9999
    },
    "enabled": {
      "type": "boolean",
      "label": "Enabled",
      "default": true
    }
  }
}
```

### Enum Field

```jsonc
{
  "category": {
    "type": "enum",
    "label": "Category",
    "options": [
      { "value": "item",      "label": "Item" },
      { "value": "weapon",    "label": "Weapon" },
      { "value": "armor",     "label": "Armor" },
      { "value": "accessory", "label": "Accessory" },
      { "value": "key",       "label": "Key Item" }
    ],
    "default": "item"
  }
}
```

### Array Field

```jsonc
{
  "modifiers": {
    "type": "array",
    "label": "Stat Modifiers",
    "items": {
      "type": "object",
      "properties": {
        "stat":  { "type": "string", "label": "Stat" },
        "value": { "type": "number", "label": "Value" },
        "mode":  {
          "type": "enum",
          "label": "Mode",
          "options": [
            { "value": "add",      "label": "Additive" },
            { "value": "multiply", "label": "Multiplicative" }
          ],
          "default": "add"
        }
      }
    }
  }
}
```

### Ref Field (Cross-reference)

Use `$ref` to reference entities defined elsewhere — e.g., an item ID picker that shows a dropdown
of all registered items:

```jsonc
{
  "itemId": {
    "type": "$ref",
    "label": "Item",
    "ref": "items",          // Reference target registry key
    "displayField": "name"   // Field from the referenced entity to display as label
  }
}
```

Supported `ref` targets (built-in registries):

| Target | Description |
|--------|-------------|
| `actors` | Actor definitions |
| `items` | Item definitions |
| `classes` | Class definitions |
| `statusEffects` | Status effect definitions |
| `scripts` | Script definitions |
| `scenes` | Scene declarations |
| `i18nKeys` | i18n translation keys |

---

## 4. `schemaExtensions`

`schemaExtensions` let your plugin inject additional fields into the schemas of other plugins.
This is useful for cross-plugin data augmentation without modifying those plugins directly.

```ts
interface SchemaExtension {
  targetPlugin: string;       // ID of the plugin whose schema is being extended
  targetType: string;         // Entity type within that plugin to extend (e.g., "actors", "items")
  properties: Record<string, SchemaField>;  // Additional fields to inject
  required?: string[];        // Fields that must be present
}
```

### Example: Adding Fields to Items

Suppose your `shop-plugin` needs to add a `shopCategory` field to every item:

```jsonc
{
  "schemaExtensions": [
    {
      "targetPlugin": "rpg-core",
      "targetType": "items",
      "properties": {
        "shopCategory": {
          "type": "enum",
          "label": "Shop Category",
          "options": [
            { "value": "consumable", "label": "Consumable" },
            { "value": "equipment",  "label": "Equipment" },
            { "value": "rare",       "label": "Rare" }
          ],
          "default": "consumable"
        },
        "shopVisible": {
          "type": "boolean",
          "label": "Show in Shop",
          "default": true
        }
      }
    }
  ]
}
```

---

## 5. Events Declaration

`events` describes EventBus events that your plugin publishes or subscribes to. This information is
used by the editor to provide auto-complete, documentation tooltips, and dependency graphs.

```ts
interface EventDeclaration {
  name: string;               // Event name (exact EventBus key)
  direction: 'emit' | 'on' | 'both';  // Whether this plugin emits, listens, or both
  description?: string;       // Human-readable description
  schema?: EditorSchema;      // Schema describing the event payload
}
```

### Example

```jsonc
{
  "events": [
    {
      "name": "shop/open",
      "direction": "emit",
      "description": "Emitted when the shop UI is opened",
      "schema": {
        "type": "object",
        "properties": {
          "shopId": { "type": "string", "label": "Shop ID" }
        }
      }
    },
    {
      "name": "shop/purchase",
      "direction": "emit",
      "description": "Emitted when the player purchases an item",
      "schema": {
        "type": "object",
        "properties": {
          "itemId":   { "type": "string", "label": "Item ID" },
          "quantity": { "type": "number", "label": "Quantity" },
          "gold":     { "type": "number", "label": "Gold spent" }
        }
      }
    },
    {
      "name": "inventory/item:add",
      "direction": "on",
      "description": "Listens for items added to inventory after purchase"
    }
  ]
}
```

---

## 6. Scenes Declaration

`scenes` declares custom scene types that your plugin registers with the scene editor. Each entry
describes a scene type identifier, its editor component, and its data schema.

```ts
interface SceneDeclaration {
  type: string;               // Unique scene type identifier
  label: string;              // Human-readable display name
  icon?: string;              // Icon key
  schema?: EditorSchema;      // Schema for scene-level data
  description?: string;       // Description shown in scene-type picker
}
```

### Example

```jsonc
{
  "scenes": [
    {
      "type": "dungeon",
      "label": "Dungeon Map",
      "icon": "scene-dungeon",
      "description": "A dungeon level with rooms, corridors, and enemies.",
      "schema": {
        "type": "object",
        "properties": {
          "dungeonSeed":  { "type": "number",  "label": "Seed",           "default": 0 },
          "roomCount":    { "type": "number",  "label": "Room Count",     "default": 8,  "minimum": 1, "maximum": 50 },
          "bossPresent":  { "type": "boolean", "label": "Include Boss",   "default": true }
        }
      }
    },
    {
      "type": "town",
      "label": "Town",
      "icon": "scene-town",
      "description": "A peaceful town scene with NPCs and shops."
    }
  ]
}
```

---

## 7. Complete Plugin Examples

### Example 1: Minimal Plugin with Schema

```ts
const itemPlugin: PluginDef = {
  id: 'item-plugin',
  version: '1.0.0',
  install(core) {
    core.events.on('item/use', ({ itemId, actorId }) => {
      // … handle item use
    });
  },
  editorMeta: {
    label: 'Item System',
    description: 'Manages the item inventory and use effects.',
    schema: {
      type: 'object',
      properties: {
        maxInventorySize: {
          type: 'number',
          label: 'Max Inventory Size',
          default: 50,
          minimum: 1,
          maximum: 999,
        },
      },
    },
  },
};
```

### Example 2: Plugin with Schema Extensions and Events

```ts
const shopPlugin: PluginDef = {
  id: 'shop-plugin',
  version: '1.0.0',
  install(core) { /* … */ },
  editorMeta: {
    label: 'Shop System',
    description: 'Adds a purchasable shop UI with gold management.',
    events: [
      {
        name: 'shop/open',
        direction: 'emit',
        description: 'Opens the shop UI for a given shopId',
      },
      {
        name: 'shop/purchase',
        direction: 'emit',
        description: 'Player has purchased an item',
      },
    ],
    schemaExtensions: [
      {
        targetPlugin: 'rpg-core',
        targetType: 'items',
        properties: {
          price: {
            type: 'number',
            label: 'Price',
            default: 0,
            minimum: 0,
          },
          shopVisible: {
            type: 'boolean',
            label: 'Available in Shop',
            default: true,
          },
        },
      },
    ],
  },
};
```

### Example 3: Plugin with Scene Declarations

```ts
const dungeonPlugin: PluginDef = {
  id: 'dungeon-plugin',
  version: '1.0.0',
  install(core) { /* … */ },
  editorMeta: {
    label: 'Dungeon Generator',
    description: 'Procedural dungeon generation and layout.',
    scenes: [
      {
        type: 'dungeon',
        label: 'Dungeon Level',
        icon: 'scene-dungeon',
        description: 'Auto-generated dungeon with rooms and corridors.',
        schema: {
          type: 'object',
          properties: {
            seed:      { type: 'number',  label: 'Seed',        default: 0 },
            roomCount: { type: 'number',  label: 'Room Count',  default: 8 },
            hasBoss:   { type: 'boolean', label: 'Has Boss',    default: true },
          },
        },
      },
    ],
  },
};
```

### Example 4: Plugin with Full editorMeta

```ts
const fullPlugin: PluginDef = {
  id: 'full-plugin',
  version: '1.0.0',
  install(core) { /* … */ },
  editorMeta: {
    label: 'Full Example Plugin',
    description: 'Demonstrates all editorMeta features.',
    icon: 'plugin-star',
    schema: {
      type: 'object',
      properties: {
        globalSetting: {
          type: 'enum',
          label: 'Global Mode',
          options: [
            { value: 'easy',   label: 'Easy' },
            { value: 'normal', label: 'Normal' },
            { value: 'hard',   label: 'Hard' },
          ],
          default: 'normal',
        },
      },
    },
    events: [
      { name: 'full-plugin/ready', direction: 'emit', description: 'Plugin has initialized' },
    ],
    schemaExtensions: [
      {
        targetPlugin: 'rpg-core',
        targetType: 'actors',
        properties: {
          specialTag: { type: 'string', label: 'Special Tag', default: '' },
        },
      },
    ],
    scenes: [
      {
        type: 'special-scene',
        label: 'Special Scene',
        icon: 'scene-star',
        description: 'A unique scene type added by this plugin.',
      },
    ],
  },
};
```

---

## 8. Editor Parsing Logic

When the editor loads plugins, it processes `editorMeta` in the following order:

1. **Schema registration** — `schema` is merged into the plugin's entity-type registry so property panels can auto-generate form fields.

2. **Schema extensions** — `schemaExtensions` are resolved by matching `targetPlugin` + `targetType`. The extra `properties` are merged (non-destructively) into the target schema's property set.

3. **Event index** — `events` entries are indexed by `name`. The editor uses this to:
   - Power auto-complete in the script node editor's `emit` command
   - Show payload schema in event hover tooltips
   - Build a plugin dependency graph

4. **Scene type registration** — `scenes` entries are added to the global scene-type registry. When a user creates a new scene, these types appear in the scene-type picker alongside any built-in types.

### Schema Merging Rules

- If two plugins declare the same property key for the same target type, the **last registered plugin wins** (load order matters).
- Extension fields are stored separately from the owning plugin's schema, so uninstalling an extension plugin cleanly removes its injected fields.
- Required fields added via `schemaExtensions` are validated only when both the source and target plugins are active.

---

## 9. Design Notes

**Why `editorMeta` is separate from runtime code**

- **No editor code in production bundles** — `editorMeta` is plain data; the editor reads it, but it never runs in the game build. This means zero overhead for shipped games.
- **Declarative over imperative** — Describing UI structure as data enables the editor to introspect, version, and migrate configurations without executing plugin code.
- **Forward compatibility** — Unknown `editorMeta` fields are silently ignored, so newer plugins can add metadata fields without breaking older editor versions.

**Schema vs. full TypeScript types**

The JSON schema in `editorMeta` is intentionally simpler than TypeScript types. It's designed for
editor UI generation, not full type-checking. Use TypeScript types in your plugin code for compile-time
safety; use `schema` for the visual editor's property panels.
