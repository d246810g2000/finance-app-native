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
    bg: '#F8FAFC',
    card: '#FFFFFF',
    cardBorder: '#E2E8F0',
    headerBg: 'rgba(255, 255, 255, 0.85)',
    accent: '#6366F1',
    accentLight: '#EEF2FF',
    accentBorder: '#C7D2FE',
    accentGradientShape: ['#6366F1', '#4F46E5'],
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
    tabActive: '#6366F1',
    tabInactive: '#94A3B8',
    glassBg: 'rgba(255, 255, 255, 0.7)',
    blackOverlay: 'rgba(15, 23, 42, 0.4)',
};

export const DARK_COLORS: AppColors = {
    // True black background for OLED
    bg: '#000000',
    // Dark gray cards (Moze 4.0 style)
    card: '#1C1C1E',
    cardBorder: '#2C2C2E',
    headerBg: 'rgba(0, 0, 0, 0.85)',
    accent: '#818CF8', // indigo-400
    accentLight: 'rgba(99, 102, 241, 0.15)',
    accentBorder: '#4F46E5',
    accentGradientShape: ['#818CF8', '#6366F1'],
    green: '#34D399', // emerald-400
    greenLight: 'rgba(16, 185, 129, 0.15)',
    greenGradient: ['#6EE7B7', '#34D399'],
    red: '#FB7185', // rose-400
    redLight: 'rgba(244, 63, 94, 0.15)',
    redGradient: ['#FDA4AF', '#FB7185'],
    yellow: '#FBBF24', // amber-400
    yellowLight: 'rgba(245, 158, 11, 0.15)',
    blue: '#60A5FA', // blue-400
    blueLight: 'rgba(59, 130, 246, 0.15)',
    textPrimary: '#FFFFFF', // pure white text
    textSecondary: '#A1A1AA', // zinc-400
    textMuted: '#71717A', // zinc-500
    textWhite: '#FFFFFF',
    divider: '#2C2C2E', // Matches card borders
    border: '#3F3F46',
    tabBg: '#0F0F0F', // very dark tab bar
    tabActive: '#818CF8',
    tabInactive: '#71717A',
    glassBg: 'rgba(28, 28, 30, 0.7)',
    blackOverlay: 'rgba(0, 0, 0, 0.8)',
};

/**
 * 為了避免破壞既有引入 `import { COLORS } ...` 的程式碼，先將 COLORS 導出為 Light，
 * 建議後續透過 ThemeContext 來動態獲取 colors。
 */
export const COLORS = LIGHT_COLORS;

export const CATEGORY_COLORS = [
    '#4F46E5', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
    '#3B82F6', '#14B8A6',
] as const;

export const SHADOWS = StyleSheet.create({
    sm: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    md: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    lg: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
        elevation: 6,
    },
    hover: {
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
    }
});

/** 
 * Typography 的顏色也會隨著主題改變，因此我們匯出一個產生函數
 */
export const getTypography = (colors: AppColors) => StyleSheet.create({
    h1: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    h2: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
    h3: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
    subtitle: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
    body: { fontSize: 15, fontWeight: '400', color: colors.textSecondary, lineHeight: 22 },
    bodySm: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
    caption: { fontSize: 11, fontWeight: '500', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
});

// 提供原本靜態的版本以避免立刻報錯，但顏色只會是 Light Theme 的。
export const TYPOGRAPHY = getTypography(LIGHT_COLORS);
