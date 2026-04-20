import type { EnginePlugin } from '../types/plugin.js';

/**
 * Sort an array of resolved plugins into a valid initialisation order using a
 * stable topological sort (Kahn's algorithm).
 *
 * Plugins that share no ordering constraints are emitted in their original
 * input order, so the sort is **stable** — only the constraints expressed via
 * `dependencies` change the sequence.
 *
 * @throws If a declared dependency namespace is not present in `plugins`.
 * @throws If a circular dependency is detected.
 * @throws If two plugins share the same `namespace`.
 */
export function sortPluginsByDependency(plugins: EnginePlugin[]): EnginePlugin[] {
  // Map namespace → plugin and record original insertion index for stability.
  const byNamespace = new Map<string, EnginePlugin>();
  const originalIndex = new Map<string, number>();

  for (let i = 0; i < plugins.length; i++) {
    const p = plugins[i];
    if (byNamespace.has(p.namespace)) {
      throw new Error(
        `[createEngine] Duplicate plugin namespace: "${p.namespace}".`,
      );
    }
    byNamespace.set(p.namespace, p);
    originalIndex.set(p.namespace, i);
  }

  // Build in-degree count and forward-edge map (dep → dependents).
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep ns → list of ns that need it

  for (const p of plugins) {
    inDegree.set(p.namespace, p.dependencies?.length ?? 0);
    dependents.set(p.namespace, []);
  }

  for (const p of plugins) {
    for (const dep of (p.dependencies ?? [])) {
      if (!byNamespace.has(dep)) {
        throw new Error(
          `[createEngine] Plugin "${p.namespace}" declares a dependency on ` +
          `"${dep}", but no plugin with that namespace was registered.`,
        );
      }
      dependents.get(dep)!.push(p.namespace);
    }
  }

  // Seed the ready queue with every zero-in-degree plugin, in original order.
  const ready: string[] = plugins
    .filter(p => (inDegree.get(p.namespace) ?? 0) === 0)
    .map(p => p.namespace);

  const result: EnginePlugin[] = [];

  while (ready.length > 0) {
    // Pick the earliest (by original index) ready plugin to keep sort stable.
    ready.sort((a, b) => originalIndex.get(a)! - originalIndex.get(b)!);
    const ns = ready.shift()!;
    result.push(byNamespace.get(ns)!);

    for (const dependent of dependents.get(ns)!) {
      const newDegree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        ready.push(dependent);
      }
    }
  }

  if (result.length !== plugins.length) {
    const unresolved = plugins
      .filter(p => !result.includes(p))
      .map(p => p.namespace)
      .join(', ');
    throw new Error(
      `[createEngine] Circular plugin dependency detected among: ${unresolved}`,
    );
  }

  return result;
}
