// Core
export { Core } from './core/Core.js';
export type { CoreOptions } from './core/Core.js';

// Event Bus
export { EventBus } from './core/EventBus.js';

// Engine factory (primary public entry point)
export { createEngine } from './createEngine.js';
export type { EngineOptions, EngineInstance } from './createEngine.js';

// Types
export type {
  EventPhase,
  EventKey,
  EventName,
  EventControl,
  EventHandler,
  ListenerOptions,
  ListenerEntry,
  DispatchResult,
} from './types/events.js';

export type { EnginePlugin, PluginSource } from './types/plugin.js';

// Rendering
export { Renderer } from './rendering/Renderer.js';
export type { LayerName } from './rendering/layers.js';
export { LAYER_Z_INDEX } from './rendering/layers.js';
