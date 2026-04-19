import type { Container } from 'pixi.js';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * Descriptor used to create an entity via `EntityManager.create()`.
 */
export interface EntityDescriptor {
  /** Optional explicit ID. If omitted, one is auto-generated. */
  id?: string;
  /** Tags for categorisation and querying (e.g. `'player'`, `'npc'`). */
  tags?: string[];
  /** Initial world position. Defaults to `{ x: 0, y: 0 }`. */
  position?: { x: number; y: number };
  /** If provided, used as the entity's display object. Otherwise a new Container is created. */
  display?: Container;
}

/**
 * A lightweight game object managed by {@link EntityManager}.
 *
 * Entities are **data bags** — behaviour is attached externally by plugins
 * subscribing to EventBus events such as `entity/created`, `core/update`, etc.
 */
export interface Entity {
  /** Unique identifier. */
  readonly id: string;
  /** Mutable tag set for categorisation and querying. */
  readonly tags: Set<string>;
  /** The Pixi display object placed on the world layer. */
  readonly display: Container;
  /** Logical world position (authoritative; display is synced automatically). */
  position: { x: number; y: number };
  /** Open-ended data store for game-specific components (HP, AI state, etc.). */
  readonly data: Map<string, unknown>;
  /** Whether the entity is still alive (not destroyed). */
  active: boolean;
}

// ---------------------------------------------------------------------------
// EventBus params
// ---------------------------------------------------------------------------

/** Emitted when an entity is created. */
export interface EntityCreatedParams {
  entity: Entity;
}

/** Emitted when an entity is about to be destroyed. */
export interface EntityDestroyedParams {
  entity: Entity;
}

/** Params for `entity/create` event. */
export interface EntityCreateParams extends EntityDescriptor {}

/** Output for `entity/create` event. */
export interface EntityCreateOutput {
  entity: Entity;
}

/** Params for `entity/destroy` event. */
export interface EntityDestroyParams {
  id: string;
}

/** Params for `entity/query` event. */
export interface EntityQueryParams {
  /** If provided, only entities with ALL of these tags are returned. */
  tags?: string[];
  /** If provided, only entities inside this rectangle are returned. */
  rect?: { x: number; y: number; width: number; height: number };
}

/** Output for `entity/query` event. */
export interface EntityQueryOutput {
  entities: Entity[];
}

// ---------------------------------------------------------------------------
// Sprite Animator
// ---------------------------------------------------------------------------

/** Params for `animator/define` event. */
export interface AnimatorDefineParams {
  /** Unique name for this animation definition. */
  name: string;
  /** The animation definition. */
  def: {
    frames: string[];
    frameDuration: number;
    loop: boolean;
  };
}

/** Params for `animator/play` event. */
export interface AnimatorPlayParams {
  /** Entity ID whose display object will be animated. */
  entityId: string;
  /** Animation definition name to play. */
  animation: string;
}

/** Params for `animator/stop` event. */
export interface AnimatorStopParams {
  entityId: string;
}
