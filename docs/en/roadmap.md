# Feature Roadmap

This document lists planned features for inkshot-engine that have **not yet been implemented**, ordered by priority.  
For completed features, see [`TODO.md`](../../TODO.md) in the root directory.

---

## Table of Contents

1. [🟡 Medium Priority](#-medium-priority)
   - [Line-of-Sight Cone](#1-line-of-sight-cone)
   - [Dynamic Light Shadow Casting](#2-dynamic-light-shadow-casting)
2. [🔵 Low Priority](#-low-priority)
   - [Procedural Generation Tools](#3-procedural-generation-tools)
3. [⚪ Future Considerations](#-future-considerations)
   - [Networking / Multiplayer](#4-networking--multiplayer)
   - [Cloud Save Adapter](#5-cloud-save-adapter)
   - [Hot Reload](#6-hot-reload)
   - [Screenshot and GIF Recording](#7-screenshot-and-gif-recording)
   - [Platform SDK](#8-platform-sdk)
   - [Visual Editor](#9-visual-editor)

---

## 🟡 Medium Priority

### 1. Line-of-Sight Cone

**Target:** `FogOfWarPlugin` (namespace: `fog`)

- [ ] Support field-of-view angle (`fovAngle`) and distance (`fovRadius`) constraints, computing a visible cone
- [ ] Real-time update of cone direction based on player facing direction

---

### 2. Dynamic Light Shadow Casting

**Target:** `LightingPlugin` (namespace: `lighting`)

- [ ] Occlusion/shadow casting: use collision geometry from `KinematicPhysicsAdapter` or solid tiles from `TilemapManager` to perform shadowcasting ray calculations and produce soft shadow masks
- [ ] Performance optimization: only rebuild light sources within the viewport
- [ ] Provide a `quality` option (`low / medium / high`) to control shadow resolution

---

## 🔵 Low Priority

### 3. Procedural Generation Tools

**Namespace:** Pure utility functions, no plugin lifecycle

- [ ] Simplex / Perlin Noise utility functions (terrain generation, random textures)
- [ ] BSP (Binary Space Partitioning) dungeon generator
- [ ] Seeded random number management (`seededRandom(seed)`), ensuring reproducible results

**API Draft:**
```ts
import { simplexNoise2D, generateDungeon, seededRandom } from '@inkshot/engine/rpg/proc-gen';

const noise = simplexNoise2D(seed);
const height = noise(x / 64, y / 64); // 0..1

const rng = seededRandom(12345);
const dungeon = generateDungeon({ width: 64, height: 64, rooms: 10, rng });
```

---

## ⚪ Future Considerations

### 4. Networking / Multiplayer

**Namespace:** `network`

**New Plugin:** `NetworkManager`

- [ ] Abstract underlying transport (WebSocket / WebRTC Data Channel), allowing backend replacement
- [ ] Provide a simple RPC / event-sync interface
- [ ] Support Rollback Netcode or Lockstep sync model

**Planned Events:**

| Event | Direction | Description |
|-------|-----------|-------------|
| `network/connect` | Command | Connect to specified server |
| `network/disconnect` | Command | Disconnect |
| `network/connected` | Broadcast | Connection successful |
| `network/disconnected` | Broadcast | Connection lost |
| `network/message` | Broadcast | Received remote message |

---

### 5. Cloud Save Adapter

**Target:** `SaveManager`

- [ ] Add a `CloudSaveAdapter` abstract interface (for third-party backends like Firebase, Supabase, custom REST API)
- [ ] Define conflict resolution strategies (server-wins / client-wins / manual merge)

---

### 6. Hot Reload

**Goal:** Shorten development iteration cycles

- [ ] Support reloading scenes without restarting the engine (`scene/reload` command)
- [ ] Asset hot-swap: automatically update Pixi texture cache when images change
- [ ] Integrate Vite HMR API (`import.meta.hot`), automatically trigger scene reload in development

---

### 7. Screenshot and GIF Recording

- [ ] `capture/screenshot` (PNG/JPEG) — capture current frame from Pixi Renderer
- [ ] `capture/gif:start` / `capture/gif:stop` — continuous frame recording, output GIF or WebM
- [ ] Integration with `InputRecorder` for full playback recordings with input sequences

---

### 8. Platform SDK

- [ ] Electron / Tauri adapter, bridging to local filesystem saves
- [ ] Steam Greenworks / Web API bridge: achievement sync, cloud saves, leaderboards
- [ ] Abstract fullscreen / window management, unifying web and desktop platform differences

---

### 9. Visual Editor

- [x] Browser-embedded lightweight scene placement tool extending `TiledLoader` — `SceneEditorPlugin` (`scene-editor`)
- [x] Node-based visual script editor based on `ScriptManager` (node graph → command sequence JSON) — `ScriptNodeEditorPlugin` (`script-node-editor`)
- [ ] Integrate `DebugPlugin` to support clicking entities at runtime to view/modify properties

---

## Completed Features

All implemented features (42+ items) are listed in [TODO.md](../../TODO.md).
