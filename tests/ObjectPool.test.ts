import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectPool } from '../src/rendering/ObjectPool.js';

describe('ObjectPool', () => {
  let id: number;
  const factory = () => ({ id: id++ });

  beforeEach(() => {
    id = 0;
  });

  it('creates a new object when pool is empty', () => {
    const pool = new ObjectPool(factory);
    const obj = pool.acquire();
    expect(obj.id).toBe(0);
    expect(pool.size).toBe(0);
  });

  it('reuses released objects', () => {
    const pool = new ObjectPool(factory);
    const obj = pool.acquire();
    pool.release(obj);
    expect(pool.size).toBe(1);

    const reused = pool.acquire();
    expect(reused).toBe(obj);
    expect(pool.size).toBe(0);
  });

  it('calls the reset function on release', () => {
    const reset = vi.fn();
    const pool = new ObjectPool(factory, 256, reset);
    const obj = pool.acquire();
    pool.release(obj);
    expect(reset).toHaveBeenCalledWith(obj);
  });

  it('does not exceed maxSize', () => {
    const pool = new ObjectPool(factory, 2);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    pool.release(a);
    pool.release(b);
    pool.release(c); // should be discarded
    expect(pool.size).toBe(2);
  });

  it('prewarms the pool', () => {
    const pool = new ObjectPool(factory, 10);
    pool.prewarm(5);
    expect(pool.size).toBe(5);
  });

  it('prewarm does not exceed maxSize', () => {
    const pool = new ObjectPool(factory, 3);
    pool.prewarm(10);
    expect(pool.size).toBe(3);
  });

  it('clear empties the pool', () => {
    const pool = new ObjectPool(factory);
    pool.prewarm(5);
    pool.clear();
    expect(pool.size).toBe(0);
  });
});
