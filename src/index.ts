// Audio system
export { AudioManager } from './plugins/AudioManager.js';
export type {
  AudioCategory,
  AudioLoadParams,
  AudioLoadOutput,
  AudioPlayParams,
  AudioPlayOutput,
  AudioStopParams,
  AudioPauseParams,
  AudioResumeParams,
  AudioVolumeParams,
  AudioFadeStopParams,
  AudioUnloadParams,
  AudioUnloadOutput,
  AudioStateParams,
  AudioStateOutput,
  AudioInstanceInfo,
  AudioListOutput,
} from './types/audio.js';

// Asset system
export { ResourceManager } from './plugins/ResourceManager.js';

// Localisation system
export { LocalizationManager } from './plugins/LocalizationManager.js';
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
export { InputManager } from './plugins/InputManager.js';
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
export { GameStateManager } from './plugins/GameStateManager.js';
export type {
  GamePhase,
  GameStateSetParams,
  GameStateGetOutput,
} from './types/game.js';

// Event Bus
export { EventBus } from './core/EventBus.js';

// Save system
export { SaveManager } from './plugins/SaveManager.js';
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

// Entity system
export { EntityManager } from './plugins/EntityManager.js';
export { SpriteAnimator } from './plugins/SpriteAnimator.js';
export type {
  Entity,
  EntityDescriptor,
  EntityCreatedParams,
  EntityDestroyedParams,
  EntityCreateParams,
  EntityCreateOutput,
  EntityDestroyParams,
  EntityQueryParams,
  EntityQueryOutput,
  AnimatorDefineParams,
  AnimatorPlayParams,
  AnimatorStopParams,
} from './types/entity.js';

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
export { RenderPipeline } from './rendering/RenderPipeline.js';
export { PostFxPipeline } from './rendering/PostFxPipeline.js';
export { ShaderPass } from './rendering/ShaderPass.js';
export { AnimationSystem } from './rendering/AnimationSystem.js';
export type { InterpolationState } from './rendering/AnimationSystem.js';
export { Camera } from './rendering/Camera.js';
export { ObjectPool } from './rendering/ObjectPool.js';
export type { LayerName } from './rendering/layers.js';
export { LAYER_Z_INDEX } from './rendering/layers.js';
export type {
  CoreUpdateParams,
  CoreRenderParams,
  RendererPreRenderParams,
  RendererAnimateParams,
  RendererPostProcessParams,
  ShaderPassOptions,
  ShaderAddParams,
  ShaderRemoveParams,
  ShaderToggleParams,
  RendererLayerParams,
  RendererLayerOutput,
  RendererLayerCreateParams,
  SpriteAnimationDef,
  AnimationPlayParams,
  AnimationStopParams,
  CameraRect,
  CameraTarget,
  CameraFollowOptions,
  CameraShakeOptions,
  CameraFollowParams,
  CameraShakeParams,
  CameraMoveParams,
  CameraZoomParams,
  CameraStateOutput,
} from './types/rendering.js';
