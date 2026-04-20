import { describe, it, expect } from 'vitest';
import { sortPluginsByDependency } from '../src/core/sortPlugins.js';
import type { EnginePlugin } from '../src/types/plugin.js';
import type { Core } from '../src/core/Core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal EnginePlugin stub. */
function makePlugin(
  namespace: string,
  dependencies?: readonly string[],
): EnginePlugin {
  return {
    namespace,
    dependencies,
    init(_core: Core) {},
  };
}

/** Return the namespaces of a sorted plugin list for easy assertion. */
function namespaces(plugins: EnginePlugin[]): string[] {
  return plugins.map(p => p.namespace);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sortPluginsByDependency', () => {
  // ── Basic ordering ────────────────────────────────────────────────────────

  it('returns an empty array for an empty input', () => {
    expect(sortPluginsByDependency([])).toEqual([]);
  });

  it('returns a single plugin unchanged', () => {
    const p = makePlugin('audio');
    expect(sortPluginsByDependency([p])).toEqual([p]);
  });

  it('preserves original order when no dependencies are declared', () => {
    const a = makePlugin('audio');
    const b = makePlugin('entity');
    const c = makePlugin('scene');
    expect(namespaces(sortPluginsByDependency([a, b, c]))).toEqual(['audio', 'entity', 'scene']);
  });

  it('places a dependency before the plugin that declares it', () => {
    const entity = makePlugin('entity');
    const collision = makePlugin('collision', ['entity']);
    // collision supplied first — should be re-ordered
    expect(namespaces(sortPluginsByDependency([collision, entity]))).toEqual(['entity', 'collision']);
  });

  it('handles a chain: A → B → C', () => {
    const a = makePlugin('A');
    const b = makePlugin('B', ['A']);
    const c = makePlugin('C', ['B']);
    // Supplied in reverse order
    expect(namespaces(sortPluginsByDependency([c, b, a]))).toEqual(['A', 'B', 'C']);
  });

  it('handles a diamond dependency: A → B, A → C, D → B, D → C', () => {
    // D needs B and C; B and C both need A
    const a = makePlugin('A');
    const b = makePlugin('B', ['A']);
    const c = makePlugin('C', ['A']);
    const d = makePlugin('D', ['B', 'C']);
    const result = namespaces(sortPluginsByDependency([d, c, b, a]));
    // A must come first, D must come last
    expect(result[0]).toBe('A');
    expect(result[result.length - 1]).toBe('D');
    // B and C must both appear before D
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('D'));
    expect(result.indexOf('C')).toBeLessThan(result.indexOf('D'));
  });

  // ── Stability ─────────────────────────────────────────────────────────────

  it('is stable: unrelated plugins keep their original relative order', () => {
    // audio and input have no relationship; their relative order must be preserved
    const audio = makePlugin('audio');
    const input = makePlugin('input');
    const entity = makePlugin('entity');
    const scene = makePlugin('scene', ['entity']);
    const result = namespaces(sortPluginsByDependency([audio, input, entity, scene]));
    expect(result.indexOf('audio')).toBeLessThan(result.indexOf('input'));
    expect(result.indexOf('entity')).toBeLessThan(result.indexOf('scene'));
  });

  it('inserts a reordered plugin as early as possible (after its dep), preserving original position for others', () => {
    // collision depends on entity; collision was given last — it should come
    // right after entity in the result, before scene.
    const entity = makePlugin('entity');
    const scene = makePlugin('scene');
    const collision = makePlugin('collision', ['entity']);
    // Original order: entity, scene, collision → expected: entity, collision, scene
    // because collision has no constraint relative to scene, but was originally
    // after entity. After sorting, collision (orig-idx 2) vs scene (orig-idx 1):
    // both are ready once entity is emitted, so the one with the lower original
    // index (scene) comes first.
    const result = namespaces(sortPluginsByDependency([entity, scene, collision]));
    expect(result.indexOf('entity')).toBeLessThan(result.indexOf('scene'));
    expect(result.indexOf('entity')).toBeLessThan(result.indexOf('collision'));
    // scene (orig 1) should come before collision (orig 2)
    expect(result.indexOf('scene')).toBeLessThan(result.indexOf('collision'));
  });

  // ── Multiple dependencies ─────────────────────────────────────────────────

  it('handles multiple dependencies on a single plugin', () => {
    const a = makePlugin('A');
    const b = makePlugin('B');
    const c = makePlugin('C', ['A', 'B']);
    const result = namespaces(sortPluginsByDependency([c, b, a]));
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('C'));
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('C'));
  });

  // ── Built-in plugin ordering equivalence ─────────────────────────────────

  it('produces the documented recommended order when deps are declared', () => {
    const resource = makePlugin('assets');
    const audio    = makePlugin('audio',     ['assets']);
    const i18n     = makePlugin('i18n',      ['assets']);
    const input    = makePlugin('input');
    const saves    = makePlugin('saves');
    const state    = makePlugin('game/state');
    const entity   = makePlugin('entity');
    const collision = makePlugin('collision', ['entity']);
    const scene    = makePlugin('scene',      ['entity', 'assets']);

    // Supply in shuffled order — dependency sort must fix it
    const shuffled = [scene, collision, state, entity, saves, input, i18n, audio, resource];
    const result   = namespaces(sortPluginsByDependency(shuffled));

    expect(result.indexOf('assets')).toBeLessThan(result.indexOf('audio'));
    expect(result.indexOf('assets')).toBeLessThan(result.indexOf('i18n'));
    expect(result.indexOf('assets')).toBeLessThan(result.indexOf('scene'));
    expect(result.indexOf('entity')).toBeLessThan(result.indexOf('collision'));
    expect(result.indexOf('entity')).toBeLessThan(result.indexOf('scene'));
  });

  // ── Error cases ───────────────────────────────────────────────────────────

  it('throws when a declared dependency is not in the plugin list', () => {
    const p = makePlugin('combat', ['entity']); // 'entity' not registered
    expect(() => sortPluginsByDependency([p])).toThrow(
      /Plugin "combat" declares a dependency on "entity"/,
    );
  });

  it('throws for a direct circular dependency (A → A)', () => {
    const a = makePlugin('A', ['A']);
    expect(() => sortPluginsByDependency([a])).toThrow(/Circular plugin dependency/);
  });

  it('throws for a two-node cycle (A → B → A)', () => {
    const a = makePlugin('A', ['B']);
    const b = makePlugin('B', ['A']);
    expect(() => sortPluginsByDependency([a, b])).toThrow(/Circular plugin dependency/);
  });

  it('throws for a three-node cycle (A → B → C → A)', () => {
    const a = makePlugin('A', ['C']);
    const b = makePlugin('B', ['A']);
    const c = makePlugin('C', ['B']);
    expect(() => sortPluginsByDependency([a, b, c])).toThrow(/Circular plugin dependency/);
  });

  it('throws for a duplicate namespace', () => {
    const a1 = makePlugin('audio');
    const a2 = makePlugin('audio');
    expect(() => sortPluginsByDependency([a1, a2])).toThrow(/Duplicate plugin namespace/);
  });

  // ── Plugins without dependencies field ───────────────────────────────────

  it('handles plugins where dependencies is undefined', () => {
    const a = makePlugin('A', undefined);
    const b = makePlugin('B', undefined);
    expect(namespaces(sortPluginsByDependency([a, b]))).toEqual(['A', 'B']);
  });

  it('handles plugins where dependencies is an empty array', () => {
    const a = makePlugin('A', []);
    const b = makePlugin('B', []);
    expect(namespaces(sortPluginsByDependency([a, b]))).toEqual(['A', 'B']);
  });
});
