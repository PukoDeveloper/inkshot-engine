import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { DebugPlugin } from '../src/plugins/DebugPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  DebugEventLogGetOutput,
  DebugOverlayVisibleOutput,
} from '../src/types/debug.js';
import { CollisionLayer } from '../src/types/physics.js';
import type { Entity } from '../src/types/entity.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function createContainerStub() {
  const children: unknown[] = [];
  return {
    x: 0,
    y: 0,
    label: '',
    zIndex: 0,
    visible: true,
    parent: null as unknown,
    addChild(c: unknown) {
      children.push(c);
      (c as Record<string, unknown>).parent = this;
      return c;
    },
    removeChild(c: unknown) {
      const i = children.indexOf(c);
      if (i >= 0) children.splice(i, 1);
      (c as Record<string, unknown>).parent = null;
      return c;
    },
    destroy: vi.fn(),
    children,
  };
}

type ContainerStub = ReturnType<typeof createContainerStub>;

function createCoreStub(): { core: Core; worldLayer: ContainerStub; debugLayer: ContainerStub } {
  const events = new EventBus();
  const worldLayer = createContainerStub();
  const debugLayer = createContainerStub();

  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer?: unknown }) => {
    if (_p.name === 'world') output.layer = worldLayer;
  });

  events.on(
    'test',
    'renderer/layer:create',
    (_p: { name: string; zIndex: number }, output: { layer?: unknown }) => {
      if (_p.name === 'debug') output.layer = debugLayer;
    },
  );

  return { core: { events } as unknown as Core, worldLayer, debugLayer };
}

/**
 * Create an entity stub with the minimum shape expected by DebugPlugin.
 */
function createEntityStub(id: string, x = 0, y = 0, tags: string[] = []): Entity {
  return {
    id,
    tags: new Set(tags),
    position: { x, y },
    data: new Map(),
    active: true,
    display: createContainerStub() as unknown as Entity['display'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DebugPlugin', () => {
  let core: Core;
  let debug: DebugPlugin;

  beforeEach(() => {
    ({ core } = createCoreStub());
    debug = new DebugPlugin();
    debug.init(core);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts invisible by default', () => {
    expect(debug.visible).toBe(false);
  });

  it('can start visible via constructor option', () => {
    const { core: c } = createCoreStub();
    const d = new DebugPlugin({ visible: true });
    d.init(c);
    expect(d.visible).toBe(true);
    d.destroy(c);
  });

  it('starts with an empty event log', () => {
    expect(debug.eventLog).toHaveLength(0);
  });

  it('starts with fps = 0', () => {
    expect(debug.fps).toBe(0);
  });

  // -------------------------------------------------------------------------
  // debug/overlay:toggle
  // -------------------------------------------------------------------------

  describe('debug/overlay:toggle', () => {
    it('flips visibility when no explicit value is given', () => {
      expect(debug.visible).toBe(false);

      const { output: o1 } = core.events.emitSync<
        Record<string, never>,
        DebugOverlayVisibleOutput
      >('debug/overlay:toggle', {} as Record<string, never>);
      expect(o1.visible).toBe(true);
      expect(debug.visible).toBe(true);

      const { output: o2 } = core.events.emitSync<
        Record<string, never>,
        DebugOverlayVisibleOutput
      >('debug/overlay:toggle', {} as Record<string, never>);
      expect(o2.visible).toBe(false);
      expect(debug.visible).toBe(false);
    });

    it('sets an explicit visible = true', () => {
      core.events.emitSync('debug/overlay:toggle', { visible: true });
      expect(debug.visible).toBe(true);
    });

    it('sets an explicit visible = false', () => {
      core.events.emitSync('debug/overlay:toggle', { visible: true });
      core.events.emitSync('debug/overlay:toggle', { visible: false });
      expect(debug.visible).toBe(false);
    });

    it('is idempotent — setting the same value twice is fine', () => {
      core.events.emitSync('debug/overlay:toggle', { visible: true });
      core.events.emitSync('debug/overlay:toggle', { visible: true });
      expect(debug.visible).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // debug/overlay:visible
  // -------------------------------------------------------------------------

  describe('debug/overlay:visible', () => {
    it('reflects the current visibility', () => {
      const { output: a } = core.events.emitSync<
        Record<string, never>,
        DebugOverlayVisibleOutput
      >('debug/overlay:visible', {} as Record<string, never>);
      expect(a.visible).toBe(false);

      core.events.emitSync('debug/overlay:toggle', { visible: true });

      const { output: b } = core.events.emitSync<
        Record<string, never>,
        DebugOverlayVisibleOutput
      >('debug/overlay:visible', {} as Record<string, never>);
      expect(b.visible).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Event log — recording
  // -------------------------------------------------------------------------

  describe('event log recording', () => {
    it('captures events dispatched via emitSync', () => {
      core.events.emitSync('game/state:set', { state: 'playing' });
      expect(debug.eventLog.length).toBeGreaterThan(0);

      const entry = debug.eventLog.find((e) => e.name === 'game/state:set');
      expect(entry).toBeDefined();
      expect(entry?.params).toEqual({ state: 'playing' });
    });

    it('captures events dispatched via emit (async)', async () => {
      await core.events.emit('scene/load', { id: 'level1' });
      const entry = debug.eventLog.find((e) => e.name === 'scene/load');
      expect(entry).toBeDefined();
    });

    it('does NOT capture debug/* events to prevent recursive log pollution', () => {
      core.events.emitSync('debug/overlay:toggle', {});
      const debugEntries = debug.eventLog.filter((e) => e.name.startsWith('debug/'));
      expect(debugEntries).toHaveLength(0);
    });

    it('records the timestamp using performance.now()', () => {
      const before = performance.now();
      core.events.emitSync('core/start', {});
      const after = performance.now();

      const entry = debug.eventLog.find((e) => e.name === 'core/start');
      expect(entry).toBeDefined();
      expect(entry!.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry!.timestamp).toBeLessThanOrEqual(after);
    });

    it('respects maxEventLogSize and evicts oldest entries', () => {
      const { core: c } = createCoreStub();
      const d = new DebugPlugin({ maxEventLogSize: 3 });
      d.init(c);

      for (let i = 0; i < 5; i++) {
        c.events.emitSync(`custom/event${i}`, {});
      }

      // Emit 5 custom events. With maxEventLogSize: 3, only the last 3 are kept.
      const loggedNames = d.eventLog.map((e) => e.name);
      expect(loggedNames).toHaveLength(3);
      expect(loggedNames[0]).toBe('custom/event2');
      expect(loggedNames[2]).toBe('custom/event4');

      d.destroy(c);
    });
  });

  // -------------------------------------------------------------------------
  // Event log — filter
  // -------------------------------------------------------------------------

  describe('debug/event-log:filter', () => {
    beforeEach(() => {
      core.events.emitSync('physics/move', { entityId: 'e1' });
      core.events.emitSync('game/state:set', { state: 'playing' });
      core.events.emitSync('physics/query', {});
    });

    it('returns all entries when filter is empty', () => {
      const { output } = core.events.emitSync<Record<string, never>, DebugEventLogGetOutput>(
        'debug/event-log:get',
        {} as Record<string, never>,
      );
      expect(output.entries.length).toBeGreaterThanOrEqual(3);
    });

    it('filters entries by substring (case-insensitive)', () => {
      core.events.emitSync('debug/event-log:filter', { filter: 'physics' });

      const { output } = core.events.emitSync<Record<string, never>, DebugEventLogGetOutput>(
        'debug/event-log:get',
        {} as Record<string, never>,
      );
      expect(output.entries.every((e) => e.name.toLowerCase().includes('physics'))).toBe(true);
      expect(output.entries.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty when filter matches nothing', () => {
      core.events.emitSync('debug/event-log:filter', { filter: 'xyzzy_does_not_exist' });

      const { output } = core.events.emitSync<Record<string, never>, DebugEventLogGetOutput>(
        'debug/event-log:get',
        {} as Record<string, never>,
      );
      expect(output.entries).toHaveLength(0);
    });

    it('clears the filter when passed an empty string', () => {
      core.events.emitSync('debug/event-log:filter', { filter: 'physics' });
      core.events.emitSync('debug/event-log:filter', { filter: '' });

      const { output } = core.events.emitSync<Record<string, never>, DebugEventLogGetOutput>(
        'debug/event-log:get',
        {} as Record<string, never>,
      );
      expect(output.entries.length).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // Collider tracking
  // -------------------------------------------------------------------------

  describe('collider tracking', () => {
    it('tracks colliders added via physics/body:add', () => {
      core.events.emitSync('physics/body:add', {
        entityId: 'player',
        shape: { type: 'rect', width: 16, height: 24 },
        layer: CollisionLayer.BODY,
      });

      // Internal state is visible indirectly through the collider being present
      // when drawing (no errors thrown)
      expect(() =>
        core.events.emitSync('core/render', { alpha: 0, delta: 16 }),
      ).not.toThrow();
    });

    it('removes colliders after physics/body:remove', () => {
      core.events.emitSync('physics/body:add', {
        entityId: 'player',
        shape: { type: 'circle', radius: 8 },
        layer: CollisionLayer.HURTBOX,
      });
      core.events.emitSync('physics/body:remove', { entityId: 'player' });

      // Toggle overlay on to force draw path — should not throw
      core.events.emitSync('debug/overlay:toggle', { visible: true });
      expect(() =>
        core.events.emitSync('core/render', { alpha: 0, delta: 16 }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Entity tracking
  // -------------------------------------------------------------------------

  describe('entity tracking', () => {
    it('adds entities on entity/created', () => {
      const entity = createEntityStub('hero', 100, 200, ['player']);
      core.events.emitSync('entity/created', { entity });

      // Trigger inspector update — should not throw
      core.events.emitSync('debug/overlay:toggle', { visible: true });
      expect(() =>
        core.events.emitSync('core/render', { alpha: 0, delta: 16 }),
      ).not.toThrow();
    });

    it('removes entities on entity/destroyed', () => {
      const entity = createEntityStub('hero');
      core.events.emitSync('entity/created', { entity });
      core.events.emitSync('entity/destroyed', { entity });

      // No assertion on internals — just ensure no errors
      core.events.emitSync('debug/overlay:toggle', { visible: true });
      expect(() =>
        core.events.emitSync('core/render', { alpha: 0, delta: 16 }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // FPS tracking
  // -------------------------------------------------------------------------

  describe('FPS tracking', () => {
    it('updates fps after core/render events', () => {
      // Simulate 10 frames at 16.67 ms each
      for (let i = 0; i < 10; i++) {
        core.events.emitSync('core/render', { alpha: 0, delta: 16.67 });
      }
      expect(debug.fps).toBeGreaterThan(0);
      // Should be close to 60 fps
      expect(debug.fps).toBeGreaterThanOrEqual(55);
      expect(debug.fps).toBeLessThanOrEqual(65);
    });

    it('respects fpsHistorySize option', () => {
      const { core: c } = createCoreStub();
      const d = new DebugPlugin({ fpsHistorySize: 5 });
      d.init(c);

      for (let i = 0; i < 20; i++) {
        c.events.emitSync('core/render', { alpha: 0, delta: 16.67 });
      }

      // Internal frameTimes array is capped at 5 entries; fps should still be valid
      expect(d.fps).toBeGreaterThan(0);
      d.destroy(c);
    });
  });

  // -------------------------------------------------------------------------
  // Tilemap tracking
  // -------------------------------------------------------------------------

  describe('tilemap tracking', () => {
    it('stores tilemap data on tilemap/loaded', () => {
      const mapData = {
        tileWidth: 16, tileHeight: 16,
        mapWidth: 4, mapHeight: 4,
        tilesets: [],
        layers: [],
      };
      core.events.emitSync('tilemap/loaded', { mapData });

      // Enable overlay and render — should draw grid without errors
      core.events.emitSync('debug/overlay:toggle', { visible: true });
      expect(() =>
        core.events.emitSync('core/render', { alpha: 0, delta: 16 }),
      ).not.toThrow();
    });

    it('clears tilemap data on tilemap/unloaded', () => {
      const mapData = {
        tileWidth: 16, tileHeight: 16,
        mapWidth: 4, mapHeight: 4,
        tilesets: [],
        layers: [],
      };
      core.events.emitSync('tilemap/loaded', { mapData });
      core.events.emitSync('tilemap/unloaded', {});

      core.events.emitSync('debug/overlay:toggle', { visible: true });
      expect(() =>
        core.events.emitSync('core/render', { alpha: 0, delta: 16 }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // EventBus.addSpy
  // -------------------------------------------------------------------------

  describe('EventBus.addSpy', () => {
    it('spy is called for every emitSync', () => {
      const { core: c } = createCoreStub();
      const spy = vi.fn();
      const unspy = c.events.addSpy(spy);

      c.events.emitSync('some/event', { x: 1 });
      expect(spy).toHaveBeenCalledWith('some/event', { x: 1 });

      unspy();
      spy.mockClear();

      c.events.emitSync('some/event', { x: 2 });
      expect(spy).not.toHaveBeenCalled();
    });

    it('spy is called for every emit (async)', async () => {
      const { core: c } = createCoreStub();
      const spy = vi.fn();
      const unspy = c.events.addSpy(spy);

      await c.events.emit('async/event', { y: 99 });
      expect(spy).toHaveBeenCalledWith('async/event', { y: 99 });

      unspy();
    });

    it('multiple spies can be registered independently', () => {
      const { core: c } = createCoreStub();
      const spyA = vi.fn();
      const spyB = vi.fn();

      const unspyA = c.events.addSpy(spyA);
      const unspyB = c.events.addSpy(spyB);

      c.events.emitSync('multi/test', {});
      expect(spyA).toHaveBeenCalledTimes(1);
      expect(spyB).toHaveBeenCalledTimes(1);

      unspyA();
      c.events.emitSync('multi/test', {});
      expect(spyA).toHaveBeenCalledTimes(1); // no new calls
      expect(spyB).toHaveBeenCalledTimes(2);

      unspyB();
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops responding to events after destroy', () => {
      debug.destroy(core);

      // emitting events after destroy should not update the plugin
      core.events.emitSync('game/state:set', { state: 'playing' });
      expect(debug.eventLog).toHaveLength(0);
    });

    it('spy is removed on destroy', () => {
      const spyFn = vi.fn();
      const unspy = core.events.addSpy(spyFn);

      debug.destroy(core);

      // The DebugPlugin's own spy was removed.
      // Our external spy should still work though.
      core.events.emitSync('any/event', {});
      expect(spyFn).toHaveBeenCalled();

      unspy();
    });

    it('clears internal state on destroy', () => {
      core.events.emitSync('physics/body:add', {
        entityId: 'e1',
        shape: { type: 'rect', width: 10, height: 10 },
        layer: CollisionLayer.BODY,
      });
      core.events.emitSync('entity/created', { entity: createEntityStub('e1') });
      core.events.emitSync('game/state:set', { state: 'playing' });

      debug.destroy(core);

      expect(debug.fps).toBe(0);
      expect(debug.eventLog).toHaveLength(0);
    });
  });
});
