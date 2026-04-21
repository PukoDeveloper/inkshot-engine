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

// Data system
export { DataManager } from './plugins/DataManager.js';
export type {
  DataLoadParams,
  DataLoadOutput,
  DataGetParams,
  DataGetOutput,
  DataGetAllParams,
  DataGetAllOutput,
  DataUnloadParams,
  DataUnloadOutput,
} from './types/data.js';

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
export { InputRecorder } from './plugins/InputRecorder.js';
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
  InputTouchStartParams,
  InputTouchEndParams,
  InputTouchMoveParams,
  InputGesturePinchParams,
  InputGestureRotateParams,
  InputGestureSwipeParams,
  InputTouchStateOutput,
  InputRecordEntry,
  InputRecording,
  InputRecorderStartParams,
  InputRecorderStopOutput,
  InputRecorderPlayParams,
  InputRecorderPauseParams,
  InputRecorderResumeParams,
  InputRecorderSaveParams,
  InputRecorderLoadParams,
  InputRecorderLoadOutput,
  InputRecorderStateOutput,
  InputRecorderPlaybackEndParams,
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
export type { EventSpy } from './core/EventBus.js';

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

// Physics system (unified adapter interface + kinematic built-in backend)
export { KinematicPhysicsAdapter } from './plugins/KinematicPhysicsAdapter.js';
export type { KinematicPhysicsAdapterOptions } from './plugins/KinematicPhysicsAdapter.js';
export { MatterPhysicsAdapter } from './plugins/MatterPhysicsAdapter.js';
export type {
  MatterLib,
  MatterBody,
  MatterComposite,
  MatterEngine,
  MatterBounds,
  MatterPhysicsAdapterOptions,
} from './plugins/MatterPhysicsAdapter.js';
export { RapierPhysicsAdapter } from './plugins/RapierPhysicsAdapter.js';
export type {
  RapierLib,
  RapierRigidBody,
  RapierCollider,
  RapierRigidBodyDesc,
  RapierColliderDesc,
  RapierWorld,
  RapierPhysicsAdapterOptions,
} from './plugins/RapierPhysicsAdapter.js';
export { CollisionLayer } from './types/physics.js';
export type {
  PhysicsAdapter,
  TileCollisionShape,
  TileShapeContext,
  TileShapeResolver,
  ColliderShape,
  RectShape,
  CircleShape,
  PointShape,
  Collider,
  TileCollisionMapData,
  PhysicsBodyAddParams,
  PhysicsBodyRemoveParams,
  PhysicsTilemapSetParams,
  PhysicsMoveParams,
  PhysicsMoveOutput,
  PhysicsImpulseParams,
  PhysicsQueryParams,
  PhysicsQueryOutput,
  PhysicsRaycastParams,
  PhysicsRaycastOutput,
  PhysicsGridSnapParams,
  PhysicsGridSnapOutput,
  PhysicsWorldToTileParams,
  PhysicsWorldToTileOutput,
  PhysicsTileToWorldParams,
  PhysicsTileToWorldOutput,
  PhysicsHitParams,
  PhysicsOverlapParams,
} from './types/physics.js';

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
export { ActorManager } from './plugins/rpg/ActorManager.js';
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
  ActorStatePatchParams,
  ActorStatePatchedParams,
  ActorListOutput,
  ActorTriggerParams,
  ActorSpawnedParams,
  ActorDespawnedParams,
  ActorScriptStartedParams,
  ActorScriptEndedParams,
  ActorStateChangedParams,
} from './types/actor.js';

// Player controller
export { PlayerController } from './plugins/rpg/PlayerController.js';
export type {
  PlayerControllerOptions,
  PlayerEntitySetParams,
  PlayerMovedParams,
  PlayerInteractParams,
} from './types/player.js';

// Variable store system
export { VariableStoreManager } from './plugins/rpg/VariableStoreManager.js';
export type {
  StoreNamespace,
  StoreSnapshot,
  StoreSetParams,
  StoreGetParams,
  StoreGetOutput,
  StorePatchParams,
  StoreGetNamespaceParams,
  StoreGetNamespaceOutput,
  StoreClearNamespaceParams,
  StoreSnapshotOutput,
  StoreRestoreParams,
} from './types/store.js';

// Script system
export { ScriptManager } from './plugins/rpg/ScriptManager.js';
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
export { DialogueManager } from './plugins/rpg/DialogueManager.js';
export {
  parseDialogueMarkup,
  buildTextSegments,
  getSpeedAtIndex,
} from './plugins/rpg/DialogueMarkupParser.js';
export type {
  ParsedMarkup,
  ColorSpan,
  SpeedSpan,
  PauseMark,
} from './plugins/rpg/DialogueMarkupParser.js';
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

// Debug / Dev Tools
export { DebugPlugin } from './plugins/DebugPlugin.js';
export type {
  DebugPluginOptions,
  DebugEventEntry,
  DebugOverlayToggleParams,
  DebugOverlayVisibleOutput,
  DebugEventLogFilterParams,
  DebugEventLogGetOutput,
} from './types/debug.js';

// Lighting system
export { LightingPlugin } from './plugins/LightingPlugin.js';
export type {
  PointLight,
  AmbientLight,
  LightingPluginOptions,
  LightAddParams,
  LightAddOutput,
  LightRemoveParams,
  LightUpdateParams,
  LightGetParams,
  LightGetOutput,
  AmbientSetParams,
  LightStateOutput,
} from './types/lighting.js';

// Parallax system
export { ParallaxPlugin } from './plugins/ParallaxPlugin.js';
export type { ParallaxContainer } from './plugins/ParallaxPlugin.js';
export type {
  ParallaxLayerDef,
  ParallaxPluginOptions,
  ParallaxLayerAddParams,
  ParallaxLayerAddOutput,
  ParallaxLayerRemoveParams,
  ParallaxLayerGetParams,
  ParallaxLayerGetOutput,
  ParallaxLayersOutput,
  ParallaxLayerUpdateParams,
} from './types/parallax.js';

// Tiled map loader
export { loadTiledMap } from './plugins/TiledLoader.js';
export type {
  TiledMap,
  TiledLayer,
  TiledTileLayer,
  TiledObjectLayer,
  TiledGroupLayer,
  TiledObject,
  TiledProperty,
  TiledTilesetRef,
  TiledTileData,
  TiledAnimationFrame,
  TiledLoaderOptions,
  TiledLoaderOutput,
} from './plugins/TiledLoader.js';

// Cutscene system
export { CutscenePlugin } from './plugins/CutscenePlugin.js';
export type {
  CutsceneDef,
  CutsceneStep,
  CutsceneStepKind,
  CutsceneStepWait,
  CutsceneStepCameraMove,
  CutsceneStepCameraZoom,
  CutsceneStepCameraShake,
  CutsceneStepCameraFollow,
  CutsceneStepEmit,
  CutsceneStepScript,
  CutsceneStepLockInput,
  CutsceneStepUnlockInput,
  CutsceneStepParallel,
  CutsceneStatus,
  CutsceneState,
  CutsceneDefineParams,
  CutscenePlayParams,
  CutsceneStartedParams,
  CutsceneEndedParams,
  CutsceneStepStartedParams,
  CutsceneStepEndedParams,
  CutsceneStateOutput,
} from './types/cutscene.js';

// Minimap system
export { MinimapPlugin } from './plugins/MinimapPlugin.js';
export type {
  MinimapConfig,
  MinimapIcon,
  MinimapInitParams,
  MinimapIconAddParams,
  MinimapIconAddOutput,
  MinimapIconRemoveParams,
  MinimapIconUpdateParams,
  MinimapIconsOutput,
  MinimapConfigOutput,
} from './types/minimap.js';

// Achievement system
export { AchievementPlugin } from './plugins/AchievementPlugin.js';
export type {
  AchievementDef,
  AchievementState,
  AchievementDefineParams,
  AchievementUnlockParams,
  AchievementProgressParams,
  AchievementGetParams,
  AchievementGetOutput,
  AchievementListOutput,
  AchievementUnlockedParams,
  AchievementResetParams,
} from './types/achievement.js';

// Fog of War system
export { FogOfWarPlugin } from './plugins/FogOfWarPlugin.js';
export type {
  FogTileState,
  FogConfig,
  FogInitParams,
  FogUpdateParams,
  FogRevealParams,
  FogGetTileParams,
  FogGetTileOutput,
  FogStateOutput,
  FogTileRevealedParams,
} from './types/fog.js';
