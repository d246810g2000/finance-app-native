/**
 * Design tokens — Material 3–aligned, finance blue seed (#2563EB).
 *
 * - Primary seed stays blue for trust; green/red are fixed gain/loss semantics (never dynamic).
 * - On Android 12+, surface/primary/onSurface roles prefer system dynamic colors via PlatformColor.
 * - iOS / web / Reanimated styles use the static light/dark hex tables below.
 */
import { StyleSheet, Platform } from 'react-native';

/** Hex / rgba strings in palette tables (Reanimated & GiftedCharts safe). */
export type AppColorValue = string;

export type AppColors = {
    // Legacy aliases (mapped to M3 roles; keep for existing call sites)
    bg: AppColorValue;
    card: AppColorValue;
    cardBorder: AppColorValue;
    headerBg: AppColorValue;
    accent: AppColorValue;
    accentLight: AppColorValue;
    accentBorder: AppColorValue;
    accentGradientShape: string[];
    green: string;
    greenLight: AppColorValue;
    greenGradient: string[];
    red: string;
    redLight: AppColorValue;
    redGradient: string[];
    yellow: string;
    yellowLight: AppColorValue;
    blue: AppColorValue;
    blueLight: AppColorValue;
    textPrimary: AppColorValue;
    textSecondary: AppColorValue;
    textMuted: AppColorValue;
    textWhite: string;
    divider: AppColorValue;
    border: AppColorValue;
    tabBg: AppColorValue;
    tabActive: AppColorValue;
    tabInactive: AppColorValue;
    glassBg: string;
    blackOverlay: string;

    // M3 semantic roles
    surface: AppColorValue;
    surfaceContainer: AppColorValue;
    surfaceContainerHigh: AppColorValue;
    surfaceVariant: AppColorValue;
    onSurface: AppColorValue;
    onSurfaceVariant: AppColorValue;
    primary: AppColorValue;
    primaryContainer: AppColorValue;
    onPrimary: string;
    onPrimaryContainer: AppColorValue;
    outline: AppColorValue;
    outlineVariant: AppColorValue;
    errorContainer: AppColorValue;
    scrim: string;
    statePressed: string;
    stateHover: string;
};

/** Primary seed — finance trust blue (static; charts / Reanimated must use hex). */
export const PRIMARY_SEED = '#2563EB';

const LIGHT_STATIC = {
    surface: '#F7F8FC',
    surfaceContainer: '#FFFFFF',
    surfaceContainerHigh: '#F1F5FB',
    surfaceVariant: '#E8EDF5',
    onSurface: '#0F172A',
    onSurfaceVariant: '#475569',
    primary: PRIMARY_SEED,
    primaryContainer: '#DBEAFE',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#1E3A8A',
    outline: '#D6DEEA',
    outlineVariant: '#E3E8F2',
    errorContainer: '#FEF2F2',
    scrim: 'rgba(0, 0, 0, 0.32)',
    statePressed: 'rgba(15, 23, 42, 0.10)',
    stateHover: 'rgba(15, 23, 42, 0.06)',
    green: '#059669',
    greenLight: '#ECFDF5',
    greenGradient: ['#10B981', '#047857'] as string[],
    red: '#DC2626',
    redLight: '#FEF2F2',
    redGradient: ['#EF4444', '#B91C1C'] as string[],
    yellow: '#A16207',
    yellowLight: '#FEFCE8',
    accentGradientShape: ['#3B82F6', '#1D4ED8'] as string[],
    textWhite: '#FFFFFF',
    glassBg: 'rgba(255, 255, 255, 0.92)',
    blackOverlay: 'rgba(0, 0, 0, 0.5)',
    textMuted: '#7C8AA0',
    tabInactive: '#757575',
} as const;

const DARK_STATIC = {
    surface: '#0F172A',
    surfaceContainer: '#192134',
    surfaceContainerHigh: '#212C40',
    surfaceVariant: '#2A3650',
    onSurface: '#FFFFFF',
    onSurfaceVariant: '#B9C5D8',
    primary: '#60A5FA',
    primaryContainer: 'rgba(37, 99, 235, 0.28)',
    onPrimary: '#0F172A',
    onPrimaryContainer: '#BFDBFE',
    outline: '#3A4965',
    outlineVariant: '#2A3650',
    errorContainer: 'rgba(220, 38, 38, 0.18)',
    scrim: 'rgba(0, 0, 0, 0.52)',
    statePressed: 'rgba(255, 255, 255, 0.12)',
    stateHover: 'rgba(255, 255, 255, 0.06)',
    green: '#34D399',
    greenLight: 'rgba(5, 150, 105, 0.18)',
    greenGradient: ['#6EE7B7', '#059669'] as string[],
    red: '#F87171',
    redLight: 'rgba(220, 38, 38, 0.18)',
    redGradient: ['#FCA5A5', '#DC2626'] as string[],
    yellow: '#FBBF24',
    yellowLight: 'rgba(161, 98, 7, 0.22)',
    accentGradientShape: ['#60A5FA', '#2563EB'] as string[],
    textWhite: '#FFFFFF',
    glassBg: 'rgba(19, 28, 46, 0.92)',
    blackOverlay: 'rgba(0, 0, 0, 0.7)',
    textMuted: '#8290A8',
    tabInactive: '#8B9AB2',
} as const;

function buildPalette(s: typeof LIGHT_STATIC | typeof DARK_STATIC, isDark: boolean): AppColors {
    return {
        // M3
        surface: s.surface,
        surfaceContainer: s.surfaceContainer,
        surfaceContainerHigh: s.surfaceContainerHigh,
        surfaceVariant: s.surfaceVariant,
        onSurface: s.onSurface,
        onSurfaceVariant: s.onSurfaceVariant,
        primary: s.primary,
        primaryContainer: s.primaryContainer,
        onPrimary: s.onPrimary,
        onPrimaryContainer: s.onPrimaryContainer,
        outline: s.outline,
        outlineVariant: s.outlineVariant,
        errorContainer: s.errorContainer,
        scrim: s.scrim,
        statePressed: s.statePressed,
        stateHover: s.stateHover,

        // Legacy aliases → M3
        bg: s.surface,
        card: s.surfaceContainer,
        cardBorder: s.outlineVariant,
        headerBg: isDark ? '#131C2E' : s.surfaceContainer,
        accent: s.primary,
        accentLight: s.primaryContainer,
        accentBorder: isDark ? PRIMARY_SEED : '#BFDBFE',
        accentGradientShape: s.accentGradientShape,
        green: s.green,
        greenLight: s.greenLight,
        greenGradient: s.greenGradient,
        red: s.red,
        redLight: s.redLight,
        redGradient: s.redGradient,
        yellow: s.yellow,
        yellowLight: s.yellowLight,
        blue: s.primary,
        blueLight: s.primaryContainer,
        textPrimary: s.onSurface,
        textSecondary: s.onSurfaceVariant,
        textMuted: s.textMuted,
        textWhite: s.textWhite,
        divider: s.outlineVariant,
        border: s.outline,
        tabBg: isDark ? '#131C2E' : s.surfaceContainer,
        tabActive: s.primary,
        tabInactive: s.tabInactive,
        glassBg: s.glassBg,
        blackOverlay: s.blackOverlay,
    };
}

export const LIGHT_COLORS: AppColors = buildPalette(LIGHT_STATIC, false);
export const DARK_COLORS: AppColors = buildPalette(DARK_STATIC, true);

/** Resolve palette for ThemeContext (pure hex/rgba strings for Reanimated & GiftedCharts safety). */
export function resolveAppColors(isDark: boolean): AppColors {
    return isDark ? DARK_COLORS : LIGHT_COLORS;
}

/**
 * 為了避免破壞既有引入 `import { COLORS } ...` 的程式碼，先將 COLORS 導出為 Light，
 * 建議後續透過 ThemeContext 來動態獲取 colors。
 */
export const COLORS = LIGHT_COLORS;

/** 曲面螢幕左右最小留白（safe area 回報 0 時的後備值） */
export const SCREEN_EDGE_MIN = 16;

/** 圓角常數 — M3 區間 + continuous curve */
export const RADIUS = {
    xs: 4,
    input: 8,
    sm: 12,
    md: 16,
    lg: 20,
    chip: 20,
    xl: 24,
    sheet: 28,
    full: 999,
} as const;

export const withContinuousRadius = (radius: number) => ({
    borderRadius: radius,
    borderCurve: 'continuous' as const,
});

export const CATEGORY_COLORS = [
    '#4F46E5', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
    '#3B82F6', '#14B8A6',
] as const;

/** Asset-class chart colors — light / dark tonal variants (fixed, not wallpaper-dynamic). */
export const ASSET_CLASS_COLORS_LIGHT: Record<string, string> = {
    '流動資金': '#059669',
    '投資': '#4F46E5',
    '固定資產': '#2563EB',
    '負債': '#64748B',
    '應收款': '#0EA5E9',
};

export const ASSET_CLASS_COLORS_DARK: Record<string, string> = {
    '流動資金': '#34D399',
    '投資': '#818CF8',
    '固定資產': '#60A5FA',
    '負債': '#94A3B8',
    '應收款': '#38BDF8',
};

export function getAssetClassColors(isDark: boolean): Record<string, string> {
    return isDark ? ASSET_CLASS_COLORS_DARK : ASSET_CLASS_COLORS_LIGHT;
}

/** Prefer tonal elevation; keep light boxShadow for web / elevated sheets only. */
export const SHADOWS = StyleSheet.create({
    sm: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    },
    md: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    },
    lg: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
    },
    hover: {
        shadowColor: PRIMARY_SEED,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 2,
        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.12)',
    },
});

/**
 * Typography — M3-ish roles; amounts use tabular nums for alignment.
 */
export const getTypography = (colors: AppColors) => StyleSheet.create({
    h1: { fontSize: 28, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.8 },
    h2: { fontSize: 24, fontWeight: '700', color: colors.onSurface, letterSpacing: -0.6 },
    h3: { fontSize: 20, fontWeight: '600', color: colors.onSurface, letterSpacing: -0.3 },
    display: { fontSize: 32, fontWeight: '800', color: colors.onSurface, letterSpacing: -1 },
    titleLarge: { fontSize: 22, fontWeight: '700', color: colors.onSurface, letterSpacing: -0.3 },
    titleMedium: { fontSize: 16, fontWeight: '600', color: colors.onSurface, letterSpacing: -0.2 },
    labelLarge: { fontSize: 14, fontWeight: '600', color: colors.onSurface, letterSpacing: 0.1 },
    labelMedium: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant, letterSpacing: 0.4 },
    subtitle: { fontSize: 16, fontWeight: '500', color: colors.onSurfaceVariant, letterSpacing: -0.2 },
    body: { fontSize: 15, fontWeight: '400', color: colors.onSurfaceVariant, lineHeight: 22 },
    bodySm: { fontSize: 13, fontWeight: '400', color: colors.textMuted, letterSpacing: -0.1 },
    caption: { fontSize: 11, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, letterSpacing: -0.3 },
    amount: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
    amountLg: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    chip: { fontSize: 13, fontWeight: '700' },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.3 },
});

export const TYPOGRAPHY = getTypography(LIGHT_COLORS);
