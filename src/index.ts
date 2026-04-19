// Asset system
export { ResourceManager } from './core/ResourceManager.js';

// Localisation system
export { LocalizationManager } from './core/LocalizationManager.js';
export type {
  LocaleData,
  I18nLoadParams,
  I18nLoadOutput,
  I18nSetLocaleParams,
  I18nSetLocaleOutput,
  I18nChangedParams,
  I18nTParams,
  I18nTOutput,
  I18nInterpolateParams,
  I18nInterpolateOutput,
  I18nLookupParams,
  I18nLookupOutput,
  I18nGetLocalesParams,
  I18nGetLocalesOutput,
} from './types/i18n.js';
export type {
  AssetRecord,
  AssetBundleDefinition,
  AssetsPreloadParams,
  AssetsPreloadOutput,
  AssetsLoadParams,
  AssetsLoadOutput,
  AssetsPrefetchParams,
  AssetsGetParams,
  AssetsGetOutput,
  AssetsUnloadParams,
  AssetsUnloadOutput,
  AssetsProgressParams,
  AssetsErrorParams,
} from './types/assets.js';

// Core
export { Core } from './core/Core.js';
export type { CoreOptions } from './core/Core.js';

// Input system
export { InputManager } from './core/InputManager.js';
export type {
  InputKeyDownParams,
  InputKeyUpParams,
  InputPointerDownParams,
  InputPointerUpParams,
  InputPointerMoveParams,
  InputKeyPressedParams,
  InputKeyPressedOutput,
  InputPointerStateOutput,
  InputActionBindParams,
  InputActionTriggeredParams,
} from './types/input.js';

// Game state system
export { GameStateManager } from './core/GameStateManager.js';
export type {
  GamePhase,
  GameStateSetParams,
  GameStateGetOutput,
} from './types/game.js';

// Event Bus
export { EventBus } from './core/EventBus.js';

// Save system
export { SaveManager } from './core/SaveManager.js';
export type {
  SlotMeta,
  SlotData,
  GlobalSaveData,
  SaveSlotSetParams,
  SaveSlotGetParams,
  SaveSlotGetOutput,
  SaveSlotListOutput,
  SaveSlotSaveParams,
  SaveSlotSaveOutput,
  SaveSlotLoadParams,
  SaveSlotLoadOutput,
  SaveSlotDeleteParams,
  SaveSlotDeleteOutput,
  SaveGlobalSetParams,
  SaveGlobalGetOutput,
  SaveGlobalSaveOutput,
  SaveGlobalLoadOutput,
} from './types/save.js';

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
