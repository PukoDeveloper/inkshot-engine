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
  AudioPosition,
  AudioListenerUpdateParams,
  AudioSourceMoveParams,
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
  InputGamepadButtonDownParams,
  InputGamepadButtonUpParams,
  InputGamepadAxesParams,
  InputGamepadAxisBindParams,
  InputGamepadVibrateParams,
  InputGamepadConnectedParams,
  InputGamepadDisconnectedParams,
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
export { LocalStorageSaveAdapter } from './plugins/LocalStorageSaveAdapter.js';
export type { StorageLike, LocalStorageSaveAdapterOptions } from './plugins/LocalStorageSaveAdapter.js';
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

// Scene system
export { SceneManager } from './plugins/SceneManager.js';
export { LoadingScreen } from './plugins/LoadingScreen.js';
export type { LoadingScreenOptions } from './plugins/LoadingScreen.js';
export type {
  SceneDescriptor,
  SceneRegisterParams,
  SceneLoadParams,
  SceneCurrentOutput,
  SceneChangedParams,
} from './types/scene.js';

// Collision system
export { CollisionManager } from './plugins/CollisionManager.js';
export type { CollisionManagerOptions } from './plugins/CollisionManager.js';
export { CollisionLayer } from './types/collision.js';
export type {
  TileCollisionShape,
  TileShapeContext,
  TileShapeResolver,
  ColliderShape,
  RectShape,
  CircleShape,
  PointShape,
  Collider,
  TileCollisionMapData,
  ColliderAddParams,
  ColliderRemoveParams,
  TilemapSetParams,
  CollisionMoveParams,
  CollisionMoveOutput,
  CollisionQueryParams,
  CollisionQueryOutput,
  CollisionRaycastParams,
  CollisionRaycastOutput,
  GridSnapParams,
  GridSnapOutput,
  WorldToTileParams,
  WorldToTileOutput,
  TileToWorldParams,
  TileToWorldOutput,
  CollisionHitParams,
  CollisionOverlapParams,
} from './types/collision.js';

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
export { createEngine, sortPluginsByDependency } from './createEngine.js';
export type { EngineOptions, EngineInstance } from './createEngine.js';


// Tilemap system
export { TilemapManager } from './plugins/TilemapManager.js';
export { AutotileBit } from './types/tilemap.js';
export type {
  TilesetDef,
  TileAnimationFrame,
  AnimatedTileDef,
  AutotileMode,
  AutotileGroupDef,
  TilemapLayerDef,
  TilemapData,
  TilemapLoadParams,
  TilemapLoadOutput,
  TilemapUnloadParams,
  TilemapSetTileParams,
  TilemapGetTileParams,
  TilemapGetTileOutput,
  TilemapLoadedParams,
  TilemapUnloadedParams,
  TilemapLayerSetFilterParams,
} from './types/tilemap.js';

// Tween system
export { TweenManager, Tween, Easing } from './plugins/TweenManager.js';
export type { EasingFn, TweenOptions, Advanceable } from './plugins/TweenManager.js';
export { Timeline } from './plugins/Timeline.js';
export type { TimelineOptions } from './plugins/Timeline.js';
export type { TweenToParams, TweenToOutput, TweenKillParams, TweenFinishedParams } from './types/tween.js';

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

// Particle system
export { ParticleManager } from './plugins/ParticleManager.js';
export type { ParticleDisplay, ParticleLayer, ParticleManagerOptions } from './plugins/ParticleManager.js';
export type {
  ParticleConfig,
  ParticleEmitParams,
  ParticleEmitOutput,
  ParticleStopParams,
  ParticleClearParams,
  ParticleCompleteParams,
  ParticleMoveParams,
  ParticlePauseParams,
  ParticleResumeParams,
  ParticleCountParams,
  ParticleCountOutput,
  ParticleUpdateParams,
} from './types/particle.js';

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

// Timer / Scheduler system
export { TimerManager } from './plugins/TimerManager.js';
export type {
  TimerOnceParams,
  TimerIntervalParams,
  TimerCancelParams,
  TimerCooldownParams,
  TimerCooldownOutput,
  TimerFiredParams,
  TimerCancelledParams,
  TimerCancelAllOutput,
} from './types/timer.js';

// Pathfinding system
export { PathfindingManager } from './plugins/PathfindingManager.js';
export type { PathfindingManagerOptions } from './plugins/PathfindingManager.js';
export type {
  PathfindingFindParams,
  PathfindingFindOutput,
  PathfindingWeightSetParams,
  PathfindingCacheClearParams,
} from './types/pathfinding.js';

// UI system
export { UIManager } from './plugins/UIManager.js';
export type {
  UIWidget,
  UIWidgetFactory,
  UIAnchor,
  UICreateParams,
  UICreateOutput,
  UIRegisterParams,
  UIRegisterOutput,
  UIShowParams,
  UIHideParams,
  UIDestroyParams,
  UIUpdateParams,
  UIGetParams,
  UIGetOutput,
  UICreatedParams,
  UIShownParams,
  UIHiddenParams,
  UIDestroyedParams,
  UILabelProps,
  UIButtonProps,
  UIPanelProps,
  UIProgressBarProps,
  UISliderProps,
  UIScrollViewProps,
  UIDialogProps,
  UIStackPanelProps,
  UIScrollViewWidget,
  UIStackPanelWidget,
  UIDialogueBoxProps,
} from './types/ui.js';

// Actor system
export { ActorManager } from './plugins/ActorManager.js';
export type {
  ActorDef,
  ActorInstance,
  TriggerDef,
  TriggerConditionCtx,
  ActorDefineParams,
  ActorSpawnParams,
  ActorSpawnOutput,
  ActorDespawnParams,
  ActorStateSetParams,
  ActorStateGetParams,
  ActorStateGetOutput,
  ActorTriggerParams,
  ActorSpawnedParams,
  ActorDespawnedParams,
  ActorScriptStartedParams,
  ActorScriptEndedParams,
  ActorStateChangedParams,
} from './types/actor.js';

// Script system
export { ScriptManager } from './plugins/ScriptManager.js';
export type {
  ScriptNode,
  ScriptDef,
  ScriptContext,
  ScriptCommandHandler,
  ScriptDefineParams,
  ScriptRunParams,
  ScriptStopParams,
  ScriptRegisterCommandParams,
  ScriptInstanceState,
  ScriptStateGetOutput,
  ScriptStartedParams,
  ScriptEndedParams,
  ScriptStepParams,
  ScriptErrorParams,
} from './types/script.js';

// Dialogue system
export { DialogueManager } from './plugins/DialogueManager.js';
export {
  parseDialogueMarkup,
  buildTextSegments,
  getSpeedAtIndex,
} from './plugins/DialogueMarkupParser.js';
export type {
  ParsedMarkup,
  ColorSpan,
  SpeedSpan,
  PauseMark,
} from './plugins/DialogueMarkupParser.js';
export type {
  DialogueTextSegment,
  DialogueShowTextParams,
  DialogueShowChoicesParams,
  DialogueAdvanceParams,
  DialogueChoiceParams,
  DialogueEndCommandParams,
  DialogueStateGetOutput,
  DialogueStartedParams,
  DialogueNodeParams,
  DialogueTextTickParams,
  DialogueChoicesParams,
  DialogueAdvancedParams,
  DialogueChoiceMadeParams,
  DialogueEndedParams,
} from './types/dialogue.js';
