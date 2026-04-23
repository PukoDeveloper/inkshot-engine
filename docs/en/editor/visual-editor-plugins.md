# Visual Editor Plugins

inkshot-engine provides two built-in visual editor plugin types:

- **`SceneEditorPlugin`** — for creating custom scene panels in the world editor
- **`ScriptNodeEditorPlugin`** — for creating custom script node editors in the script editor

Both are implemented using the EventBus pattern: you listen on a namespace and respond to editor events. No UI framework is imposed — you can use vanilla DOM, Vue, React, or any other approach.

---

## Table of Contents

1. [SceneEditorPlugin](#1-sceneeditorplugin)
   - [Namespace and Registration](#11-namespace-and-registration)
   - [Full EventBus API](#12-full-eventbus-api)
   - [Data Types](#13-data-types)
   - [Undo / Redo](#14-undo--redo)
   - [Minimal Example](#15-minimal-example)
2. [ScriptNodeEditorPlugin](#2-scriptnodeeditorplugin)
   - [Namespace and Registration](#21-namespace-and-registration)
   - [Full EventBus API](#22-full-eventbus-api)
   - [Data Types](#23-data-types)
   - [Minimal Example](#24-minimal-example)
3. [Integration Guide](#3-integration-guide)
4. [Tips and Best Practices](#4-tips-and-best-practices)

---

## 1. SceneEditorPlugin

`SceneEditorPlugin` lets you register a custom panel in the visual scene editor. Your panel receives
editor lifecycle events and can read/write scene data via the EventBus.

### 1.1 Namespace and Registration

All scene editor events use the namespace **`scene-editor`**.

Register your panel by listening to `scene-editor/init`:

```ts
import type { EditorCore } from '@inkshot/engine/editor';

function installMyScenePanel(editor: EditorCore) {
  editor.events.on('scene-editor/init', ({ container, sceneId, sceneType }) => {
    // Mount your UI into `container`
    container.innerHTML = `<div class="my-panel">Scene: ${sceneId}</div>`;
  });
}
```

### 1.2 Full EventBus API

#### Events your plugin **receives** (listens with `on`)

| Event | Payload | Description |
|-------|---------|-------------|
| `scene-editor/init` | `SceneInitPayload` | Editor is mounting your panel. Mount UI into `payload.container`. |
| `scene-editor/destroy` | `{ sceneId: string }` | Editor is unmounting. Clean up DOM, timers, listeners. |
| `scene-editor/scene-data:update` | `{ sceneId: string; data: SceneData }` | Scene data has changed externally (undo/redo, other plugin). Sync your UI. |
| `scene-editor/selection:change` | `SelectionChangePayload` | User selection changed (tiles, entities, region). |
| `scene-editor/viewport:change` | `ViewportChangePayload` | Pan or zoom changed. |
| `scene-editor/tool:change` | `{ tool: string }` | Active editor tool changed (e.g., `'draw'`, `'erase'`, `'select'`). |

#### Events your plugin **emits** (calls with `emit`)

| Event | Payload | Description |
|-------|---------|-------------|
| `scene-editor/scene-data:set` | `{ sceneId: string; data: Partial<SceneData> }` | Commit a data change (recorded in undo history). |
| `scene-editor/history:push` | `HistoryEntry` | Push a named undo entry without changing data (for custom operations). |
| `scene-editor/history:undo` | `{}` | Programmatically trigger undo. |
| `scene-editor/history:redo` | `{}` | Programmatically trigger redo. |
| `scene-editor/selection:set` | `{ ids: string[] }` | Programmatically change the selection. |
| `scene-editor/viewport:set` | `ViewportSetPayload` | Programmatically pan/zoom the viewport. |
| `scene-editor/overlay:draw` | `OverlayDrawPayload` | Request a canvas overlay draw on the next frame. |
| `scene-editor/overlay:clear` | `{}` | Clear all canvas overlays drawn by this plugin. |

#### Sync queries your plugin can call

| Event | Returns | Description |
|-------|---------|-------------|
| `scene-editor/scene-data:get` | `{ data: SceneData }` | Get the current scene data snapshot. |
| `scene-editor/selection:get` | `{ ids: string[] }` | Get the current selection. |
| `scene-editor/viewport:get` | `ViewportState` | Get current viewport state (pan, zoom). |
| `scene-editor/history:can-undo` | `{ canUndo: boolean }` | Check if undo is available. |
| `scene-editor/history:can-redo` | `{ canRedo: boolean }` | Check if redo is available. |

### 1.3 Data Types

```ts
interface SceneInitPayload {
  container: HTMLElement;   // DOM element to mount UI into
  sceneId: string;          // Unique scene identifier
  sceneType: string;        // Scene type (from scenes declaration)
  data: SceneData;          // Current scene data snapshot
}

interface SceneData {
  [key: string]: unknown;   // Fully open — structure defined by your scene schema
}

interface SelectionChangePayload {
  ids: string[];            // Selected entity/tile IDs
  region?: {                // If a rectangular region is selected
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ViewportChangePayload {
  x: number;                // Pan X offset (pixels)
  y: number;                // Pan Y offset (pixels)
  zoom: number;             // Zoom level (1.0 = 100%)
}

interface ViewportSetPayload {
  x?: number;
  y?: number;
  zoom?: number;
  animate?: boolean;        // Whether to animate the transition (default true)
}

interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

interface HistoryEntry {
  label: string;            // Human-readable description shown in history panel
  undo: () => void;         // Function called on undo
  redo: () => void;         // Function called on redo
}

interface OverlayDrawPayload {
  layerId: string;          // Unique layer ID for this overlay
  draw: (ctx: CanvasRenderingContext2D, viewport: ViewportState) => void;
}
```

### 1.4 Undo / Redo

Changes committed via `scene-editor/scene-data:set` are **automatically** pushed into the undo stack.
Use `scene-editor/history:push` for custom operations that change state outside of `SceneData`:

```ts
// Preferred: simple data change (auto-tracked)
editor.events.emit('scene-editor/scene-data:set', {
  sceneId,
  data: { myLayer: updatedLayer },
});

// Advanced: custom undo/redo entry
editor.events.emit('scene-editor/history:push', {
  label: 'Move Entity',
  undo: () => moveEntity(entityId, oldPosition),
  redo: () => moveEntity(entityId, newPosition),
});
```

### 1.5 Minimal Example

```ts
import type { EditorCore } from '@inkshot/engine/editor';

export function installGridOverlayPlugin(editor: EditorCore) {
  let active = false;

  editor.events.on('scene-editor/init', ({ container, sceneId, data }) => {
    active = true;
    drawGridOverlay(editor, sceneId);

    // Add a simple toolbar button
    const btn = document.createElement('button');
    btn.textContent = 'Toggle Grid';
    btn.onclick = () => {
      active = !active;
      if (active) {
        drawGridOverlay(editor, sceneId);
      } else {
        editor.events.emit('scene-editor/overlay:clear', {});
      }
    };
    container.appendChild(btn);
  });

  editor.events.on('scene-editor/destroy', () => {
    active = false;
  });

  editor.events.on('scene-editor/viewport:change', () => {
    if (active) drawGridOverlay(editor, /* sceneId from closure */ '');
  });
}

function drawGridOverlay(editor: EditorCore, sceneId: string) {
  editor.events.emit('scene-editor/overlay:draw', {
    layerId: 'grid',
    draw(ctx, viewport) {
      const step = 32 * viewport.zoom;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      for (let x = viewport.x % step; x < ctx.canvas.width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ctx.canvas.height); ctx.stroke();
      }
      for (let y = viewport.y % step; y < ctx.canvas.height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ctx.canvas.width, y); ctx.stroke();
      }
    },
  });
}
```

---

## 2. ScriptNodeEditorPlugin

`ScriptNodeEditorPlugin` lets you register a custom editor UI for a specific script node command. When
the user adds or selects a node of your command type, your editor UI is shown in the inspector panel.

### 2.1 Namespace and Registration

All script node editor events use the namespace **`script-node-editor`**.

Register your custom command editor by listening to `script-node-editor/init`:

```ts
import type { EditorCore } from '@inkshot/engine/editor';

function installMyCommandEditor(editor: EditorCore) {
  editor.events.on('script-node-editor/init', ({ container, node, cmd }) => {
    if (cmd !== 'my-cmd') return;   // Only handle our command
    container.innerHTML = `
      <label>Message: <input id="msg" value="${node.params?.message ?? ''}" /></label>
    `;
    container.querySelector('#msg')!.addEventListener('input', (e) => {
      editor.events.emit('script-node-editor/node:update', {
        node: { ...node, params: { message: (e.target as HTMLInputElement).value } },
      });
    });
  });
}
```

### 2.2 Full EventBus API

#### Events your plugin **receives** (listens with `on`)

| Event | Payload | Description |
|-------|---------|-------------|
| `script-node-editor/init` | `NodeInitPayload` | A node of your command type is selected. Mount your UI into `payload.container`. |
| `script-node-editor/destroy` | `{ node: ScriptNode }` | The node is deselected or deleted. Clean up DOM. |
| `script-node-editor/node:update` | `{ node: ScriptNode }` | Node data changed externally (undo/redo). Sync your UI. |
| `script-node-editor/script:update` | `{ scriptId: string; nodes: ScriptNode[] }` | The entire script was updated. Use to refresh label/jump auto-complete etc. |

#### Events your plugin **emits** (calls with `emit`)

| Event | Payload | Description |
|-------|---------|-------------|
| `script-node-editor/node:update` | `{ node: ScriptNode }` | Commit a node data change (recorded in undo history). |
| `script-node-editor/node:delete` | `{ nodeIndex: number }` | Delete the current node. |
| `script-node-editor/node:insert` | `NodeInsertPayload` | Insert a new node before/after the current node. |
| `script-node-editor/history:undo` | `{}` | Trigger undo. |
| `script-node-editor/history:redo` | `{}` | Trigger redo. |

#### Sync queries your plugin can call

| Event | Returns | Description |
|-------|---------|-------------|
| `script-node-editor/script:get` | `{ scriptId: string; nodes: ScriptNode[] }` | Get the full script definition. |
| `script-node-editor/node:get` | `{ node: ScriptNode }` | Get the currently focused node. |
| `script-node-editor/labels:get` | `{ labels: string[] }` | Get all label names defined in the current script (for jump/if auto-complete). |

### 2.3 Data Types

```ts
interface NodeInitPayload {
  container: HTMLElement;   // DOM element to mount the inspector UI into
  node: ScriptNode;         // The selected script node
  cmd: string;              // The command string (= node.cmd)
  scriptId: string;         // ID of the script this node belongs to
  nodeIndex: number;        // Index of this node in the script's nodes array
}

interface ScriptNode {
  cmd: string;              // Command identifier
  [key: string]: unknown;   // All other command-specific fields
}

interface NodeInsertPayload {
  node: ScriptNode;         // New node to insert
  position: 'before' | 'after';  // Relative to current node
}
```

### 2.4 Minimal Example

The following registers a custom editor for a hypothetical `play-sound` command:

```ts
import type { EditorCore } from '@inkshot/engine/editor';

interface PlaySoundNode extends ScriptNode {
  cmd: 'play-sound';
  key: string;
  volume: number;
  loop: boolean;
}

export function installPlaySoundEditor(editor: EditorCore) {
  editor.events.on('script-node-editor/init', ({ container, node, cmd }) => {
    if (cmd !== 'play-sound') return;

    const n = node as PlaySoundNode;

    container.innerHTML = `
      <div class="node-editor">
        <label>
          Sound Key:
          <input type="text" id="key" value="${n.key ?? ''}" placeholder="e.g. battle-bgm" />
        </label>
        <label>
          Volume:
          <input type="range" id="vol" min="0" max="1" step="0.01" value="${n.volume ?? 1}" />
          <span id="vol-display">${n.volume ?? 1}</span>
        </label>
        <label>
          <input type="checkbox" id="loop" ${n.loop ? 'checked' : ''} />
          Loop
        </label>
      </div>
    `;

    function commit() {
      const updated: PlaySoundNode = {
        cmd: 'play-sound',
        key:    (container.querySelector('#key')  as HTMLInputElement).value,
        volume: parseFloat((container.querySelector('#vol') as HTMLInputElement).value),
        loop:   (container.querySelector('#loop') as HTMLInputElement).checked,
      };
      editor.events.emit('script-node-editor/node:update', { node: updated });
    }

    container.querySelector('#key')!.addEventListener('change', commit);
    container.querySelector('#vol')!.addEventListener('input', (e) => {
      (container.querySelector('#vol-display')!).textContent =
        (e.target as HTMLInputElement).value;
    });
    container.querySelector('#vol')!.addEventListener('change', commit);
    container.querySelector('#loop')!.addEventListener('change', commit);
  });

  editor.events.on('script-node-editor/node:update', ({ node }) => {
    if (node.cmd !== 'play-sound') return;
    // Sync UI if needed (undo/redo case)
    const n = node as PlaySoundNode;
    const key = document.querySelector('#key') as HTMLInputElement | null;
    if (key) key.value = n.key ?? '';
  });
}
```

---

## 3. Integration Guide

### Step 1 — Create an Editor Plugin Package

Editor plugins can be separate npm packages or co-located in the same repository:

```
my-editor-plugin/
├── src/
│   ├── index.ts        ← exports installMyEditorPlugin
│   └── panel.ts        ← scene panel or node editor logic
├── package.json
└── tsconfig.json
```

### Step 2 — Import and Register in the Editor Entry Point

```ts
// editor/main.ts
import { createEditorApp } from '@inkshot/engine/editor';
import { installMyEditorPlugin } from './my-editor-plugin';

const editor = await createEditorApp({ container: '#editor' });
installMyEditorPlugin(editor);
```

### Step 3 — Use `editorMeta` to Declare the Plugin

Register the plugin definition so the editor knows about your scene types and events:

```ts
// runtime-plugin.ts  (used in both editor and game)
import type { PluginDef } from '@inkshot/engine';

export const myPlugin: PluginDef = {
  id: 'my-plugin',
  version: '1.0.0',
  install(core) { /* runtime behavior */ },
  editorMeta: {
    label: 'My Plugin',
    scenes: [{ type: 'my-scene', label: 'My Scene' }],
    events: [{ name: 'my-plugin/ready', direction: 'emit' }],
  },
};
```

### Step 4 — Build and Bundle

Editor plugins should be bundled separately from the game bundle since they are only needed in the
editor environment. Use `rolldown` or `vite` with a separate entry point:

```js
// rolldown.editor.config.js
export default {
  input: 'editor/main.ts',
  output: { file: 'dist/editor.js', format: 'esm' },
  external: ['@inkshot/engine', '@inkshot/engine/editor'],
};
```

---

## 4. Tips and Best Practices

**Clean up in `destroy`**

Always remove event listeners, cancel timers, and clear DOM in the `destroy` handler to avoid
memory leaks — the editor re-mounts panels frequently (e.g., when switching scenes or nodes).

```ts
editor.events.on('scene-editor/init', ({ container }) => {
  const interval = setInterval(tick, 100);
  editor.events.once('scene-editor/destroy', () => clearInterval(interval));
});
```

**Use `scene-editor/scene-data:set` for all mutations**

Never directly mutate the `data` object received in `init` or `scene-data:update`. Always go through
`scene-editor/scene-data:set` so changes are tracked in the undo history.

**Scope overlay layers by a stable `layerId`**

Use a fixed, unique `layerId` (e.g., `'my-plugin-grid'`) for overlays. The editor will replace the
previous draw call with the new one on each frame, so overlays stay fresh without accumulating.

**Keep node editors lightweight**

Script node editors are shown inline in the inspector — keep them compact and avoid deep UI trees.
For complex configurations, consider opening a modal dialog and writing the result back via
`script-node-editor/node:update`.

**Test undo/redo thoroughly**

Both `scene-editor/scene-data:set` and `script-node-editor/node:update` automatically create undo
entries. Make sure your UI correctly syncs from the incoming `node:update` / `scene-data:update`
events so that undo/redo produce visually consistent results.
