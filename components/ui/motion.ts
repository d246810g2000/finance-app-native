import { withTiming, withSpring } from 'react-native-reanimated';

/** Unified motion durations (ms) — keep every screen on the same rhythm. */
export const MOTION_DURATION = {
    fast: 180,
    normal: 250,
    slow: 320,
} as const;

/** Shared spring configs so screens feel like one app, not five. */
export const SPRING_CONFIG = {
    snappy: { damping: 22, stiffness: 280 },
    smooth: { damping: 26, stiffness: 220 },
} as const;

export const timingFast = (toValue: number) =>
    withTiming(toValue, { duration: MOTION_DURATION.fast });

export const timingNormal = (toValue: number) =>
    withTiming(toValue, { duration: MOTION_DURATION.normal });

export const springSnappy = (toValue: number) =>
    withSpring(toValue, SPRING_CONFIG.snappy);
