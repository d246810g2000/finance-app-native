import { StyleSheet, ColorSchemeName, useColorScheme } from 'react-native';

export type AppColors = {
    bg: string;
    card: string;
    cardBorder: string;
    headerBg: string;
    accent: string;
    accentLight: string;
    accentBorder: string;
    accentGradientShape: string[];
    green: string;
    greenLight: string;
    greenGradient: string[];
    red: string;
    redLight: string;
    redGradient: string[];
    yellow: string;
    yellowLight: string;
    blue: string;
    blueLight: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textWhite: string;
    divider: string;
    border: string;
    tabBg: string;
    tabActive: string;
    tabInactive: string;
    glassBg: string;
    blackOverlay: string;
};

export const LIGHT_COLORS: AppColors = {
    bg: '#F5F5F5',
    card: '#FFFFFF',
    cardBorder: '#E0E0E0',
    headerBg: '#FFFFFF',
    accent: '#5B5BD6',
    accentLight: '#EDEDFC',
    accentBorder: '#C4C4F0',
    accentGradientShape: ['#7C7CE0', '#5B5BD6'],
    green: '#10B981',
    greenLight: '#D1FAE5',
    greenGradient: ['#34D399', '#10B981'],
    red: '#F43F5E',
    redLight: '#FFE4E6',
    redGradient: ['#FB7185', '#E11D48'],
    yellow: '#F59E0B',
    yellowLight: '#FEF3C7',
    blue: '#3B82F6',
    blueLight: '#DBEAFE',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    textWhite: '#FFFFFF',
    divider: '#E2E8F0',
    border: '#CBD5E1',
    tabBg: '#FFFFFF',
    tabActive: '#5B5BD6',
    tabInactive: '#757575',
    glassBg: 'rgba(255, 255, 255, 0.92)',
    blackOverlay: 'rgba(0, 0, 0, 0.5)',
};

export const DARK_COLORS: AppColors = {
    bg: '#121212',
    card: '#1E1E1E',
    cardBorder: '#2C2C2C',
    headerBg: '#1E1E1E',
    accent: '#9B9BF5',
    accentLight: 'rgba(91, 91, 214, 0.2)',
    accentBorder: '#5B5BD6',
    accentGradientShape: ['#9B9BF5', '#5B5BD6'],
    green: '#34D399',
    greenLight: 'rgba(16, 185, 129, 0.15)',
    greenGradient: ['#6EE7B7', '#34D399'],
    red: '#FB7185',
    redLight: 'rgba(244, 63, 94, 0.15)',
    redGradient: ['#FDA4AF', '#FB7185'],
    yellow: '#FBBF24',
    yellowLight: 'rgba(245, 158, 11, 0.15)',
    blue: '#60A5FA',
    blueLight: 'rgba(59, 130, 246, 0.15)',
    textPrimary: '#FFFFFF',
    textSecondary: '#B0B0B0',
    textMuted: '#808080',
    textWhite: '#FFFFFF',
    divider: '#2C2C2C',
    border: '#3A3A3A',
    tabBg: '#1E1E1E',
    tabActive: '#9B9BF5',
    tabInactive: '#808080',
    glassBg: 'rgba(30, 30, 30, 0.92)',
    blackOverlay: 'rgba(0, 0, 0, 0.7)',
};

/**
 * 為了避免破壞既有引入 `import { COLORS } ...` 的程式碼，先將 COLORS 導出為 Light，
 * 建議後續透過 ThemeContext 來動態獲取 colors。
 */
export const COLORS = LIGHT_COLORS;

/** 曲面螢幕左右最小留白（safe area 回報 0 時的後備值） */
export const SCREEN_EDGE_MIN = 16;

/** 圓角常數 — 搭配 borderCurve: 'continuous' 使用（Vercel RN styling 建議） */
export const RADIUS = {
    xs: 3,
    input: 8,
    sm: 10,
    md: 16,
    lg: 20,
    chip: 20,
    xl: 24,
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

export const SHADOWS = StyleSheet.create({
    sm: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    },
    md: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 4,
        boxShadow: '0 6px 14px rgba(15, 23, 42, 0.08)',
    },
    lg: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 8,
        boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)',
    },
    hover: {
        shadowColor: '#5B5BD6',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
        elevation: 4,
        boxShadow: '0 6px 14px rgba(91, 91, 214, 0.18)',
    }
});

/** 
 * Typography 的顏色也會隨著主題改變，因此我們匯出一個產生函數
 */
export const getTypography = (colors: AppColors) => StyleSheet.create({
    h1: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8 },
    h2: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.6 },
    h3: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, letterSpacing: -0.3 },
    display: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1 },
    subtitle: { fontSize: 16, fontWeight: '500', color: colors.textSecondary, letterSpacing: -0.2 },
    body: { fontSize: 15, fontWeight: '400', color: colors.textSecondary, lineHeight: 22 },
    bodySm: { fontSize: 13, fontWeight: '400', color: colors.textMuted, letterSpacing: -0.1 },
    caption: { fontSize: 11, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
    // 收斂常見的卡片 / 金額 / 排序 chip / 區塊標題字級
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
    amount: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
    amountLg: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
    chip: { fontSize: 13, fontWeight: '700' },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
});

// 提供原本靜態的版本以避免立刻報錯，但顏色只會是 Light Theme 的。
export const TYPOGRAPHY = getTypography(LIGHT_COLORS);
