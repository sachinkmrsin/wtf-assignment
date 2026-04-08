import { useState, useEffect, useRef } from 'react';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Smoothly animates a number from its previous value to `target` over `duration` ms.
 * Uses requestAnimationFrame with a cubic ease-out for a premium feel.
 */
export function useCountUp(target: number, duration = 400): number {
  const [value, setValue] = useState(target);
  const prevTargetRef  = useRef(target);
  const startValueRef  = useRef(target);
  const startTimeRef   = useRef<number | null>(null);
  const rafRef         = useRef<number | null>(null);

  useEffect(() => {
    if (prevTargetRef.current === target) return;

    startValueRef.current = value;
    startTimeRef.current  = null;
    prevTargetRef.current = target;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed  = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = easeOutCubic(progress);
      const current  = Math.round(startValueRef.current + (target - startValueRef.current) * eased);
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

