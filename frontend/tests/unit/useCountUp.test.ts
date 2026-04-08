import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountUp } from '../../src/hooks/useCountUp';

// Mock requestAnimationFrame to run callbacks synchronously in tests
let rafCallbacks: ((ts: number) => void)[] = [];
let rafTime = 0;

function flushRaf(steps = 10, stepMs = 50) {
  for (let i = 0; i < steps; i++) {
    rafTime += stepMs;
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach((cb) => cb(rafTime));
  }
}

beforeEach(() => {
  rafCallbacks = [];
  rafTime = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCountUp', () => {
  it('initialises with the target value', () => {
    const { result } = renderHook(() => useCountUp(42));
    expect(result.current).toBe(42);
  });

  it('animates toward the new target when it changes', async () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 400), {
      initialProps: { target: 0 },
    });
    expect(result.current).toBe(0);

    // Change target to 100
    rerender({ target: 100 });

    // Flush some frames — value should have moved toward 100
    act(() => flushRaf(3, 100));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThanOrEqual(100);
  });

  it('reaches exactly the target after enough frames', () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 400), {
      initialProps: { target: 0 },
    });

    rerender({ target: 200 });

    // 10 × 60ms = 600ms > 400ms duration → should have converged
    act(() => flushRaf(10, 60));
    expect(result.current).toBe(200);
  });

  it('handles decreasing values', () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 400), {
      initialProps: { target: 100 },
    });

    rerender({ target: 20 });
    act(() => flushRaf(10, 60));
    expect(result.current).toBe(20);
  });
});

