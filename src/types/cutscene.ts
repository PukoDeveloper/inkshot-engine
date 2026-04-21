// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

/** The type discriminant for all cutscene step variants. */
export type CutsceneStepKind =
  | 'wait'
  | 'camera-move'
  | 'camera-zoom'
  | 'camera-shake'
  | 'camera-follow'
  | 'emit'
  | 'script'
  | 'lock-input'
  | 'unlock-input'
  | 'parallel';

/** Wait for `duration` milliseconds. */
export interface CutsceneStepWait {
  kind: 'wait';
  duration: number;
}

/** Move the camera to a world-space position over `duration` ms. */
export interface CutsceneStepCameraMove {
  kind: 'camera-move';
  x: number;
  y: number;
  /** Duration in ms. `0` = instant. Default `500`. */
  duration?: number;
}

/** Set the camera zoom level over `duration` ms. */
export interface CutsceneStepCameraZoom {
  kind: 'camera-zoom';
  zoom: number;
  /** Duration in ms. Default `500`. */
  duration?: number;
}

/** Trigger a camera shake. */
export interface CutsceneStepCameraShake {
  kind: 'camera-shake';
  intensity: number;
  duration: number;
  decay?: 'linear' | 'exponential';
}

/** Set or clear the camera follow target by entity id. `null` = unfollow. */
export interface CutsceneStepCameraFollow {
  kind: 'camera-follow';
  entityId: string | null;
}

/** Emit a custom event on the event bus and optionally wait for it to finish. */
export interface CutsceneStepEmit {
  kind: 'emit';
  event: string;
  params?: Record<string, unknown>;
}

/** Run a registered script and wait for it to complete. */
export interface CutsceneStepScript {
  kind: 'script';
  scriptId: string;
  context?: Record<string, unknown>;
}

/** Lock player input for the duration of the cutscene step. */
export interface CutsceneStepLockInput {
  kind: 'lock-input';
}

/** Unlock player input. */
export interface CutsceneStepUnlockInput {
  kind: 'unlock-input';
}

/**
 * Run multiple steps in parallel and wait until **all** have finished.
 */
export interface CutsceneStepParallel {
  kind: 'parallel';
  steps: CutsceneStep[];
}

/** Union of all cutscene step variants. */
export type CutsceneStep =
  | CutsceneStepWait
  | CutsceneStepCameraMove
  | CutsceneStepCameraZoom
  | CutsceneStepCameraShake
  | CutsceneStepCameraFollow
  | CutsceneStepEmit
  | CutsceneStepScript
  | CutsceneStepLockInput
  | CutsceneStepUnlockInput
  | CutsceneStepParallel;

// ---------------------------------------------------------------------------
// Cutscene definition
// ---------------------------------------------------------------------------

/** A complete cutscene definition registered via `cutscene/define`. */
export interface CutsceneDef {
  id: string;
  /** Whether pressing any key / button skips the cutscene. Default `true`. */
  skippable?: boolean;
  steps: CutsceneStep[];
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type CutsceneStatus = 'idle' | 'playing' | 'skipping';

export interface CutsceneState {
  status: CutsceneStatus;
  /** Id of the currently playing cutscene, or `null`. */
  cutsceneId: string | null;
  /** Zero-based index of the current step, or `null` when idle. */
  stepIndex: number | null;
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/** Params for `cutscene/define`. */
export interface CutsceneDefineParams {
  cutscene: CutsceneDef;
}

/** Params for `cutscene/play`. */
export interface CutscenePlayParams {
  id: string;
}

/** Notification emitted as `cutscene/started`. */
export interface CutsceneStartedParams {
  id: string;
}

/** Notification emitted as `cutscene/ended`. */
export interface CutsceneEndedParams {
  id: string;
  /** `true` when the cutscene was skipped rather than played to completion. */
  skipped: boolean;
}

/** Notification emitted as `cutscene/step:started`. */
export interface CutsceneStepStartedParams {
  cutsceneId: string;
  stepIndex: number;
  step: CutsceneStep;
}

/** Notification emitted as `cutscene/step:ended`. */
export interface CutsceneStepEndedParams {
  cutsceneId: string;
  stepIndex: number;
}

/** Output for `cutscene/state`. */
export interface CutsceneStateOutput extends CutsceneState {}
