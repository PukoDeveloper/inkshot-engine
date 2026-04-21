import { Container } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  Entity,
  EntityDescriptor,
  EntityCreateParams,
  EntityCreateOutput,
  EntityDestroyParams,
  EntityQueryParams,
  EntityQueryOutput,
} from '../../types/entity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextId = 0;
function generateId(): string {
  return `entity_${++_nextId}`;
}

// ---------------------------------------------------------------------------
// EntityManager
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of all game entities.
 *
 * Entities are lightweight data objects with a Pixi `Container` display
 * object, a tag set for querying, and an open `data` map for arbitrary
 * component data.  Behaviour is **not** baked in — plugins subscribe to
 * events and act on entities matching their criteria.
 *
 * ### Direct API
 * ```ts
 * const entity = entityManager.create({ tags: ['enemy'], position: { x: 100, y: 200 } });
 * entityManager.query({ tags: ['enemy'] });
 * entityManager.destroy(entity.id);
 * ```
 *
 * ### EventBus API
 * | Event              | Params / Output                  |
 * |--------------------|----------------------------------|
 * | `entity/create`    | `EntityCreateParams → EntityCreateOutput` |
 * | `entity/destroy`   | `EntityDestroyParams`            |
 * | `entity/query`     | `EntityQueryParams → EntityQueryOutput`   |
 * | `entity/created`   | `{ entity }` (notification)      |
 * | `entity/destroyed` | `{ entity }` (notification)      |
 *
 * The manager also syncs each entity's `position` to its `display` transform
 * every fixed update (`core/update`), keeping logical and visual state in
 * lock-step.
 */
export class EntityManager implements EnginePlugin {
  readonly namespace = 'entityManager';

  private _core: Core | null = null;

  /** All living entities keyed by ID. */
  private readonly _entities: Map<string, Entity> = new Map();

  /** Layer container where entity display objects are placed. */
  private _worldLayer: Container | null = null;

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    // Resolve the world layer via EventBus (Renderer must be initialized first).
    const result = core.events.emitSync('renderer/layer', { name: 'world' }) as {
      output: { layer: Container };
    };
    this._worldLayer = result.output.layer;
    // Enable child z-index sorting so Y-sort entities render in the correct
    // painter order without requiring manual re-ordering of the child list.
    if (this._worldLayer) this._worldLayer.sortableChildren = true;

    // Sync entity positions each fixed update.
    core.events.on(this.namespace, 'core/update', this._onUpdate, { priority: -10 });

    // ── EventBus public API ────────────────────────────────────────────
    core.events.on(
      this.namespace,
      'entity/create',
      (params: EntityCreateParams, output: EntityCreateOutput) => {
        output.entity = this.create(params);
      },
    );

    core.events.on(this.namespace, 'entity/destroy', (params: EntityDestroyParams) => {
      this.destroyById(params.id);
    });

    core.events.on(
      this.namespace,
      'entity/query',
      (params: EntityQueryParams, output: EntityQueryOutput) => {
        output.entities = this.query(params);
      },
    );
  }

  destroy(): void {
    // Destroy all entities.
    for (const entity of this._entities.values()) {
      this._removeEntity(entity);
    }
    this._entities.clear();
    this._core?.events.removeNamespace(this.namespace);
    this._core = null;
    this._worldLayer = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Create a new entity and add it to the world.
   */
  create(descriptor: EntityDescriptor = {}): Entity {
    const id = descriptor.id ?? generateId();

    if (this._entities.has(id)) {
      throw new Error(`[EntityManager] Entity with ID "${id}" already exists.`);
    }

    const display = descriptor.display ?? new Container();
    display.label = `entity:${id}`;

    const position = descriptor.position
      ? { x: descriptor.position.x, y: descriptor.position.y }
      : { x: 0, y: 0 };

    // Sync initial display position.
    display.x = position.x;
    display.y = position.y;

    const entity: Entity = {
      id,
      tags: new Set(descriptor.tags ?? []),
      display,
      position,
      data: new Map(),
      active: true,
      ySort: descriptor.ySort ?? false,
      ySortOffset: descriptor.ySortOffset ?? 0,
    };

    // Set an initial zIndex so the entity is correctly sorted before the
    // first update frame fires.
    if (entity.ySort) {
      display.zIndex = position.y + entity.ySortOffset;
    }

    this._entities.set(id, entity);
    this._worldLayer?.addChild(display);

    // Notify listeners.
    this._core?.events.emitSync('entity/created', { entity });

    return entity;
  }

  /**
   * Get an entity by ID, or `undefined` if not found.
   */
  get(id: string): Entity | undefined {
    return this._entities.get(id);
  }

  /**
   * Destroy a single entity by ID and remove it from the world.
   */
  destroyById(id: string): void {
    const entity = this._entities.get(id);
    if (!entity) return;

    // Notify before removal.
    this._core?.events.emitSync('entity/destroyed', { entity });
    this._removeEntity(entity);
    this._entities.delete(id);
  }

  /**
   * Query entities by tags and/or spatial rectangle.
   */
  query(params: EntityQueryParams = {}): Entity[] {
    let results = Array.from(this._entities.values());

    if (params.tags && params.tags.length > 0) {
      const requiredTags = params.tags;
      results = results.filter(e => requiredTags.every(t => e.tags.has(t)));
    }

    if (params.rect) {
      const { x, y, width, height } = params.rect;
      results = results.filter(e =>
        e.position.x >= x &&
        e.position.x <= x + width &&
        e.position.y >= y &&
        e.position.y <= y + height,
      );
    }

    return results;
  }

  /**
   * Return all active entities.
   */
  all(): Entity[] {
    return Array.from(this._entities.values());
  }

  /**
   * Number of active entities.
   */
  get count(): number {
    return this._entities.size;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _removeEntity(entity: Entity): void {
    entity.active = false;
    if (entity.display.parent) {
      entity.display.parent.removeChild(entity.display);
    }
    entity.display.destroy({ children: true });
  }

  /** Sync entity logical positions to display objects. */
  private readonly _onUpdate = (): void => {
    for (const entity of this._entities.values()) {
      entity.display.x = entity.position.x;
      entity.display.y = entity.position.y;
      if (entity.ySort) {
        entity.display.zIndex = entity.position.y + entity.ySortOffset;
      }
    }
  };
}
