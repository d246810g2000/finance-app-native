import { useEffect, useState } from 'react';

/**
 * Defer heavy UI (charts) until the JS thread is idle after `enabled` becomes true.
 * Once ready, stays ready for the component lifetime so re-focusing skips the placeholder.
 * Falls back to setTimeout(0) where requestIdleCallback is missing.
 */
export function useIdleReady(enabled: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || ready) return;

    const warm = () => setReady(true);
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(warm);
    } else {
      timeoutId = setTimeout(warm, 0);
    }

    return () => {
      if (idleId !== undefined && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [enabled, ready]);

  return ready;
}
