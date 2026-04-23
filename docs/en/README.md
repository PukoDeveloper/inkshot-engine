# inkshot-engine Documentation (English)

Welcome to the **inkshot-engine** English documentation.

---

## 📚 Contents

### 🚀 Getting Started

| Document | Description |
|----------|-------------|
| [Getting Started](./getting-started.md) | Installation, first game, core workflow |
| [Core Concepts](./core-concepts.md) | EventBus, Plugin system, Event Phases |

### 🎮 RPG System

| Document | Description |
|----------|-------------|
| [RPG System Overview](./rpg/README.md) | RPG bundle architecture and subsystems |
| [RPG Quickstart](./rpg-quickstart.md) | Build a running RPG project from scratch |
| [JSON Data Format Reference](./json-data-format.md) | RpgGameData, script nodes, tilemap, i18n specs |

### 🔧 Development

| Document | Description |
|----------|-------------|
| [Custom Plugin Development](./plugin-development.md) | Writing plugins from scratch |
| [Browser Bundle Guide](./browser-bundle.md) | Using the engine in the browser |
| [Contributing Guide](../../CONTRIBUTING.md) | Environment setup, code style, PR process |

### 📖 Reference

| Document | Description |
|----------|-------------|
| [Architecture](../../ARCHITECTURE.md) | Design philosophy, conventions, style guide |
| [Full API Reference](../../README.md) | All built-in plugin event contracts and examples |
| [Roadmap](./roadmap.md) | Planned but not yet implemented features |

### 🔌 Plugin Docs

[animation](#animation) · [audio](#audio) · [data](#data) · [debug](#debug) · [entity](#entity) · [gameplay](#gameplay) · [input](#input) · [physics](#physics) · [rpg](#rpg-plugins) · [save](#save) · [scene](#scene) · [tilemap](#tilemap) · [ui](#ui) · [world](#world)

#### animation

| Plugin | Description |
|--------|-------------|
| [TweenManager](./plugins/animation/TweenManager.md) | Property-based tweening |
| [Timeline](./plugins/animation/Timeline.md) | Sequenced animation timelines |

#### audio

| Plugin | Description |
|--------|-------------|
| [AudioManager](./plugins/audio/AudioManager.md) | Music and sound effects |

#### data

| Plugin | Description |
|--------|-------------|
| [DataManager](./plugins/data/DataManager.md) | JSON data collection manager |
| [LocalizationManager](./plugins/data/LocalizationManager.md) | i18n / localization |
| [ResourceManager](./plugins/data/ResourceManager.md) | Asset loading and caching |
| [SettingsManager](./plugins/data/SettingsManager.md) | Persistent game settings |

#### debug

| Plugin | Description |
|--------|-------------|
| [DebugPlugin](./plugins/debug/DebugPlugin.md) | Debug overlay and logging |

#### entity

| Plugin | Description |
|--------|-------------|
| [EntityManager](./plugins/entity/EntityManager.md) | Entity-component system |
| [SpriteAnimator](./plugins/entity/SpriteAnimator.md) | Sprite frame animation |

#### gameplay

| Plugin | Description |
|--------|-------------|
| [AchievementPlugin](./plugins/gameplay/AchievementPlugin.md) | Achievement system |
| [CutscenePlugin](./plugins/gameplay/CutscenePlugin.md) | Cutscene sequencer |
| [GameStateManager](./plugins/gameplay/GameStateManager.md) | High-level game state machine |
| [TimerManager](./plugins/gameplay/TimerManager.md) | Timers and cooldowns |

#### input

| Plugin | Description |
|--------|-------------|
| [InputManager](./plugins/input/InputManager.md) | Keyboard, mouse, gamepad, touch |
| [InputRecorder](./plugins/input/InputRecorder.md) | Input recording and replay |

#### physics

| Plugin | Description |
|--------|-------------|
| [KinematicPhysicsAdapter](./plugins/physics/KinematicPhysicsAdapter.md) | Tile-based kinematic physics (default) |
| [MatterPhysicsAdapter](./plugins/physics/MatterPhysicsAdapter.md) | Matter.js rigid-body physics |
| [RapierPhysicsAdapter](./plugins/physics/RapierPhysicsAdapter.md) | Rapier WASM high-performance physics |

#### rpg plugins

| Plugin | Description |
|--------|-------------|
| [ActorManager](./plugins/rpg/ActorManager.md) | Actor instance management |
| [BattleSystem](./plugins/rpg/BattleSystem.md) | Turn-based battle system |
| [DialogueManager](./plugins/rpg/DialogueManager.md) | Dialogue system |
| [ExperienceSystem](./plugins/rpg/ExperienceSystem.md) | Experience and leveling |
| [InventorySystem](./plugins/rpg/InventorySystem.md) | Item inventory |
| [PlayerController](./plugins/rpg/PlayerController.md) | Player controller |
| [RpgMenuSystem](./plugins/rpg/RpgMenuSystem.md) | RPG menu system |
| [ScriptManager](./plugins/rpg/ScriptManager.md) | Visual script execution engine |
| [ShopSystem](./plugins/rpg/ShopSystem.md) | Shop system |
| [StatsSystem](./plugins/rpg/StatsSystem.md) | Stats and status effects |
| [VariableStoreManager](./plugins/rpg/VariableStoreManager.md) | Game variable store |

#### save

| Plugin | Description |
|--------|-------------|
| [SaveManager](./plugins/save/SaveManager.md) | Core save management |
| [LocalStorageSaveAdapter](./plugins/save/LocalStorageSaveAdapter.md) | localStorage persistence |
| [IndexedDBSaveAdapter](./plugins/save/IndexedDBSaveAdapter.md) | IndexedDB persistence |
| [SaveMigrationPlugin](./plugins/save/SaveMigrationPlugin.md) | Save data migration |

#### scene

| Plugin | Description |
|--------|-------------|
| [SceneManager](./plugins/scene/SceneManager.md) | Scene management and transitions |

#### tilemap

| Plugin | Description |
|--------|-------------|
| [TilemapManager](./plugins/tilemap/TilemapManager.md) | Tilemap rendering |
| [TiledLoader](./plugins/tilemap/TiledLoader.md) | Tiled map loader |
| [TilemapEditorPlugin](./plugins/tilemap/TilemapEditorPlugin.md) | Visual tilemap editor |

#### ui

| Plugin | Description |
|--------|-------------|
| [UIManager](./plugins/ui/UIManager.md) | UI component system |
| [LoadingScreen](./plugins/ui/LoadingScreen.md) | Loading screen |
| [MinimapPlugin](./plugins/ui/MinimapPlugin.md) | Minimap |

#### world

| Plugin | Description |
|--------|-------------|
| [FogOfWarPlugin](./plugins/world/FogOfWarPlugin.md) | Fog of war |
| [GradientLightingPlugin](./plugins/world/GradientLightingPlugin.md) | Gradient lighting |
| [LightingPlugin](./plugins/world/LightingPlugin.md) | Dynamic lighting |
| [ParallaxPlugin](./plugins/world/ParallaxPlugin.md) | Parallax scrolling backgrounds |
| [ParticleManager](./plugins/world/ParticleManager.md) | Particle system |
| [PathfindingManager](./plugins/world/PathfindingManager.md) | Pathfinding |

---

[切換至中文文件 →](../zh/README.md) | [← Back to docs hub](../README.md)
