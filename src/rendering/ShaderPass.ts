import type { Filter } from 'pixi.js';

/**
 * A single post-processing pass wrapping a Pixi `Filter`.
 *
 * Passes are managed by {@link PostFxPipeline} and executed in `order`
 * ascending during the `renderer/post-process` phase.
 *
 * Consumers may subclass `ShaderPass` or construct one directly:
 * ```ts
 * const bloom = new ShaderPass({
 *   name: 'bloom',
 *   order: 10,
 *   filter: new BloomFilter(),
 * });
 * ```
 */
export class ShaderPass {
  readonly name: string;
  readonly order: number;
  filter: Filter;
  enabled: boolean;

  constructor(opts: { name: string; order: number; filter: Filter; enabled?: boolean }) {
    this.name = opts.name;
    this.order = opts.order;
    this.filter = opts.filter;
    this.enabled = opts.enabled ?? true;
  }

  /**
   * Called once per render frame so the pass can update uniforms.
   * Override in subclasses for animated effects.
   */
  update(_alpha: number): void {
    // no-op by default
  }
}
