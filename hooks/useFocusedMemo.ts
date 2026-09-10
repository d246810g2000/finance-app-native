import { useMemo, useRef, type DependencyList } from 'react';

/**
 * Memoize an expensive computation, but skip recomputing while the screen is
 * unfocused — reuse the last focused result instead.
 *
 * Matches the focus-gate pattern already used across tab screens.
 */
export function useFocusedMemo<T>(
  isFocused: boolean,
  factory: () => T,
  deps: DependencyList,
): T {
  const cacheRef = useRef<{ value: T } | null>(null);

  // Intentionally omit `factory` from deps; callers pass the values it closes over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!isFocused && cacheRef.current) {
      return cacheRef.current.value;
    }
    const next = factory();
    cacheRef.current = { value: next };
    return next;
  }, [isFocused, ...deps]);
}
