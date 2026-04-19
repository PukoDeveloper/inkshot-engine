/**
 * Generic object pool to reduce garbage-collection pressure for
 * frequently created / destroyed objects (particles, projectiles, etc.).
 *
 * @example
 * ```ts
 * const pool = new ObjectPool(() => new Sprite(), 64);
 * const sprite = pool.acquire();
 * // ... use sprite ...
 * pool.release(sprite);
 * ```
 */
export class ObjectPool<T> {
  private readonly _factory: () => T;
  private readonly _reset?: (obj: T) => void;
  private readonly _pool: T[] = [];
  private readonly _maxSize: number;

  /**
   * @param factory   Function that creates a new instance of `T`.
   * @param maxSize   Maximum number of idle objects kept in the pool.
   *                  Excess objects returned via `release()` are discarded.
   *                  Defaults to `256`.
   * @param reset     Optional function called on an object when it is
   *                  released back into the pool (clean up references, etc.).
   */
  constructor(factory: () => T, maxSize = 256, reset?: (obj: T) => void) {
    this._factory = factory;
    this._maxSize = maxSize;
    this._reset = reset;
  }

  /** Number of idle objects currently in the pool. */
  get size(): number {
    return this._pool.length;
  }

  /** Pre-populate the pool with `count` instances. */
  prewarm(count: number): void {
    const toCreate = Math.min(count, this._maxSize) - this._pool.length;
    for (let i = 0; i < toCreate; i++) {
      this._pool.push(this._factory());
    }
  }

  /** Get an object from the pool, or create a new one if empty. */
  acquire(): T {
    return this._pool.length > 0 ? this._pool.pop()! : this._factory();
  }

  /** Return an object to the pool for reuse. */
  release(obj: T): void {
    this._reset?.(obj);
    if (this._pool.length < this._maxSize) {
      this._pool.push(obj);
    }
  }

  /** Discard all pooled objects. */
  clear(): void {
    this._pool.length = 0;
  }
}
