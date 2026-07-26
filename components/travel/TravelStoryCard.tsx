import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PieChart } from 'react-native-gifted-charts';
import { withContinuousRadius } from '../../theme';
import { TravelProject } from '../../services/shared';
import { TransformedRecord } from '../../types';

/** 邏輯畫布 9:16；截圖輸出 1080×1920 */
export const STORY_WIDTH = 360;
export const STORY_HEIGHT = 640;
export const STORY_CAPTURE_WIDTH = 1080;
export const STORY_CAPTURE_HEIGHT = 1920;

/** IG Wrapped 字級：46 / 24 / 16 / 13 / 11 */
const TYPE = {
    hero: 46,
    title: 24,
    body: 16,
    meta: 13,
    caption: 11,
} as const;

export type StoryStyleId = 'soft' | 'midnight' | 'sunset' | 'ocean';

export type StoryStyleOption = {
    id: StoryStyleId;
    name: string;
    desc: string;
    preview: [string, string, string];
};

export const STORY_STYLE_OPTIONS: StoryStyleOption[] = [
    {
        id: 'soft',
        name: '柔光回顧',
        desc: '溫柔杏粉紫',
        preview: ['#FFF8EF', '#F9F3FF', '#F4F7FF'],
    },
    {
        id: 'midnight',
        name: '午夜極簡',
        desc: '深色高級感',
        preview: ['#0F172A', '#1E293B', '#312E81'],
    },
    {
        id: 'sunset',
        name: '暖陽旅途',
        desc: '日落橘粉',
        preview: ['#FFF3D6', '#FFE7E7', '#FFF0E8'],
    },
    {
        id: 'ocean',
        name: '清澈海風',
        desc: '藍綠清爽',
        preview: ['#ECFEFF', '#EFF6FF', '#F0FDFA'],
    },
];

type StoryTheme = {
    gradient: [string, string, string];
    glowA: string;
    glowB: string;
    canvasBg: string;
    text: string;
    textMuted: string;
    accent: string;
    glass: string;
    divider: string;
    pieColors: readonly string[];
};

const THEMES: Record<StoryStyleId, StoryTheme> = {
    soft: {
        gradient: ['#FFF8EF', '#F9F3FF', '#F4F7FF'],
        glowA: 'rgba(91, 108, 255, 0.10)',
        glowB: 'rgba(255, 180, 120, 0.12)',
        canvasBg: '#F4F7FF',
        text: '#0F172A',
        textMuted: '#64748B',
        accent: '#2563EB',
        glass: 'rgba(255,255,255,0.75)',
        divider: 'rgba(15, 23, 42, 0.12)',
        // 杏粉 → 淡紫 → 霧藍 → 柔桃
        pieColors: ['#E8A87C', '#C4B5FD', '#93C5FD', '#F9A8D4'],
    },
    midnight: {
        gradient: ['#0F172A', '#1E293B', '#1E1B4B'],
        glowA: 'rgba(96, 165, 250, 0.18)',
        glowB: 'rgba(167, 139, 250, 0.14)',
        canvasBg: '#0F172A',
        text: '#F8FAFC',
        textMuted: '#94A3B8',
        accent: '#60A5FA',
        glass: 'rgba(30, 41, 59, 0.85)',
        divider: 'rgba(248, 250, 252, 0.14)',
        // 亮藍 → 紫晶 → 薄荷 → 玫瑰金（深底可辨）
        pieColors: ['#7DD3FC', '#A78BFA', '#5EEAD4', '#F9A8D4'],
    },
    sunset: {
        gradient: ['#FFF3D6', '#FFE7E7', '#FFF0E8'],
        glowA: 'rgba(251, 146, 60, 0.16)',
        glowB: 'rgba(244, 114, 182, 0.12)',
        canvasBg: '#FFF0E8',
        text: '#1C1917',
        textMuted: '#78716C',
        accent: '#EA580C',
        glass: 'rgba(255,255,255,0.78)',
        divider: 'rgba(28, 25, 23, 0.12)',
        // 日落橘 → 珊瑚 → 蜜桃 → 暖粉
        pieColors: ['#F97316', '#FB7185', '#FBBF24', '#E879A9'],
    },
    ocean: {
        gradient: ['#ECFEFF', '#EFF6FF', '#F0FDFA'],
        glowA: 'rgba(14, 165, 233, 0.14)',
        glowB: 'rgba(45, 212, 191, 0.12)',
        canvasBg: '#F0FDFA',
        text: '#0F172A',
        textMuted: '#64748B',
        accent: '#0891B2',
        glass: 'rgba(255,255,255,0.78)',
        divider: 'rgba(15, 23, 42, 0.12)',
        // 海藍 → 青綠 → 天空 → 深青
        pieColors: ['#0EA5E9', '#14B8A6', '#38BDF8', '#0F766E'],
    },
};

const formatAmount = (amount: number) => Math.round(amount).toLocaleString();

const parseParts = (dateStr: string): { y: string; m: string; d: string } | null => {
    if (!dateStr) return null;
    if (/^\d{8}$/.test(dateStr)) {
        return { y: dateStr.slice(0, 4), m: dateStr.slice(4, 6), d: dateStr.slice(6, 8) };
    }
    const norm = dateStr.replace(/-/g, '/');
    const parts = norm.split('/');
    if (parts.length !== 3) return null;
    return {
        y: parts[0],
        m: parts[1].padStart(2, '0'),
        d: parts[2].padStart(2, '0'),
    };
};

/** 2026.06.11 – 06.23 */
const formatStoryRange = (start: string, end: string) => {
    const a = parseParts(start);
    const b = parseParts(end);
    if (!a || !b) return `${start} – ${end}`;
    return `${a.y}.${a.m}.${a.d} – ${b.m}.${b.d}`;
};

const formatRecordDate = (dateStr: string) => {
    const p = parseParts(dateStr);
    if (!p) return dateStr.replace(/\//g, '.');
    return `${p.y}.${p.m}.${p.d}`;
};

const getRankLabel = (r: TransformedRecord): string => {
    if (r['描述']?.trim()) return r['描述'].trim();
    if (r['商家']?.trim()) return r['商家'].trim();
    if (r['子類別']?.trim()) return r['子類別'].trim();
    return r['主類別'] || '未命名';
};

export type StoryCategorySlice = {
    category: string;
    amount: number;
    color: string;
    pct: number;
    value: number;
};

interface TravelStoryCardProps {
    project: TravelProject;
    tripName: string;
    spendingDayCount: number;
    peakDay: { date: string; amount: number } | null;
    categoryPie: StoryCategorySlice[];
    styleId?: StoryStyleId;
}

/**
 * Instagram Stories 分享卡（全繁中）
 * 區塊：Hero 金額 → 統計 → 分類 → 最大筆 → 品牌
 */
const TravelStoryCard = forwardRef<View, TravelStoryCardProps>(function TravelStoryCard(
    { project, tripName, spendingDayCount, categoryPie, styleId = 'soft' },
    ref,
) {
    const theme = THEMES[styleId] ?? THEMES.soft;
    const styles = createStyles(theme);
    const maxExpense = project.maxSingleExpense;
    const pieSlices = categoryPie.slice(0, 4).map((c, i) => ({
        ...c,
        color: theme.pieColors[i % theme.pieColors.length],
    }));

    return (
        <View ref={ref} style={styles.canvas} collapsable={false}>
            <LinearGradient
                colors={[...theme.gradient]}
                locations={[0, 0.45, 1]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFillObject}
            />

            <View style={[styles.glowTop, { backgroundColor: theme.glowA }]} />
            <View style={[styles.glowBottom, { backgroundColor: theme.glowB }]} />

            <View style={styles.inner}>
                <View style={styles.main}>
                    {/* Hero */}
                    <View style={styles.hero}>
                        <View style={styles.eyebrow}>
                            <Ionicons name="airplane" size={12} color={theme.accent} />
                            <Text style={[styles.eyebrowText, { color: theme.accent }]}>旅行總結</Text>
                        </View>

                        <Text style={styles.tripName} numberOfLines={1}>{tripName}</Text>

                        <View style={styles.amountBlock}>
                            <Text style={styles.currency}>NT$</Text>
                            <Text style={styles.heroAmount}>{formatAmount(project.totalExpense)}</Text>
                        </View>

                        <Text style={styles.dateLine}>
                            {formatStoryRange(project.startDate, project.endDate)}
                            {'  ·  '}
                            {project.durationDays} 天
                        </Text>
                    </View>

                    {/* Stats */}
                    <View style={styles.statsRow}>
                        <View style={styles.statCell}>
                            <Text style={styles.statValue}>{project.records.length}</Text>
                            <Text style={styles.statLabel}>筆消費</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: theme.divider }]} />
                        <View style={styles.statCell}>
                            <Text style={styles.statValue}>{spendingDayCount}</Text>
                            <Text style={styles.statLabel}>有消費天</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: theme.divider }]} />
                        <View style={styles.statCell}>
                            <Text style={styles.statValueSm} numberOfLines={1}>
                                {formatAmount(project.dailyAvg)}
                            </Text>
                            <Text style={styles.statLabel}>日均</Text>
                        </View>
                    </View>

                    {/* Pie */}
                    {pieSlices.length > 0 ? (
                        <View style={styles.glassCard}>
                            <Text style={styles.sectionLabel}>分類支出</Text>
                            <View style={styles.categoryRow}>
                                <PieChart
                                    data={pieSlices.map((c) => ({ value: c.value, color: c.color }))}
                                    donut
                                    innerRadius={36}
                                    radius={58}
                                    centerLabelComponent={() => (
                                        <View style={styles.pieCenter}>
                                            <Text style={styles.pieCenterAmount}>
                                                {project.totalExpense >= 1000
                                                    ? `${Math.round(project.totalExpense / 1000)}k`
                                                    : String(project.totalExpense)}
                                            </Text>
                                            <Text style={styles.pieCenterSub}>總計</Text>
                                        </View>
                                    )}
                                />
                                <View style={styles.legend}>
                                    {pieSlices.map((c) => (
                                        <View key={c.category} style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                                            <Text style={styles.legendName} numberOfLines={1}>{c.category}</Text>
                                            <Text style={styles.legendPct}>{c.pct}%</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                    ) : null}

                    {/* Biggest */}
                    {maxExpense ? (
                        <View style={styles.glassCard}>
                            <Text style={styles.sectionLabel}>最大筆消費</Text>
                            <View style={styles.biggestRow}>
                                <View style={styles.biggestLeft}>
                                    <Text style={styles.biggestName} numberOfLines={1}>
                                        {getRankLabel(maxExpense)}
                                    </Text>
                                    <Text style={styles.biggestMeta} numberOfLines={1}>
                                        {formatRecordDate(maxExpense['日期'])}
                                        {maxExpense['主類別'] ? `  ·  ${maxExpense['主類別']}` : ''}
                                    </Text>
                                </View>
                                <Text style={styles.biggestAmount}>
                                    NT${formatAmount(Math.abs(maxExpense['金額']))}
                                </Text>
                            </View>
                        </View>
                    ) : null}
                </View>

                <View style={styles.footer}>
                    <Ionicons name="airplane" size={11} color={theme.textMuted} />
                    <Text style={styles.footerText}>財務管家</Text>
                </View>
            </View>
        </View>
    );
});

export default TravelStoryCard;

const createStyles = (theme: StoryTheme) =>
    StyleSheet.create({
        canvas: {
            width: STORY_WIDTH,
            height: STORY_HEIGHT,
            backgroundColor: theme.canvasBg,
            overflow: 'hidden',
        },
        glowTop: {
            position: 'absolute',
            top: -40,
            right: -30,
            width: 180,
            height: 180,
            borderRadius: 90,
        },
        glowBottom: {
            position: 'absolute',
            bottom: 40,
            left: -50,
            width: 160,
            height: 160,
            borderRadius: 80,
        },
        inner: {
            width: STORY_WIDTH,
            height: STORY_HEIGHT,
            paddingHorizontal: 22,
            paddingTop: 42,
            paddingBottom: 28,
            justifyContent: 'space-between',
        },
        main: {
            flexShrink: 1,
        },
        hero: {
            marginBottom: 16,
        },
        eyebrow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 8,
        },
        eyebrowText: {
            marginLeft: 6,
            fontSize: TYPE.caption,
            fontWeight: '700',
            letterSpacing: 0.8,
        },
        tripName: {
            fontSize: TYPE.title,
            fontWeight: '800',
            color: theme.text,
            letterSpacing: -0.4,
            marginBottom: 10,
            lineHeight: 30,
        },
        amountBlock: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            marginBottom: 8,
        },
        currency: {
            fontSize: 18,
            fontWeight: '700',
            color: theme.text,
            opacity: 0.45,
            marginTop: 10,
            marginRight: 4,
            letterSpacing: -0.3,
        },
        heroAmount: {
            fontSize: TYPE.hero,
            fontWeight: '900',
            color: theme.text,
            letterSpacing: -1.2,
            lineHeight: 52,
            includeFontPadding: false,
        },
        dateLine: {
            fontSize: TYPE.meta,
            fontWeight: '600',
            color: theme.textMuted,
            letterSpacing: 0.2,
            lineHeight: 18,
        },
        statsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.glass,
            paddingVertical: 14,
            paddingHorizontal: 8,
            marginBottom: 12,
            ...withContinuousRadius(18),
            shadowColor: '#1A1A2E',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.06,
            shadowRadius: 16,
            elevation: 3,
        },
        statCell: {
            flex: 1,
            alignItems: 'center',
        },
        statDivider: {
            width: StyleSheet.hairlineWidth,
            height: 28,
        },
        statValue: {
            fontSize: TYPE.body,
            fontWeight: '800',
            color: theme.text,
            letterSpacing: -0.3,
            lineHeight: 22,
        },
        statValueSm: {
            fontSize: 14,
            fontWeight: '800',
            color: theme.text,
            letterSpacing: -0.3,
            lineHeight: 22,
        },
        statLabel: {
            marginTop: 2,
            fontSize: TYPE.caption,
            fontWeight: '600',
            color: theme.textMuted,
        },
        glassCard: {
            backgroundColor: theme.glass,
            paddingVertical: 12,
            paddingHorizontal: 14,
            marginBottom: 10,
            ...withContinuousRadius(18),
            shadowColor: '#1A1A2E',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.07,
            shadowRadius: 16,
            elevation: 3,
        },
        sectionLabel: {
            fontSize: TYPE.caption,
            fontWeight: '700',
            color: theme.textMuted,
            letterSpacing: 0.6,
            marginBottom: 8,
        },
        categoryRow: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        pieCenter: { alignItems: 'center' },
        pieCenterAmount: {
            fontSize: TYPE.meta,
            fontWeight: '800',
            color: theme.text,
            letterSpacing: -0.3,
        },
        pieCenterSub: {
            fontSize: 10,
            fontWeight: '600',
            color: theme.textMuted,
        },
        legend: {
            flex: 1,
            marginLeft: 10,
            minWidth: 0,
        },
        legendItem: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 6,
        },
        legendDot: {
            width: 7,
            height: 7,
            borderRadius: 4,
            marginRight: 6,
        },
        legendName: {
            flex: 1,
            fontSize: 12,
            fontWeight: '600',
            color: theme.text,
            minWidth: 0,
            lineHeight: 16,
        },
        legendPct: {
            fontSize: 12,
            fontWeight: '700',
            color: theme.textMuted,
            width: 36,
            textAlign: 'right',
        },
        biggestRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 40,
        },
        biggestLeft: {
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            marginRight: 10,
        },
        biggestName: {
            fontSize: TYPE.body,
            fontWeight: '700',
            color: theme.text,
            lineHeight: 22,
            includeFontPadding: false,
        },
        biggestMeta: {
            fontSize: TYPE.caption,
            fontWeight: '500',
            color: theme.textMuted,
            lineHeight: 16,
            marginTop: 2,
            includeFontPadding: false,
        },
        biggestAmount: {
            fontSize: TYPE.body,
            fontWeight: '800',
            color: theme.text,
            letterSpacing: -0.3,
            flexShrink: 0,
            lineHeight: 22,
        },
        footer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 8,
        },
        footerText: {
            marginLeft: 6,
            fontSize: TYPE.caption,
            fontWeight: '700',
            color: theme.textMuted,
            letterSpacing: 0.6,
        },
    });
