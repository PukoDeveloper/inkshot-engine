// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { EnginePlugin } from '../src/types/plugin.js';
import type { Core } from '../src/core/Core.js';
import { validatePhysicsBackends } from '../src/createEngine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal physics backend stub. */
function makePhysicsPlugin(suffix = ''): EnginePlugin {
  return {
    namespace: 'physics',
    init(_core: Core) {},
    ...(suffix ? { _label: suffix } : {}),
  } as EnginePlugin;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEngine — dual physics backend guard', () => {
  it('does not throw when exactly one physics backend is registered', () => {
    const plugins = [makePhysicsPlugin('A')];
    expect(() => validatePhysicsBackends(plugins)).not.toThrow();
  });

  it('does not throw when no physics backend is registered', () => {
    const plugins: EnginePlugin[] = [{ namespace: 'audio', init() {} }];
    expect(() => validatePhysicsBackends(plugins)).not.toThrow();
  });

  it('throws when two physics backends are registered', () => {
    const plugins = [makePhysicsPlugin('A'), makePhysicsPlugin('B')];
    expect(() => validatePhysicsBackends(plugins)).toThrowError(
      /More than one plugin with namespace "physics"/,
    );
  });

  it('error message includes the count of duplicate backends', () => {
    const plugins = [makePhysicsPlugin('A'), makePhysicsPlugin('B'), makePhysicsPlugin('C')];
    expect(() => validatePhysicsBackends(plugins)).toThrowError(/3 found/);
  });

  it('does not throw when other plugins share the same name (only physics namespace is guarded)', () => {
    const plugins: EnginePlugin[] = [
      { namespace: 'audio', init() {} },
      { namespace: 'audio', init() {} }, // duplicate non-physics namespaces are not guarded here
      makePhysicsPlugin('A'),
    ];
    expect(() => validatePhysicsBackends(plugins)).not.toThrow();
  });
});
