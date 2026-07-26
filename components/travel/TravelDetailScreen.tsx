import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-gifted-charts';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors, CATEGORY_COLORS, RADIUS, SHADOWS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { TransformedRecord } from '../../types';
import { TravelProject } from '../../services/shared';
import EmptyState from '../ui/EmptyState';
import DateCapsuleFilter, { formatCapsuleDateLabel } from './DateCapsuleFilter';
import TravelHighlightCard from './TravelHighlightCard';
import TravelStoryCard, {
    STORY_CAPTURE_WIDTH,
    STORY_CAPTURE_HEIGHT,
    STORY_STYLE_OPTIONS,
    StoryStyleId,
} from './TravelStoryCard';

type DetailView =
    | { mode: 'overview' }
    | { mode: 'day'; date: string }
    | { mode: 'allList' };

interface TravelDetailScreenProps {
    project: TravelProject;
}

const formatNT = (amount: number) => `NT$${Math.round(amount).toLocaleString()}`;

const formatDisplayRange = (start: string, end: string) => {
    const toDash = (s: string) => s.replace(/\//g, '-');
    return `${toDash(start)} ~ ${toDash(end)}`;
};

const getRecordTitle = (r: TransformedRecord): string => {
    if (r['名稱']) return r['名稱'];
    const parts = [r['主類別']];
    if (r['子類別']) parts.push(r['子類別']);
    if (r['商家']) parts.push(`(${r['商家']})`);
    return parts.filter(Boolean).join(' · ') || '未命名';
};

/** 排名用短標籤，避免「主類別 · 子類別 · (主類別-子類別)」重複 */
const getRankLabel = (r: TransformedRecord): string => {
    if (r['描述']?.trim()) return r['描述'].trim();
    if (r['商家']?.trim()) return r['商家'].trim();
    if (r['子類別']?.trim()) return r['子類別'].trim();
    return r['主類別'] || '未命名';
};

function buildCategoryBreakdown(records: TransformedRecord[]) {
    const catMap: Record<string, number> = {};
    records.forEach((r) => {
        const cat = r['主類別'] || '其他';
        catMap[cat] = (catMap[cat] || 0) + Math.abs(r['金額']);
    });
    return Object.entries(catMap)
        .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
        .sort((a, b) => b.amount - a.amount);
}

export default function TravelDetailScreen({ project }: TravelDetailScreenProps) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const styleCardWidth = useMemo(() => {
        const sheetPad = 20;
        const gap = 12;
        return Math.floor((Dimensions.get('window').width - sheetPad * 2 - gap) / 2);
    }, []);
    const [view, setView] = useState<DetailView>({ mode: 'overview' });

    const tripName = project.name.replace(/^\d{6}-/, '');

    const spendingDates = useMemo(() => {
        const set = new Set(project.records.map((r) => r['日期']).filter(Boolean));
        return Array.from(set).sort();
    }, [project.records]);

    const dayTotals = useMemo(() => {
        const map = new Map<string, number>();
        project.records.forEach((r) => {
            const d = r['日期'];
            if (!d) return;
            map.set(d, (map.get(d) || 0) + Math.abs(r['金額']));
        });
        return map;
    }, [project.records]);

    const peakDay = useMemo(() => {
        let bestDate = '';
        let bestAmount = 0;
        dayTotals.forEach((amount, date) => {
            if (amount > bestAmount) {
                bestAmount = amount;
                bestDate = date;
            }
        });
        return bestDate ? { date: bestDate, amount: Math.round(bestAmount) } : null;
    }, [dayTotals]);

    const selectedCapsuleDate = view.mode === 'day' ? view.date : null;

    const dayRecords = useMemo(() => {
        if (view.mode !== 'day') return [];
        return [...project.records]
            .filter((r) => r['日期'] === view.date)
            .sort((a, b) => Math.abs(b['金額']) - Math.abs(a['金額']));
    }, [project.records, view]);

    const dayTotal = useMemo(
        () => dayRecords.reduce((s, r) => s + Math.abs(r['金額']), 0),
        [dayRecords],
    );

    const dayCategories = useMemo(() => buildCategoryBreakdown(dayRecords), [dayRecords]);

    const allListGroups = useMemo(() => {
        const groups: { date: string; total: number; records: TransformedRecord[] }[] = [];
        const byDate = new Map<string, TransformedRecord[]>();
        project.records.forEach((r) => {
            const d = r['日期'] || '';
            if (!byDate.has(d)) byDate.set(d, []);
            byDate.get(d)!.push(r);
        });
        Array.from(byDate.keys())
            .sort()
            .forEach((date) => {
                const records = [...(byDate.get(date) || [])].sort(
                    (a, b) => Math.abs(b['金額']) - Math.abs(a['金額']),
                );
                const total = records.reduce((s, r) => s + Math.abs(r['金額']), 0);
                groups.push({ date, total: Math.round(total), records });
            });
        return groups;
    }, [project.records]);

    const categoryPie = useMemo(() => {
        const total = project.categoryBreakdown.reduce((s, c) => s + c.amount, 0);
        return project.categoryBreakdown.map((c, i) => ({
            ...c,
            color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] as string,
            pct: total > 0 ? Math.round((c.amount / total) * 100) : 0,
            value: c.amount,
        }));
    }, [project.categoryBreakdown]);

    const topExpenses = useMemo(
        () =>
            [...project.records]
                .sort((a, b) => Math.abs(b['金額']) - Math.abs(a['金額']))
                .slice(0, 5),
        [project.records],
    );

    const goOverview = useCallback(() => setView({ mode: 'overview' }), []);
    const goDay = useCallback((date: string) => setView({ mode: 'day', date }), []);
    const goAllList = useCallback(() => setView({ mode: 'allList' }), []);

    const maxExpense = project.maxSingleExpense;
    const storyRef = useRef<View>(null);
    const [savingStory, setSavingStory] = useState(false);
    const [stylePickerVisible, setStylePickerVisible] = useState(false);
    const [storyModalVisible, setStoryModalVisible] = useState(false);
    const [storyStyleId, setStoryStyleId] = useState<StoryStyleId>('soft');
    const selectedStyleName =
        STORY_STYLE_OPTIONS.find((o) => o.id === storyStyleId)?.name ?? '柔光回顧';

    const openStylePicker = useCallback(() => {
        if (savingStory) return;
        setStylePickerVisible(true);
    }, [savingStory]);

    const handleSaveStory = useCallback(async (styleId: StoryStyleId) => {
        if (savingStory) return;
        setStylePickerVisible(false);
        setStoryStyleId(styleId);
        setSavingStory(true);
        setStoryModalVisible(true);
        try {
            await new Promise((r) => setTimeout(r, 360));
            if (!(await Sharing.isAvailableAsync())) {
                Alert.alert('無法分享', '此裝置不支援分享功能');
                return;
            }
            const uri = await captureRef(storyRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile',
                width: STORY_CAPTURE_WIDTH,
                height: STORY_CAPTURE_HEIGHT,
            });
            setStoryModalVisible(false);
            await new Promise((r) => setTimeout(r, 120));
            await Sharing.shareAsync(uri, {
                mimeType: 'image/png',
                dialogTitle: '分享旅行總結',
            });
        } catch (e) {
            console.error('Save travel story failed', e);
            Alert.alert('儲存失敗', '無法產生分享圖片，請稍後再試');
        } finally {
            setStoryModalVisible(false);
            setSavingStory(false);
        }
    }, [savingStory]);

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    onPress={() => router.back()}
                    style={({ pressed }) => [styles.backBtn, pressed ? { opacity: 0.7 } : null]}
                    accessibilityRole="button"
                    accessibilityLabel="返回"
                    hitSlop={8}
                >
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <View style={styles.titleRow}>
                        <Ionicons name="airplane" size={18} color={colors.accent} />
                        <Text style={styles.title} numberOfLines={1}>{tripName}</Text>
                    </View>
                    <Text style={styles.subtitle}>
                        {formatDisplayRange(project.startDate, project.endDate)} · {project.durationDays} 天
                    </Text>
                </View>
                <View style={styles.backBtnPlaceholder} />
            </View>

            <DateCapsuleFilter
                dates={spendingDates}
                selectedDate={selectedCapsuleDate}
                onSelectAll={goOverview}
                onSelectDate={goDay}
            />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
                showsVerticalScrollIndicator={false}
            >
                {view.mode === 'overview' ? (
                    <OverviewContent
                        project={project}
                        spendingDayCount={spendingDates.length}
                        peakDay={peakDay}
                        categoryPie={categoryPie}
                        topExpenses={topExpenses}
                        maxExpense={maxExpense}
                        styles={styles}
                        colors={colors}
                        savingStory={savingStory}
                        onPeakDayPress={goDay}
                        onMaxExpensePress={(date) => goDay(date)}
                        onRankPress={(date) => goDay(date)}
                        onViewAllList={goAllList}
                        onSaveStory={openStylePicker}
                    />
                ) : null}

                {view.mode === 'day' ? (
                    <DayContent
                        date={view.date}
                        total={dayTotal}
                        count={dayRecords.length}
                        categories={dayCategories}
                        records={dayRecords}
                        styles={styles}
                    />
                ) : null}

                {view.mode === 'allList' ? (
                    <AllListContent
                        groups={allListGroups}
                        styles={styles}
                        onBackToOverview={goOverview}
                    />
                ) : null}
            </ScrollView>

            {/* 風格選擇 */}
            <Modal
                visible={stylePickerVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setStylePickerVisible(false)}
            >
                <View style={styles.stylePickerBackdrop}>
                    <Pressable style={styles.stylePickerDismiss} onPress={() => setStylePickerVisible(false)} />
                    <View style={[styles.stylePickerSheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
                        <View style={styles.stylePickerHandle} />
                        <Text style={styles.stylePickerTitle}>選擇分享風格</Text>
                        <Text style={styles.stylePickerSub}>共 4 種 · 選好後點下方按鈕產生</Text>

                        <View style={styles.styleGrid}>
                            {STORY_STYLE_OPTIONS.map((opt) => {
                                const selected = storyStyleId === opt.id;
                                const isDark = opt.id === 'midnight';
                                return (
                                    <Pressable
                                        key={opt.id}
                                        onPress={() => setStoryStyleId(opt.id)}
                                        style={[
                                            styles.styleCard,
                                            { width: styleCardWidth },
                                            selected ? styles.styleCardSelected : null,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected }}
                                        accessibilityLabel={opt.name}
                                    >
                                        {selected ? (
                                            <View style={styles.styleCheck}>
                                                <Ionicons name="checkmark" size={12} color="#FFF" />
                                            </View>
                                        ) : null}
                                        <LinearGradient
                                            colors={[...opt.preview]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.styleThumb}
                                        >
                                            <Text style={[styles.thumbEyebrow, isDark && styles.thumbTextLight]}>
                                                旅行總結
                                            </Text>
                                            <View style={[styles.thumbBar, isDark ? styles.thumbBarDark : null]} />
                                            <View style={styles.thumbChipRow}>
                                                <View style={[styles.thumbChip, isDark ? styles.thumbChipDark : null]} />
                                                <View style={[styles.thumbChip, isDark ? styles.thumbChipDark : null]} />
                                                <View style={[styles.thumbChip, isDark ? styles.thumbChipDark : null]} />
                                            </View>
                                        </LinearGradient>
                                        <Text style={[styles.styleCardName, selected && styles.styleCardNameSelected]}>
                                            {opt.name}
                                        </Text>
                                        <Text style={styles.styleCardDesc} numberOfLines={1}>{opt.desc}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View style={styles.styleActions}>
                            <Pressable
                                onPress={() => handleSaveStory(storyStyleId)}
                                disabled={savingStory}
                                style={[
                                    styles.styleConfirmBtn,
                                    savingStory ? { opacity: 0.88 } : null,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`使用${selectedStyleName}產生`}
                            >
                                {savingStory ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                                        <Text style={styles.styleConfirmText} numberOfLines={1}>
                                            使用「{selectedStyleName}」產生
                                        </Text>
                                    </>
                                )}
                            </Pressable>

                            <Pressable
                                onPress={() => setStylePickerVisible(false)}
                                style={styles.stylePickerCancel}
                                accessibilityRole="button"
                                accessibilityLabel="取消"
                            >
                                <Text style={styles.stylePickerCancelText}>取消</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 截圖用 Modal */}
            <Modal
                visible={storyModalVisible}
                transparent
                animationType="none"
                statusBarTranslucent
                onRequestClose={() => {}}
            >
                <View style={styles.storyModalRoot}>
                    <TravelStoryCard
                        ref={storyRef}
                        project={project}
                        tripName={tripName}
                        spendingDayCount={spendingDates.length}
                        peakDay={peakDay}
                        categoryPie={categoryPie}
                        styleId={storyStyleId}
                    />
                </View>
            </Modal>
        </View>
    );
}

// ─── Overview ───

function OverviewContent({
    project,
    spendingDayCount,
    peakDay,
    categoryPie,
    topExpenses,
    maxExpense,
    styles,
    colors,
    savingStory,
    onPeakDayPress,
    onMaxExpensePress,
    onRankPress,
    onViewAllList,
    onSaveStory,
}: {
    project: TravelProject;
    spendingDayCount: number;
    peakDay: { date: string; amount: number } | null;
    categoryPie: { category: string; amount: number; color: string; pct: number; value: number }[];
    topExpenses: TransformedRecord[];
    maxExpense: TransformedRecord | null;
    styles: ReturnType<typeof createStyles>;
    colors: AppColors;
    savingStory: boolean;
    onPeakDayPress: (date: string) => void;
    onMaxExpensePress: (date: string) => void;
    onRankPress: (date: string) => void;
    onViewAllList: () => void;
    onSaveStory: () => void;
}) {
    return (
        <>
            <View style={[styles.card, SHADOWS.sm]}>
                <Text style={styles.cardLabel}>我的總花費</Text>
                <Text style={styles.heroAmount}>{formatNT(project.totalExpense)}</Text>
            </View>

            <View style={styles.statsRow}>
                <View style={[styles.statCard, SHADOWS.sm]}>
                    <Ionicons name="receipt-outline" size={18} color={colors.accent} />
                    <Text style={styles.statValue}>{project.records.length}</Text>
                    <Text style={styles.statLabel}>筆消費</Text>
                </View>
                <View style={[styles.statCard, SHADOWS.sm]}>
                    <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                    <Text style={styles.statValue}>{spendingDayCount}</Text>
                    <Text style={styles.statLabel}>天有消費</Text>
                </View>
                <View style={[styles.statCard, SHADOWS.sm]}>
                    <Ionicons name="trending-up-outline" size={18} color={colors.green} />
                    <Text style={styles.statValueSm}>{formatNT(project.dailyAvg)}</Text>
                    <Text style={styles.statLabel}>行程日均</Text>
                </View>
            </View>

            {maxExpense ? (
                <TravelHighlightCard
                    title="最大筆消費"
                    icon="trophy"
                    iconColor={colors.yellow}
                    primary={getRankLabel(maxExpense)}
                    secondary={`${maxExpense['日期'].replace(/\//g, '-')}${maxExpense['主類別'] ? ` · ${maxExpense['主類別']}` : ''}`}
                    amount={formatNT(Math.abs(maxExpense['金額']))}
                    colors={colors}
                    onPress={() => onMaxExpensePress(maxExpense['日期'])}
                />
            ) : null}

            {peakDay ? (
                <TravelHighlightCard
                    title="花最多的一天"
                    icon="calendar"
                    iconColor={colors.red}
                    primary={formatCapsuleDateLabel(peakDay.date)}
                    amount={formatNT(peakDay.amount)}
                    colors={colors}
                    onPress={() => onPeakDayPress(peakDay.date)}
                />
            ) : null}

            {categoryPie.length > 0 ? (
                <View style={[styles.card, SHADOWS.sm]}>
                    <Text style={styles.sectionTitle}>分類支出</Text>
                    <View style={styles.categoryRow}>
                        <PieChart
                            data={categoryPie.map((c) => ({ value: c.value, color: c.color }))}
                            donut
                            innerRadius={42}
                            radius={68}
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
                            {categoryPie.map((c) => (
                                <View key={c.category} style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                                    <View style={styles.legendTextCol}>
                                        <Text style={styles.legendName} numberOfLines={1}>{c.category}</Text>
                                        <Text style={styles.legendPct}>{c.pct}%</Text>
                                    </View>
                                    <Text style={styles.legendAmount}>{formatNT(c.amount)}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>
            ) : null}

            {topExpenses.length > 0 ? (
                <RankingCard
                    title="花費排名"
                    records={topExpenses}
                    styles={styles}
                    onPressItem={(r) => onRankPress(r['日期'])}
                />
            ) : null}

            <Pressable
                onPress={onViewAllList}
                style={({ pressed }) => [styles.card, styles.viewAllCard, SHADOWS.sm, pressed ? { opacity: 0.9 } : null]}
                accessibilityRole="button"
                accessibilityLabel="查看全部明細"
            >
                <View style={styles.viewAllInner}>
                    <View style={styles.viewAllIconWrap}>
                        <Ionicons name="list-outline" size={18} color={colors.accent} />
                    </View>
                    <Text style={styles.viewAllText}>查看全部明細</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
            </Pressable>

            <Pressable
                onPress={onSaveStory}
                disabled={savingStory}
                style={({ pressed }) => [
                    styles.card,
                    styles.saveStoryCard,
                    SHADOWS.sm,
                    pressed || savingStory ? { opacity: 0.9 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="儲存圖片分享限時動態"
            >
                <View style={styles.viewAllInner}>
                    <View style={styles.viewAllIconWrap}>
                        {savingStory ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                        ) : (
                            <Ionicons name="image-outline" size={18} color={colors.accent} />
                        )}
                    </View>
                    <Text style={styles.viewAllText}>
                        {savingStory ? '產生限時動態圖…' : '儲存圖片'}
                    </Text>
                    <Text style={styles.saveStoryHint}>選風格</Text>
                </View>
            </Pressable>
        </>
    );
}

function RankingCard({
    title,
    records,
    styles,
    onPressItem,
}: {
    title: string;
    records: TransformedRecord[];
    styles: ReturnType<typeof createStyles>;
    onPressItem?: (record: TransformedRecord) => void;
}) {
    if (records.length === 0) return null;
    return (
        <View style={[styles.card, SHADOWS.sm, { paddingHorizontal: 0, paddingBottom: 4 }]}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 16 }]}>{title}</Text>
            {records.map((r, idx) => {
                const amount = Math.abs(r['金額']);
                const label = getRankLabel(r);
                const metaCat = r['子類別'] || r['主類別'] || '';
                const row = (
                    <View style={styles.rankRow}>
                        <Text style={styles.rankIndex}>{idx + 1}</Text>
                        <View style={styles.rankBody}>
                            <Text style={styles.rankName} numberOfLines={1}>{label}</Text>
                            <Text style={styles.rankMeta} numberOfLines={1}>
                                {r['日期'].replace(/\//g, '-')}
                                {metaCat ? ` · ${metaCat}` : ''}
                            </Text>
                        </View>
                        <Text style={styles.rankAmount}>{formatNT(amount)}</Text>
                    </View>
                );
                if (!onPressItem) {
                    return <View key={r.id || `rank-${idx}`}>{row}</View>;
                }
                return (
                    <Pressable
                        key={r.id || `rank-${idx}`}
                        onPress={() => onPressItem(r)}
                        style={({ pressed }) => [pressed ? { opacity: 0.85 } : null]}
                        accessibilityRole="button"
                        accessibilityLabel={`第 ${idx + 1} 名 ${label}`}
                    >
                        {row}
                    </Pressable>
                );
            })}
        </View>
    );
}

// ─── Day ───

function DayContent({
    date,
    total,
    count,
    categories,
    records,
    styles,
}: {
    date: string;
    total: number;
    count: number;
    categories: { category: string; amount: number }[];
    records: TransformedRecord[];
    styles: ReturnType<typeof createStyles>;
}) {
    const dayTotalCat = categories.reduce((s, c) => s + c.amount, 0);
    const dayTopExpenses = records.slice(0, 5);

    return (
        <>
            <View style={[styles.card, SHADOWS.sm]}>
                <Text style={styles.cardLabel}>{formatCapsuleDateLabel(date)} 花費</Text>
                <Text style={styles.heroAmount}>{formatNT(total)}</Text>
                <Text style={styles.heroSub}>{count} 筆</Text>
            </View>

            {categories.length > 0 ? (
                <View style={[styles.card, SHADOWS.sm]}>
                    <Text style={styles.sectionTitle}>當日分類</Text>
                    <View style={styles.miniCatList}>
                        {categories.map((c, i) => {
                            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length] as string;
                            const pct = dayTotalCat > 0 ? (c.amount / dayTotalCat) * 100 : 0;
                            return (
                                <View key={c.category} style={styles.miniCatRow}>
                                    <View style={styles.miniCatLeft}>
                                        <View style={[styles.legendDot, { backgroundColor: color }]} />
                                        <Text style={styles.miniCatName} numberOfLines={1}>{c.category}</Text>
                                    </View>
                                    <View style={styles.miniCatBarTrack}>
                                        <View style={[styles.miniCatBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                                    </View>
                                    <Text style={styles.miniCatAmount}>{formatNT(c.amount)}</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>
            ) : null}

            <RankingCard title="當日花費排名" records={dayTopExpenses} styles={styles} />

            <View style={[styles.card, SHADOWS.sm, { paddingHorizontal: 0, paddingVertical: 8 }]}>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 16, marginBottom: 4 }]}>消費明細</Text>
                {records.length === 0 ? (
                    <EmptyState icon="receipt-outline" title="當日無消費" />
                ) : (
                    records.map((r, idx) => (
                        <ExpenseRow key={r.id || `${r['日期']}-${idx}`} record={r} styles={styles} />
                    ))
                )}
            </View>
        </>
    );
}

// ─── All list ───

function AllListContent({
    groups,
    styles,
    onBackToOverview,
}: {
    groups: { date: string; total: number; records: TransformedRecord[] }[];
    styles: ReturnType<typeof createStyles>;
    onBackToOverview: () => void;
}) {
    return (
        <>
            <View style={styles.allListHeader}>
                <Text style={styles.sectionTitle}>全部明細</Text>
                <Pressable onPress={onBackToOverview} hitSlop={8} accessibilityRole="button" accessibilityLabel="返回總覽">
                    <Text style={styles.backToOverview}>返回總覽</Text>
                </Pressable>
            </View>

            {groups.map((g) => (
                <View key={g.date} style={[styles.card, SHADOWS.sm, { paddingHorizontal: 0, paddingTop: 12, paddingBottom: 8 }]}>
                    <View style={styles.groupHeader}>
                        <Text style={styles.groupDate}>{formatCapsuleDateLabel(g.date)}</Text>
                        <Text style={styles.groupTotal}>{formatNT(g.total)}</Text>
                    </View>
                    {g.records.map((r, idx) => (
                        <ExpenseRow key={r.id || `${g.date}-${idx}`} record={r} styles={styles} />
                    ))}
                </View>
            ))}
        </>
    );
}

function ExpenseRow({
    record,
    styles,
}: {
    record: TransformedRecord;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <View style={styles.expenseRow}>
            <View style={styles.expenseLeft}>
                <Text style={styles.expenseName} numberOfLines={1}>{getRecordTitle(record)}</Text>
                <Text style={styles.expenseMeta} numberOfLines={1}>
                    {[record['主類別'], record['商家'] || null].filter(Boolean).join(' · ')}
                </Text>
                {record['描述'] ? (
                    <Text style={styles.expenseDesc} numberOfLines={1}>{record['描述']}</Text>
                ) : null}
            </View>
            <Text style={styles.expenseAmount}>{formatNT(Math.abs(record['金額']))}</Text>
        </View>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) =>
    StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            paddingVertical: 8,
        },
        backBtn: {
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
        },
        backBtnPlaceholder: { width: 40 },
        headerCenter: { flex: 1, alignItems: 'center' },
        titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        title: { ...typography.h3, fontWeight: '800', color: colors.textPrimary, maxWidth: '85%' },
        subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2, color: colors.textMuted },
        scroll: { flex: 1 },
        scrollContent: { paddingHorizontal: 16, gap: 12, alignItems: 'stretch' },

        card: {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            padding: 16,
            ...withContinuousRadius(RADIUS.lg),
        },
        cardLabel: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
        heroAmount: {
            fontSize: 32,
            fontWeight: '800',
            color: colors.textPrimary,
            letterSpacing: -0.5,
            marginTop: 8,
            textAlign: 'center',
        },
        heroSub: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', marginTop: 4 },

        statsRow: { flexDirection: 'row', gap: 8 },
        statCard: {
            flex: 1,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            paddingVertical: 14,
            paddingHorizontal: 8,
            alignItems: 'center',
            gap: 4,
            ...withContinuousRadius(RADIUS.md),
        },
        statValue: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
        statValueSm: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
        statLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },

        sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
        categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        pieCenter: { alignItems: 'center' },
        pieCenterAmount: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
        pieCenterSub: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
        legend: { flex: 1, gap: 8 },
        legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        legendDot: { width: 8, height: 8, borderRadius: 4 },
        legendTextCol: { flex: 1, minWidth: 0 },
        legendName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
        legendPct: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
        legendAmount: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },

        viewAllCard: {
            paddingVertical: 14,
        },
        viewAllInner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        },
        viewAllIconWrap: {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.accentLight,
            alignItems: 'center',
            justifyContent: 'center',
        },
        viewAllText: {
            flex: 1,
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        saveStoryCard: {
            paddingVertical: 14,
        },
        saveStoryHint: {
            fontSize: 12,
            fontWeight: '700',
            color: colors.textMuted,
        },
        storyModalRoot: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        stylePickerBackdrop: {
            flex: 1,
            backgroundColor: colors.blackOverlay,
            justifyContent: 'flex-end',
        },
        stylePickerDismiss: {
            flex: 1,
        },
        stylePickerSheet: {
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 10,
            borderCurve: 'continuous',
            ...SHADOWS.lg,
        },
        stylePickerHandle: {
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            marginBottom: 14,
        },
        stylePickerTitle: {
            fontSize: 18,
            fontWeight: '800',
            color: colors.textPrimary,
            textAlign: 'center',
        },
        stylePickerSub: {
            fontSize: 13,
            fontWeight: '500',
            color: colors.textMuted,
            textAlign: 'center',
            marginTop: 4,
            marginBottom: 16,
        },
        styleGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            marginBottom: 8,
        },
        styleCard: {
            marginBottom: 12,
            backgroundColor: colors.bg,
            borderWidth: 2,
            borderColor: colors.cardBorder,
            padding: 10,
            ...withContinuousRadius(RADIUS.lg),
            position: 'relative',
            overflow: 'hidden',
        },
        styleCardSelected: {
            borderColor: colors.accent,
            backgroundColor: colors.accentLight,
        },
        styleCheck: {
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        styleThumb: {
            width: '100%',
            height: 64,
            borderRadius: 10,
            overflow: 'hidden',
            marginBottom: 8,
            paddingHorizontal: 10,
            paddingTop: 10,
            justifyContent: 'flex-start',
        },
        thumbEyebrow: {
            fontSize: 9,
            fontWeight: '700',
            color: colors.accent,
            marginBottom: 6,
        },
        thumbBar: {
            height: 10,
            width: '70%',
            borderRadius: 3,
            backgroundColor: 'rgba(15,23,42,0.85)',
            marginBottom: 8,
        },
        thumbBarDark: {
            backgroundColor: 'rgba(248,250,252,0.9)',
        },
        thumbChipRow: {
            flexDirection: 'row',
        },
        thumbChip: {
            flex: 1,
            height: 12,
            borderRadius: 4,
            backgroundColor: 'rgba(255,255,255,0.75)',
            marginHorizontal: 2,
        },
        thumbChipDark: {
            backgroundColor: 'rgba(30,41,59,0.85)',
        },
        thumbTextLight: {
            color: '#F8FAFC',
        },
        styleCardName: {
            fontSize: 15,
            fontWeight: '800',
            color: colors.textPrimary,
        },
        styleCardNameSelected: {
            color: colors.accent,
        },
        styleCardDesc: {
            fontSize: 11,
            color: colors.textMuted,
            marginTop: 2,
        },
        styleActions: {
            marginTop: 4,
        },
        styleConfirmBtn: {
            width: '100%',
            minHeight: 52,
            paddingHorizontal: 16,
            backgroundColor: '#2563EB',
            borderRadius: 14,
            borderCurve: 'continuous',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
        },
        styleConfirmText: {
            marginLeft: 8,
            flexShrink: 1,
            fontSize: 15,
            fontWeight: '800',
            color: '#FFFFFF',
        },
        stylePickerCancel: {
            alignItems: 'center',
            paddingVertical: 14,
            marginTop: 4,
        },
        stylePickerCancelText: {
            fontSize: 15,
            fontWeight: '700',
            color: colors.textSecondary,
        },

        // 對齊參考圖 / DetailModal 列表列：左名次+資訊，右金額
        rankRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.divider,
        },
        rankIndex: {
            width: 22,
            fontSize: 13,
            fontWeight: '700',
            color: colors.textMuted,
            textAlign: 'center',
            marginRight: 8,
        },
        rankBody: {
            flex: 1,
            minWidth: 0,
            marginRight: 12,
        },
        rankName: {
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        rankMeta: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
        },
        rankAmount: {
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPrimary,
            letterSpacing: -0.3,
        },

        miniCatList: { gap: 10 },
        miniCatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        miniCatLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 72 },
        miniCatName: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, flex: 1 },
        miniCatBarTrack: {
            flex: 1,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.divider,
            overflow: 'hidden',
        },
        miniCatBarFill: { height: '100%', borderRadius: 3 },
        miniCatAmount: { fontSize: 11, fontWeight: '700', color: colors.textPrimary, width: 72, textAlign: 'right' },

        allListHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
        },
        backToOverview: { fontSize: 14, fontWeight: '700', color: colors.accent },
        groupHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            marginBottom: 4,
        },
        groupDate: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
        groupTotal: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },

        expenseRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.divider,
            gap: 12,
        },
        expenseLeft: { flex: 1, minWidth: 0 },
        expenseName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
        expenseMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
        expenseDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
        expenseAmount: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
    });
