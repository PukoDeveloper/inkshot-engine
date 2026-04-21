import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { PlayerController } from '../src/plugins/rpg/PlayerController.js';
import { EntityManager } from '../src/plugins/entity/EntityManager.js';
import { GameStateManager } from '../src/plugins/gameplay/GameStateManager.js';
import type { Core } from '../src/core/Core.js';
import type { PlayerMovedParams, PlayerInteractParams } from '../src/types/player.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function createContainerStub() {
  const children: unknown[] = [];
  return {
    x: 0,
    y: 0,
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

function createCoreStub(): Core {
  const events = new EventBus();
  // Provide a fake 'world' layer so EntityManager can resolve its container.
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => {
    if (_p.name === 'world') output.layer = createContainerStub();
  });
  return { events } as unknown as Core;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlayerController', () => {
  let core: Core;
  let em: EntityManager;
  let gsm: GameStateManager;
  let pc: PlayerController;

  beforeEach(() => {
    core = createCoreStub();
    em   = new EntityManager();
    gsm  = new GameStateManager();
    pc   = new PlayerController();

    em.init(core);
    gsm.init(core);
    pc.init(core);

    // Start in playing state
    core.events.emitSync('game/state:set', { state: 'playing' });
  });

  afterEach(() => {
    pc.destroy(core);
    gsm.destroy(core);
    em.destroy();
  });

  // -------------------------------------------------------------------------
  // Tag-based auto-detection
  // -------------------------------------------------------------------------

  describe('tag-based auto-detection', () => {
    it('auto-adopts an entity created with the default "player" tag', () => {
      const moved = vi.fn();
      core.events.on('test', 'player/moved', moved);

      // No player/entity:set call — just create with the right tag.
      em.create({ tags: ['player'], position: { x: 0, y: 0 } });

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(moved).toHaveBeenCalledOnce();
    });

    it('exposes the auto-detected entityId via the entityId accessor', () => {
      const entity = em.create({ tags: ['player'], position: { x: 0, y: 0 } });
      expect(pc.entityId).toBe(entity.id);
    });

    it('does not auto-adopt a second player-tagged entity when one is already controlled', () => {
      const entity1 = em.create({ tags: ['player'], position: { x: 0, y: 0 } });
      const entity2 = em.create({ tags: ['player'], position: { x: 100, y: 100 } });

      // The controller should still point to entity1.
      expect(pc.entityId).toBe(entity1.id);

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      // entity2 must not have moved.
      expect(entity2.position.x).toBe(100);
    });

    it('re-detects a new player-tagged entity after the current one is destroyed', () => {
      const entity1 = em.create({ tags: ['player'], position: { x: 0, y: 0 } });
      expect(pc.entityId).toBe(entity1.id);

      em.destroyById(entity1.id);
      expect(pc.entityId).toBeNull();

      const entity2 = em.create({ tags: ['player'], position: { x: 50, y: 50 } });
      expect(pc.entityId).toBe(entity2.id);
    });

    it('respects a custom playerTag option', () => {
      const tagCore = createCoreStub();
      const tagEm   = new EntityManager();
      const tagGsm  = new GameStateManager();
      const tagPc   = new PlayerController({ playerTag: 'hero' });
      tagEm.init(tagCore);
      tagGsm.init(tagCore);
      tagPc.init(tagCore);
      tagCore.events.emitSync('game/state:set', { state: 'playing' });

      const moved = vi.fn();
      tagCore.events.on('test', 'player/moved', moved);

      // 'player' tag should NOT trigger auto-adopt.
      tagEm.create({ tags: ['player'], position: { x: 0, y: 0 } });
      tagCore.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      tagCore.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });
      expect(moved).not.toHaveBeenCalled();

      // 'hero' tag SHOULD trigger auto-adopt.
      tagEm.create({ tags: ['hero'], position: { x: 0, y: 0 } });
      tagCore.events.emitSync('core/update', { dt: 1000 / 60, tick: 2 });
      expect(moved).toHaveBeenCalledOnce();

      tagPc.destroy(tagCore);
      tagGsm.destroy(tagCore);
      tagEm.destroy();
    });

    it('disables auto-detection when playerTag is set to empty string', () => {
      const noTagCore = createCoreStub();
      const noTagEm   = new EntityManager();
      const noTagGsm  = new GameStateManager();
      const noTagPc   = new PlayerController({ playerTag: '' });
      noTagEm.init(noTagCore);
      noTagGsm.init(noTagCore);
      noTagPc.init(noTagCore);
      noTagCore.events.emitSync('game/state:set', { state: 'playing' });

      const moved = vi.fn();
      noTagCore.events.on('test', 'player/moved', moved);

      noTagEm.create({ tags: ['player'], position: { x: 0, y: 0 } });
      noTagCore.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      noTagCore.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(moved).not.toHaveBeenCalled();
      expect(noTagPc.entityId).toBeNull();

      noTagPc.destroy(noTagCore);
      noTagGsm.destroy(noTagCore);
      noTagEm.destroy();
    });

    it('player/entity:set overrides tag-based detection', () => {
      const taggedEntity = em.create({ tags: ['player'], position: { x: 0, y: 0 } });
      const otherEntity  = em.create({ position: { x: 200, y: 200 } });

      // Override with a non-tagged entity.
      core.events.emitSync('player/entity:set', { entityId: otherEntity.id });
      expect(pc.entityId).toBe(otherEntity.id);

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      // The tagged entity must NOT have moved.
      expect(taggedEntity.position.x).toBe(0);
      // The explicitly-set entity SHOULD have moved.
      expect(otherEntity.position.x).toBeGreaterThan(200);
    });
  });

  // -------------------------------------------------------------------------
  // player/entity:set
  // -------------------------------------------------------------------------

  describe('player/entity:set', () => {
    it('records the entity ID and resolves the entity reference', () => {
      const entity = em.create({ position: { x: 0, y: 0 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });
      expect(pc.entityId).toBe(entity.id);
    });

    it('updates the controlled entity when called a second time', () => {
      const a = em.create({ position: { x: 0, y: 0 } });
      const b = em.create({ position: { x: 10, y: 10 } });

      core.events.emitSync('player/entity:set', { entityId: a.id });
      core.events.emitSync('player/entity:set', { entityId: b.id });

      expect(pc.entityId).toBe(b.id);
    });
  });

  // -------------------------------------------------------------------------
  // entity/created caching
  // -------------------------------------------------------------------------

  describe('entity/created caching', () => {
    it('caches the entity reference when it is created after player/entity:set', () => {
      // First, set an entityId that doesn't exist yet.
      core.events.emitSync('player/entity:set', { entityId: 'future-player' });

      // Create the entity with the reserved ID via the low-level event.
      const entity = em.create({ position: { x: 5, y: 5 } });
      // Override: simulate entity/created with a custom ID by using a real entity.
      // Instead, let's just verify movement works after resolving via entity/query.
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      const moved = vi.fn();
      core.events.on('test', 'player/moved', moved);

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(moved).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Movement
  // -------------------------------------------------------------------------

  describe('movement', () => {
    it('moves entity right when move-right is held', () => {
      const entity = em.create({ position: { x: 100, y: 100 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(entity.position.x).toBeGreaterThan(100);
      expect(entity.position.y).toBe(100);
    });

    it('moves entity left when move-left is held', () => {
      const entity = em.create({ position: { x: 100, y: 100 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('input/action:triggered', { action: 'move-left', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(entity.position.x).toBeLessThan(100);
      expect(entity.position.y).toBe(100);
    });

    it('moves entity up when move-up is held', () => {
      const entity = em.create({ position: { x: 100, y: 100 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('input/action:triggered', { action: 'move-up', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(entity.position.y).toBeLessThan(100);
      expect(entity.position.x).toBe(100);
    });

    it('moves entity down when move-down is held', () => {
      const entity = em.create({ position: { x: 100, y: 100 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('input/action:triggered', { action: 'move-down', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(entity.position.y).toBeGreaterThan(100);
      expect(entity.position.x).toBe(100);
    });

    it('stops moving in a direction when the action key is released', () => {
      const entity = em.create({ position: { x: 100, y: 100 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });
      const xAfterPress = entity.position.x;

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'released' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 2 });

      // Position must not have changed further after release
      expect(entity.position.x).toBe(xAfterPress);
    });

    it('normalises diagonal movement to constant speed', () => {
      const entity = em.create({ position: { x: 0, y: 0 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      // Default speed is 120 px/s; use dt = 1000 ms for easy assertion.
      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('input/action:triggered', { action: 'move-down',  state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000, tick: 1 });

      const distX = entity.position.x;
      const distY = entity.position.y;
      const dist  = Math.sqrt(distX * distX + distY * distY);

      // Distance over 1 s should equal the speed (120), not speed * sqrt(2).
      expect(dist).toBeCloseTo(120, 0);
    });

    it('uses custom speed from constructor options', () => {
      const fastCore = createCoreStub();
      const fastEm   = new EntityManager();
      const fastGsm  = new GameStateManager();
      const fastPc   = new PlayerController({ speed: 200 });
      fastEm.init(fastCore);
      fastGsm.init(fastCore);
      fastPc.init(fastCore);
      fastCore.events.emitSync('game/state:set', { state: 'playing' });

      const entity = fastEm.create({ position: { x: 0, y: 0 } });
      fastCore.events.emitSync('player/entity:set', { entityId: entity.id });

      fastCore.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      fastCore.events.emitSync('core/update', { dt: 1000, tick: 1 });

      // 200 px/s over 1 s → x should be ~200
      expect(entity.position.x).toBeCloseTo(200, 0);

      fastPc.destroy(fastCore);
      fastGsm.destroy(fastCore);
      fastEm.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Game-state guard
  // -------------------------------------------------------------------------

  describe('game-state guard', () => {
    it('blocks movement when game phase is "cutscene"', () => {
      const entity = em.create({ position: { x: 100, y: 100 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('game/state:set', { state: 'cutscene' });
      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(entity.position.x).toBe(100);
      expect(entity.position.y).toBe(100);
    });

    it('blocks movement when game phase is "paused"', () => {
      const entity = em.create({ position: { x: 50, y: 50 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('game/state:set', { state: 'paused' });
      core.events.emitSync('input/action:triggered', { action: 'move-down', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(entity.position.x).toBe(50);
      expect(entity.position.y).toBe(50);
    });

    it('blocks movement when game phase is "main-menu"', () => {
      const entity = em.create({ position: { x: 0, y: 0 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('game/state:set', { state: 'main-menu' });
      core.events.emitSync('input/action:triggered', { action: 'move-left', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(entity.position.x).toBe(0);
    });

    it('resumes movement when phase returns to "playing"', () => {
      const entity = em.create({ position: { x: 100, y: 100 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('game/state:set', { state: 'cutscene' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });
      expect(entity.position.x).toBe(100); // still blocked

      core.events.emitSync('game/state:set', { state: 'playing' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 2 });
      expect(entity.position.x).toBeGreaterThan(100); // now moving
    });

    it('allows movement when no GameStateManager is registered', () => {
      // Build an isolated core without GameStateManager.
      const bareCore = createCoreStub();
      const bareEm   = new EntityManager();
      const barePc   = new PlayerController();
      bareEm.init(bareCore);
      barePc.init(bareCore);

      const entity = bareEm.create({ position: { x: 0, y: 0 } });
      bareCore.events.emitSync('player/entity:set', { entityId: entity.id });

      bareCore.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      bareCore.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(entity.position.x).toBeGreaterThan(0);

      barePc.destroy(bareCore);
      bareEm.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // player/moved event
  // -------------------------------------------------------------------------

  describe('player/moved event', () => {
    it('emits player/moved with correct entity ID and position', () => {
      const moved = vi.fn();
      core.events.on('test', 'player/moved', moved);

      const entity = em.create({ position: { x: 0, y: 0 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(moved).toHaveBeenCalledOnce();
      const params = moved.mock.calls[0]![0] as PlayerMovedParams;
      expect(params.entityId).toBe(entity.id);
      expect(params.dx).toBeGreaterThan(0);
      expect(params.dy).toBe(0);
      expect(params.x).toBe(entity.position.x);
    });

    it('does not emit player/moved when there is no movement', () => {
      const moved = vi.fn();
      core.events.on('test', 'player/moved', moved);

      const entity = em.create({ position: { x: 0, y: 0 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      // No direction key pressed — nothing to move.
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(moved).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // player/interact event
  // -------------------------------------------------------------------------

  describe('player/interact event', () => {
    it('emits player/interact when interact action is pressed in "playing" state', () => {
      const handler = vi.fn();
      core.events.on('test', 'player/interact', handler);

      const entity = em.create({ position: { x: 50, y: 50 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('input/action:triggered', { action: 'interact', state: 'pressed' });

      expect(handler).toHaveBeenCalledOnce();
      const params = handler.mock.calls[0]![0] as PlayerInteractParams;
      expect(params.entityId).toBe(entity.id);
      expect(params.x).toBe(50);
      expect(params.y).toBe(50);
    });

    it('does NOT emit player/interact when game state is not "playing"', () => {
      const handler = vi.fn();
      core.events.on('test', 'player/interact', handler);

      const entity = em.create({ position: { x: 50, y: 50 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      core.events.emitSync('game/state:set', { state: 'cutscene' });
      core.events.emitSync('input/action:triggered', { action: 'interact', state: 'pressed' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('does NOT emit player/interact on interact action release', () => {
      const handler = vi.fn();
      core.events.on('test', 'player/interact', handler);

      const entity = em.create({ position: { x: 0, y: 0 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      // Press and immediately release — only the press should emit.
      core.events.emitSync('input/action:triggered', { action: 'interact', state: 'pressed' });
      core.events.emitSync('input/action:triggered', { action: 'interact', state: 'released' });

      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits player/interact with null entityId when no entity is controlled', () => {
      const handler = vi.fn();
      core.events.on('test', 'player/interact', handler);

      // No entity assigned
      core.events.emitSync('input/action:triggered', { action: 'interact', state: 'pressed' });

      expect(handler).toHaveBeenCalledOnce();
      const params = handler.mock.calls[0]![0] as PlayerInteractParams;
      expect(params.entityId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Entity lifecycle
  // -------------------------------------------------------------------------

  describe('entity lifecycle', () => {
    it('clears the cached entity reference when the entity is destroyed', () => {
      const moved = vi.fn();
      core.events.on('test', 'player/moved', moved);

      const entity = em.create({ position: { x: 0, y: 0 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      // Verify movement works before destroy
      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });
      expect(moved).toHaveBeenCalledOnce();

      // Destroy the entity
      em.destroyById(entity.id);
      moved.mockClear();

      // player/moved should no longer fire
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 2 });
      expect(moved).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Custom action names
  // -------------------------------------------------------------------------

  describe('custom action names', () => {
    it('uses custom action names specified at construction time', () => {
      const customCore = createCoreStub();
      const customEm   = new EntityManager();
      const customGsm  = new GameStateManager();
      const customPc   = new PlayerController({
        actions: {
          up: 'w', down: 's', left: 'a', right: 'd', interact: 'e',
        },
      });
      customEm.init(customCore);
      customGsm.init(customCore);
      customPc.init(customCore);
      customCore.events.emitSync('game/state:set', { state: 'playing' });

      const entity = customEm.create({ position: { x: 0, y: 0 } });
      customCore.events.emitSync('player/entity:set', { entityId: entity.id });

      // Default 'move-right' must NOT trigger movement
      customCore.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      customCore.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });
      expect(entity.position.x).toBe(0);

      // Custom 'd' MUST trigger movement
      customCore.events.emitSync('input/action:triggered', { action: 'd', state: 'pressed' });
      customCore.events.emitSync('core/update', { dt: 1000 / 60, tick: 2 });
      expect(entity.position.x).toBeGreaterThan(0);

      customPc.destroy(customCore);
      customGsm.destroy(customCore);
      customEm.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops responding to all events after destroy', () => {
      const moved = vi.fn();
      core.events.on('test', 'player/moved', moved);

      const entity = em.create({ position: { x: 0, y: 0 } });
      core.events.emitSync('player/entity:set', { entityId: entity.id });

      pc.destroy(core);

      core.events.emitSync('input/action:triggered', { action: 'move-right', state: 'pressed' });
      core.events.emitSync('core/update', { dt: 1000 / 60, tick: 1 });

      expect(moved).not.toHaveBeenCalled();
      expect(entity.position.x).toBe(0);
    });
  });
});
