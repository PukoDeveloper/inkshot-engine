import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { EntityManager } from '../src/plugins/EntityManager.js';
import type { Entity, EntityQueryOutput, EntityCreateOutput } from '../src/types/entity.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function createContainerStub() {
  const children: unknown[] = [];
  return {
    x: 0,
    y: 0,
    zIndex: 0,
    sortableChildren: false,
    label: '',
    parent: null as unknown,
    addChild(c: unknown) { children.push(c); (c as Record<string, unknown>).parent = this; },
    removeChild(c: unknown) {
      const i = children.indexOf(c);
      if (i >= 0) children.splice(i, 1);
      (c as Record<string, unknown>).parent = null;
    },
    destroy: vi.fn(),
    children,
  };
}

function createCoreStub() {
  const events = new EventBus();
  const worldLayer = createContainerStub();

  // Register a fake renderer/layer handler so EntityManager can resolve 'world'.
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => {
    if (_p.name === 'world') output.layer = worldLayer;
  });

  return {
    core: { events } as unknown as import('../src/core/Core.js').Core,
    worldLayer,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntityManager', () => {
  let core: import('../src/core/Core.js').Core;
  let worldLayer: ReturnType<typeof createContainerStub>;
  let em: EntityManager;

  beforeEach(() => {
    const stub = createCoreStub();
    core = stub.core;
    worldLayer = stub.worldLayer;
    em = new EntityManager();
    em.init(core);
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('creates an entity with default values', () => {
      const entity = em.create();
      expect(entity.id).toBeTruthy();
      expect(entity.active).toBe(true);
      expect(entity.position).toEqual({ x: 0, y: 0 });
      expect(entity.tags.size).toBe(0);
      expect(entity.data.size).toBe(0);
    });

    it('creates an entity with explicit id, tags, and position', () => {
      const entity = em.create({
        id: 'hero',
        tags: ['player', 'controllable'],
        position: { x: 100, y: 200 },
      });
      expect(entity.id).toBe('hero');
      expect(entity.tags.has('player')).toBe(true);
      expect(entity.tags.has('controllable')).toBe(true);
      expect(entity.position).toEqual({ x: 100, y: 200 });
    });

    it('adds the display object to the world layer', () => {
      em.create({ id: 'a' });
      expect(worldLayer.children.length).toBe(1);
    });

    it('syncs initial display position', () => {
      const entity = em.create({ position: { x: 50, y: 75 } });
      expect(entity.display.x).toBe(50);
      expect(entity.display.y).toBe(75);
    });

    it('throws on duplicate ID', () => {
      em.create({ id: 'dup' });
      expect(() => em.create({ id: 'dup' })).toThrow(/already exists/);
    });

    it('emits entity/created event', () => {
      const handler = vi.fn();
      core.events.on('test', 'entity/created', handler);
      const entity = em.create({ id: 'x' });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ entity }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // get / count / all
  // -----------------------------------------------------------------------

  describe('get / count / all', () => {
    it('retrieves an entity by ID', () => {
      const entity = em.create({ id: 'hero' });
      expect(em.get('hero')).toBe(entity);
    });

    it('returns undefined for unknown ID', () => {
      expect(em.get('nope')).toBeUndefined();
    });

    it('reports entity count', () => {
      em.create();
      em.create();
      expect(em.count).toBe(2);
    });

    it('returns all entities', () => {
      em.create({ id: 'a' });
      em.create({ id: 'b' });
      expect(em.all()).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // destroyById
  // -----------------------------------------------------------------------

  describe('destroyById', () => {
    it('removes an entity', () => {
      em.create({ id: 'del' });
      em.destroyById('del');
      expect(em.get('del')).toBeUndefined();
      expect(em.count).toBe(0);
    });

    it('marks entity as inactive', () => {
      const entity = em.create({ id: 'del' });
      em.destroyById('del');
      expect(entity.active).toBe(false);
    });

    it('emits entity/destroyed event', () => {
      const handler = vi.fn();
      core.events.on('test', 'entity/destroyed', handler);
      const entity = em.create({ id: 'x' });
      em.destroyById('x');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ entity }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('is a no-op for unknown ID', () => {
      expect(() => em.destroyById('nope')).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // query
  // -----------------------------------------------------------------------

  describe('query', () => {
    it('returns all entities when no filters', () => {
      em.create({ id: 'a' });
      em.create({ id: 'b' });
      expect(em.query()).toHaveLength(2);
    });

    it('filters by tags (AND logic)', () => {
      em.create({ id: 'a', tags: ['enemy', 'flying'] });
      em.create({ id: 'b', tags: ['enemy'] });
      em.create({ id: 'c', tags: ['npc'] });

      const result = em.query({ tags: ['enemy', 'flying'] });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });

    it('filters by spatial rectangle', () => {
      em.create({ id: 'inside', position: { x: 50, y: 50 } });
      em.create({ id: 'outside', position: { x: 200, y: 200 } });

      const result = em.query({ rect: { x: 0, y: 0, width: 100, height: 100 } });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inside');
    });

    it('combines tag and rect filters', () => {
      em.create({ id: 'a', tags: ['enemy'], position: { x: 50, y: 50 } });
      em.create({ id: 'b', tags: ['enemy'], position: { x: 200, y: 200 } });
      em.create({ id: 'c', tags: ['npc'], position: { x: 50, y: 50 } });

      const result = em.query({
        tags: ['enemy'],
        rect: { x: 0, y: 0, width: 100, height: 100 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });
  });

  // -----------------------------------------------------------------------
  // Position sync on core/update
  // -----------------------------------------------------------------------

  describe('position sync', () => {
    it('syncs entity position to display on fixed update', () => {
      const entity = em.create({ position: { x: 10, y: 20 } });
      entity.position.x = 99;
      entity.position.y = 88;

      core.events.emitSync('core/update', { dt: 16.67, tick: 0 });

      expect(entity.display.x).toBe(99);
      expect(entity.display.y).toBe(88);
    });
  });

  // -----------------------------------------------------------------------
  // EventBus API
  // -----------------------------------------------------------------------

  describe('EventBus integration', () => {
    it('entity/create creates via event', () => {
      const { output } = core.events.emitSync('entity/create', {
        id: 'ev',
        tags: ['player'],
        position: { x: 1, y: 2 },
      }) as { output: EntityCreateOutput };

      expect(output.entity.id).toBe('ev');
      expect(em.get('ev')).toBe(output.entity);
    });

    it('entity/destroy destroys via event', () => {
      em.create({ id: 'rm' });
      core.events.emitSync('entity/destroy', { id: 'rm' });
      expect(em.get('rm')).toBeUndefined();
    });

    it('entity/query queries via event', () => {
      em.create({ id: 'a', tags: ['x'] });
      em.create({ id: 'b', tags: ['y'] });

      const { output } = core.events.emitSync('entity/query', { tags: ['x'] }) as {
        output: EntityQueryOutput;
      };
      expect(output.entities).toHaveLength(1);
      expect(output.entities[0].id).toBe('a');
    });
  });

  // -----------------------------------------------------------------------
  // Y-Sort
  // -----------------------------------------------------------------------

  describe('Y-Sort', () => {
    it('defaults ySort to false and ySortOffset to 0', () => {
      const entity = em.create();
      expect(entity.ySort).toBe(false);
      expect(entity.ySortOffset).toBe(0);
    });

    it('stores ySort and ySortOffset from descriptor', () => {
      const entity = em.create({ ySort: true, ySortOffset: 32 });
      expect(entity.ySort).toBe(true);
      expect(entity.ySortOffset).toBe(32);
    });

    it('sets initial zIndex from position.y + ySortOffset when ySort is true', () => {
      const entity = em.create({ position: { x: 0, y: 100 }, ySort: true, ySortOffset: 16 });
      expect(entity.display.zIndex).toBe(116);
    });

    it('does not set zIndex when ySort is false', () => {
      const entity = em.create({ position: { x: 0, y: 100 }, ySort: false });
      expect(entity.display.zIndex).toBe(0);
    });

    it('updates display.zIndex on core/update when ySort is true', () => {
      const entity = em.create({ position: { x: 0, y: 50 }, ySort: true, ySortOffset: 0 });
      entity.position.y = 200;

      core.events.emitSync('core/update', { dt: 16.67, tick: 1 });

      expect(entity.display.zIndex).toBe(200);
    });

    it('includes ySortOffset in zIndex update', () => {
      const entity = em.create({ position: { x: 0, y: 50 }, ySort: true, ySortOffset: 24 });
      entity.position.y = 100;

      core.events.emitSync('core/update', { dt: 16.67, tick: 1 });

      expect(entity.display.zIndex).toBe(124);
    });

    it('does not update zIndex on core/update when ySort is false', () => {
      const entity = em.create({ position: { x: 0, y: 50 }, ySort: false });
      entity.position.y = 200;

      core.events.emitSync('core/update', { dt: 16.67, tick: 1 });

      expect(entity.display.zIndex).toBe(0);
    });

    it('enables sortableChildren on the world layer', () => {
      expect(worldLayer.sortableChildren).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Plugin destroy
  // -----------------------------------------------------------------------

  describe('plugin destroy', () => {
    it('removes all entities and clears listeners', () => {
      em.create({ id: 'a' });
      em.create({ id: 'b' });
      em.destroy();
      expect(em.count).toBe(0);
    });
  });
});
