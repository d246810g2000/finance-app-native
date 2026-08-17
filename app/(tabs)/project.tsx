import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Dimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LineChart } from 'react-native-gifted-charts';
import { useNavigation } from '@react-navigation/native';
import { useFinance } from '../../context/FinanceContext';
import { filterAndSortRecords, transformRecordsForExport, computeProjectLifecycles, ProjectLifecycle } from '../../services/financeService';
import { AppColors, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import DateRangeSelector from '../../components/DateRangeSelector';
import DetailModal from '../../components/DetailModal';
import EmptyState from '../../components/ui/EmptyState';
import SortChips from '../../components/ui/SortChips';
import AccentListCard from '../../components/ui/AccentListCard';
import CompactSummaryBar from '../../components/ui/CompactSummaryBar';
import SectionHeader from '../../components/ui/SectionHeader';
import PageChrome from '../../components/layout/PageChrome';
import ProjectSettingsModal, { getAutoTimelineProjectNames } from '../../components/project/ProjectSettingsModal';
import { TransformedRecord } from '../../types';
import { TRAVEL_PROJECT_REGEX, ProjectData } from '../../services/shared';
import { Ionicons } from '@expo/vector-icons';
import ModalBackdrop from '../../components/ui/ModalBackdrop';

type SortKey = 'expense_desc' | 'expense_asc' | 'count_desc' | 'count_asc' | 'avg_desc' | 'avg_asc' | 'name_asc' | 'name_desc';

/** 日常專案不進長期時間軸（自動門檻邏輯在 ProjectSettingsModal） */
const SHEET_CHART_WIDTH = Dimensions.get('window').width - 56;

const ProjectRow = memo(function ProjectRow({
    item,
    isLongTerm,
    onPress,
}: {
    item: ProjectData;
    isLongTerm: boolean;
    onPress: (name: string) => void;
}) {
    const meta: { icon?: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
        { icon: 'documents-outline', text: `${item.recordCount} 筆` },
        { icon: 'analytics-outline', text: `平均 $${item.avgPerRecord.toLocaleString()}` },
    ];
    if (isLongTerm) {
        meta.push({ icon: 'time-outline', text: '長期' });
    }
    return (
        <AccentListCard
            onPress={() => onPress(item.name)}
            title={item.name}
            amount={`$${item.totalExpense.toLocaleString()}`}
            meta={meta}
            accessibilityLabel={`專案 ${item.name}，區間花費 ${item.totalExpense} 元`}
        />
    );
});

function formatMonthShort(monthKey: string): string {
    // YYYY-MM → YY.MM
    if (monthKey.length >= 7) return `${monthKey.slice(2, 4)}.${monthKey.slice(5, 7)}`;
    return monthKey;
}

function formatAmountShort(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(Math.round(n));
}

/** 篩選結束日不超過今天，避免顯示未來排程 */
function clampToToday(end: Date): Date {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return end.getTime() > today.getTime() ? today : end;
}

export default function ProjectScreen() {
    const navigation = useNavigation();
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const {
        records,
        globalExcludeTravel,
        setGlobalExcludeTravel,
        budgetConfig,
        saveBudgetConfig,
        budgets,
        saveBudgets,
    } = useFinance();

    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d;
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date(); d.setHours(23, 59, 59, 999); return d;
    });
    const [detailModal, setDetailModal] = useState<{ visible: boolean; title: string; data: TransformedRecord[] }>({
        visible: false, title: '', data: [],
    });
    const [lifecycleModal, setLifecycleModal] = useState<ProjectLifecycle | null>(null);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('expense_desc');
    const listRef = useRef<any>(null);

    React.useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Pressable
                    onPress={() => setSettingsVisible(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => [
                        { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
                        pressed && { opacity: 0.5 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="專案與預算設定"
                >
                    <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
                </Pressable>
            ),
        });
    }, [navigation, colors.textSecondary]);

    const handleDateChange = useCallback((start: Date, end: Date) => {
        setStartDate(start);
        setEndDate(end);
    }, []);

    const allLifecycles = useMemo(
        () => computeProjectLifecycles(records, true),
        [records]
    );

    const lifecyclesByName = useMemo(() => {
        const map: { [k: string]: ProjectLifecycle } = {};
        allLifecycles.forEach((l) => { map[l.name] = l; });
        return map;
    }, [allLifecycles]);

    const projectsData = useMemo(() => {
        const filtered = filterAndSortRecords(records, startDate, clampToToday(endDate));
        const transformed = transformRecordsForExport(filtered);
        const projectStats: { [key: string]: { count: number; expense: number } } = {};

        transformed.forEach((r) => {
            if (r['記錄類型'] !== '支出' || !r['專案']) return;
            if (globalExcludeTravel && TRAVEL_PROJECT_REGEX.test(r['專案'])) return;
            const name = r['專案'];
            if (!projectStats[name]) projectStats[name] = { count: 0, expense: 0 };
            projectStats[name].expense += Math.abs(r['金額']);
            projectStats[name].count += 1;
        });

        const arr = Object.entries(projectStats).map(([name, stats]) => ({
            name,
            totalExpense: Math.round(stats.expense),
            recordCount: stats.count,
            avgPerRecord: Math.round(stats.expense / stats.count),
        }));

        return arr.sort((a, b) => {
            switch (sortKey) {
                case 'expense_desc': return b.totalExpense - a.totalExpense;
                case 'expense_asc': return a.totalExpense - b.totalExpense;
                case 'count_desc': return b.recordCount - a.recordCount;
                case 'count_asc': return a.recordCount - b.recordCount;
                case 'avg_desc': return b.avgPerRecord - a.avgPerRecord;
                case 'avg_asc': return a.avgPerRecord - b.avgPerRecord;
                case 'name_asc': return a.name.localeCompare(b.name);
                case 'name_desc': return b.name.localeCompare(a.name);
                default: return b.totalExpense - a.totalExpense;
            }
        });
    }, [records, startDate, endDate, globalExcludeTravel, sortKey]);

    const totalExpenseAll = useMemo(
        () => projectsData.reduce((sum, p) => sum + p.totalExpense, 0),
        [projectsData]
    );

    const largeProjects = useMemo(() => {
        const names =
            budgetConfig.timelineProjects != null
                ? budgetConfig.timelineProjects
                : getAutoTimelineProjectNames(allLifecycles);
        const list = names
            .map((name) => lifecyclesByName[name])
            .filter((l): l is ProjectLifecycle => !!l);

        // 取選中專案中「最近一個有資料的月份」，依該月花費由高到低
        let latestMonth = '';
        list.forEach((l) => {
            l.monthlySpend.forEach((m) => {
                if (m.month > latestMonth) latestMonth = m.month;
            });
        });

        const spendInLatest = (l: ProjectLifecycle) =>
            latestMonth
                ? l.monthlySpend.find((m) => m.month === latestMonth)?.amount ?? 0
                : 0;

        return [...list].sort((a, b) => {
            const diff = spendInLatest(b) - spendInLatest(a);
            if (diff !== 0) return diff;
            return b.totalExpense - a.totalExpense;
        });
    }, [allLifecycles, lifecyclesByName, budgetConfig.timelineProjects]);

    const uniqueCategories = useMemo(() => {
        const cats = new Set<string>();
        records.forEach((r) => {
            if (r['付款(轉出)'] && !r['收款(轉入)'] && r['分類'] && r['分類'] !== 'SYSTEM' && r['分類'] !== '代付') {
                cats.add(r['分類']);
            }
        });
        return Array.from(cats).sort();
    }, [records]);

    const largeProjectNames = useMemo(
        () => new Set(largeProjects.map((l) => l.name)),
        [largeProjects]
    );

    useEffect(() => {
        if (projectsData.length > 0) {
            setTimeout(() => {
                listRef.current?.scrollToOffset({ offset: 0, animated: false });
            }, 10);
        }
    }, [sortKey, startDate, endDate]);

    /** 下方列表：一律開目前日期區間明細 */
    const openPeriodDetail = useCallback(
        (projectName: string) => {
            const filtered = filterAndSortRecords(records, startDate, clampToToday(endDate));
            const transformed = transformRecordsForExport(filtered).filter(
                (r) => r['專案'] === projectName && r['記錄類型'] === '支出'
            );
            setLifecycleModal(null);
            setDetailModal({
                visible: true,
                title: `${projectName}（篩選區間）`,
                data: transformed,
            });
        },
        [records, startDate, endDate]
    );

    /** 時間軸：點某月開該月明細 */
    const openMonthDetail = useCallback(
        (projectName: string, monthKey: string) => {
            // monthKey = YYYY-MM
            const [yStr, mStr] = monthKey.split('-');
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10) - 1;
            if (isNaN(y) || isNaN(m)) return;

            const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
            const monthEnd = clampToToday(new Date(y, m + 1, 0, 23, 59, 59, 999));
            if (monthStart.getTime() > monthEnd.getTime()) return;

            const filtered = filterAndSortRecords(records, monthStart, monthEnd);
            const data = transformRecordsForExport(filtered).filter(
                (r) => r['專案'] === projectName && r['記錄類型'] === '支出'
            );

            setLifecycleModal(null);
            setDetailModal({
                visible: true,
                title: `${projectName} · ${yStr}.${mStr}`,
                data,
            });
        },
        [records]
    );

    const monthsNewestFirst = useMemo(() => {
        if (!lifecycleModal) return [];
        return [...lifecycleModal.monthlySpend].sort((a, b) => b.month.localeCompare(a.month));
    }, [lifecycleModal]);

    const monthChartData = useMemo(() => {
        if (!lifecycleModal || lifecycleModal.monthlySpend.length === 0) return [];
        // 圖表：左舊右新，方便看出趨勢
        const chronological = [...lifecycleModal.monthlySpend].sort((a, b) =>
            a.month.localeCompare(b.month)
        );
        const peak = Math.max(...chronological.map((m) => m.amount), 1);
        const name = lifecycleModal.name;
        return chronological.map((m) => {
            const isPeak = m.amount === peak && peak > 0;
            return {
                value: m.amount,
                label: formatMonthShort(m.month),
                dataPointText: formatAmountShort(m.amount),
                textColor: colors.textMuted,
                textFontSize: 9,
                textShiftY: -10,
                dataPointColor: isPeak ? colors.red : colors.primary,
                dataPointRadius: isPeak ? 5 : 3,
                onPress: () => openMonthDetail(name, m.month),
            };
        });
    }, [lifecycleModal, colors, openMonthDetail]);

    const renderItem = useCallback(
        ({ item }: { item: ProjectData }) => (
            <ProjectRow
                item={item}
                isLongTerm={largeProjectNames.has(item.name)}
                onPress={openPeriodDetail}
            />
        ),
        [openPeriodDetail, largeProjectNames]
    );

    const listHeader = useMemo(
        () => (
            <View style={styles.listHeaderWrapper}>
                <CompactSummaryBar
                    items={[
                        { label: '總花費', value: `$${totalExpenseAll.toLocaleString()}` },
                        {
                            label: '平均',
                            value: `$${
                                projectsData.length > 0
                                    ? Math.round(totalExpenseAll / projectsData.length).toLocaleString()
                                    : '0'
                            }`,
                        },
                    ]}
                />

                {largeProjects.length > 0 ? (
                    <View style={styles.lifeSection}>
                        <SectionHeader title="長期專案時間軸" style={styles.sectionHeader} />
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.lifeScroll}
                        >
                            {largeProjects.map((l) => (
                                <Pressable
                                    key={l.name}
                                    style={styles.lifeCard}
                                    onPress={() => setLifecycleModal(l)}
                                >
                                    <Text style={styles.lifeName} numberOfLines={1}>
                                        {l.name}
                                    </Text>
                                    <Text style={styles.lifeAmount}>
                                        ${l.totalExpense.toLocaleString()}
                                    </Text>
                                    <Text style={styles.lifeMeta}>{l.monthSpan} 個月</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                ) : null}

                <SectionHeader title="專案支出" style={styles.sectionHeader} />

                <View style={styles.sortContainer}>
                    <SortChips
                        options={[
                            { key: 'expense', label: '總花費' },
                            { key: 'count', label: '記錄數' },
                            { key: 'avg', label: '單筆平均' },
                            { key: 'name', label: '名稱' },
                        ]}
                        activeKey={sortKey.replace(/_(asc|desc)$/, '')}
                        direction={sortKey.endsWith('_asc') ? 'asc' : 'desc'}
                        onChange={(key, direction) => setSortKey(`${key}_${direction}` as SortKey)}
                    />
                </View>
            </View>
        ),
        [projectsData.length, totalExpenseAll, sortKey, largeProjects, styles]
    );

    return (
        <View style={styles.container}>
            <PageChrome>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={`${projectsData.length} 個專案`}
                />
            </PageChrome>

            <FlashList
                ref={listRef}
                data={projectsData}
                renderItem={renderItem}
                keyExtractor={(item: ProjectData) => item.name}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={
                    <EmptyState
                        icon="folder-open-outline"
                        title="該期間無專案數據"
                        description="請試著切換頂部日期區間"
                    />
                }
                contentContainerStyle={styles.listContent}
                // @ts-ignore
                estimatedItemSize={84}
                extraData={largeProjectNames}
            />

            <DetailModal
                visible={detailModal.visible}
                title={detailModal.title}
                records={detailModal.data}
                onClose={() => setDetailModal({ ...detailModal, visible: false })}
            />

            <Modal
                visible={!!lifecycleModal}
                transparent
                animationType="slide"
                onRequestClose={() => setLifecycleModal(null)}
            >
                <ModalBackdrop colors={colors} placement="bottom" isDark={isDark}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setLifecycleModal(null)} />
                    {lifecycleModal ? (
                        <View style={styles.lifeSheet}>
                            <View style={styles.lifeSheetHandle} />
                            <Text style={styles.lifeSheetTitle}>{lifecycleModal.name}</Text>
                            <Text style={styles.lifeSheetSub}>
                                {lifecycleModal.firstDate} – {lifecycleModal.lastDate} ·{' '}
                                {lifecycleModal.monthSpan} 個月 · {lifecycleModal.recordCount} 筆
                            </Text>
                            <Text style={styles.lifeSheetAmount}>
                                累計 ${lifecycleModal.totalExpense.toLocaleString()}
                            </Text>

                            {monthChartData.length > 1 ? (
                                <View style={styles.chartWrap}>
                                    <Text style={styles.chartCaption}>月花費趨勢（點圖可看該月明細）</Text>
                                    <LineChart
                                        data={monthChartData}
                                        areaChart
                                        curved
                                        color={colors.primary}
                                        startFillColor={colors.primary}
                                        endFillColor={colors.primary}
                                        startOpacity={0.22}
                                        endOpacity={0.02}
                                        thickness={2.5}
                                        hideDataPoints={false}
                                        maxValue={
                                            Math.max(...monthChartData.map((d) => d.value), 1) * 1.25
                                        }
                                        noOfSections={3}
                                        spacing={Math.max(
                                            36,
                                            Math.min(56, (SHEET_CHART_WIDTH - 40) / Math.max(monthChartData.length - 1, 1))
                                        )}
                                        initialSpacing={16}
                                        endSpacing={28}
                                        scrollToEnd
                                        rulesColor={colors.divider}
                                        yAxisThickness={0}
                                        xAxisThickness={0}
                                        yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                                        xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                                        width={SHEET_CHART_WIDTH}
                                        height={132}
                                        formatYLabel={(v) => formatAmountShort(Number(v))}
                                    />
                                </View>
                            ) : null}

                            <Text style={styles.lifeSheetLabel}>月花費（新 → 舊）</Text>
                            <ScrollView style={styles.monthList} showsVerticalScrollIndicator={false}>
                                {monthsNewestFirst.map((m) => {
                                    const pct =
                                        lifecycleModal.totalExpense > 0
                                            ? Math.round((m.amount / lifecycleModal.totalExpense) * 100)
                                            : 0;
                                    const monthLabel =
                                        m.month.length >= 7
                                            ? `${m.month.slice(0, 4)}.${m.month.slice(5, 7)}`
                                            : m.month;
                                    return (
                                        <Pressable
                                            key={m.month}
                                            onPress={() => openMonthDetail(lifecycleModal.name, m.month)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`${monthLabel} 花費 ${m.amount} 元`}
                                            android_ripple={{ color: colors.outlineVariant }}
                                            style={({ pressed }) => [pressed && { opacity: 0.75 }]}
                                        >
                                            {/* Android：橫向排版放內層 View，避免 Pressable flex 失效 */}
                                            <View style={styles.monthRow}>
                                                <Text style={styles.monthKey} numberOfLines={1}>
                                                    {monthLabel}
                                                </Text>
                                                <Text style={styles.monthAmt}>
                                                    ${m.amount.toLocaleString()}
                                                </Text>
                                                <Text style={styles.monthPct}>{pct}%</Text>
                                                <Ionicons
                                                    name="chevron-forward"
                                                    size={16}
                                                    color={colors.textMuted}
                                                />
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>

                            <Pressable
                                style={styles.lifeDetailBtn}
                                onPress={() => openPeriodDetail(lifecycleModal.name)}
                            >
                                <Ionicons name="list-outline" size={18} color="#FFF" />
                                <Text style={styles.lifeDetailBtnText}>查看上方篩選區間明細</Text>
                            </Pressable>
                        </View>
                    ) : null}
                </ModalBackdrop>
            </Modal>

            <ProjectSettingsModal
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                config={budgetConfig}
                onSaveConfig={saveBudgetConfig}
                allRawRecords={records}
                lifecycles={allLifecycles}
                globalExcludeTravel={globalExcludeTravel}
                onExcludeTravelChange={setGlobalExcludeTravel}
                budgets={budgets}
                onSaveBudgets={saveBudgets}
                uniqueCategories={uniqueCategories}
            />
        </View>
    );
}

const createStyles = (colors: AppColors) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        listContent: { paddingHorizontal: 16, paddingBottom: 20 },
        listHeaderWrapper: { marginHorizontal: -16 },
        sectionHeader: { marginHorizontal: 16, marginTop: 22, marginBottom: 2 },
        sortContainer: { marginTop: 12, marginBottom: 0 },
        lifeSection: { marginTop: 4 },
        lifeScroll: { paddingHorizontal: 16, gap: 10, paddingTop: 10, paddingBottom: 4 },
        lifeCard: {
            minWidth: 112,
            backgroundColor: colors.surfaceContainer,
            borderRadius: RADIUS.md,
            padding: 14,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.outlineVariant,
            minHeight: 88,
        },
        lifeName: { fontSize: 13, fontWeight: '700', color: colors.onSurfaceVariant, marginBottom: 4 },
        lifeAmount: { fontSize: 16, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
        lifeMeta: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 4 },
        lifeSheet: {
            backgroundColor: colors.surfaceContainer,
            borderTopLeftRadius: RADIUS.sheet,
            borderTopRightRadius: RADIUS.sheet,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 28,
            maxHeight: '82%',
        },
        lifeSheetHandle: {
            alignSelf: 'center',
            width: 32,
            height: 4,
            borderRadius: RADIUS.full,
            backgroundColor: colors.outline,
            marginBottom: 14,
        },
        lifeSheetTitle: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
        lifeSheetSub: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
        lifeSheetAmount: { fontSize: 28, fontWeight: '800', color: colors.primary, marginTop: 12 },
        chartWrap: {
            marginTop: 16,
            marginHorizontal: -4,
            paddingTop: 4,
            paddingBottom: 4,
        },
        chartCaption: {
            fontSize: 12,
            fontWeight: '600',
            color: colors.textMuted,
            marginBottom: 8,
            marginLeft: 4,
        },
        lifeSheetLabel: {
            fontSize: 13,
            fontWeight: '700',
            color: colors.textSecondary,
            marginTop: 14,
            marginBottom: 8,
        },
        monthList: { maxHeight: 180 },
        monthRow: {
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.divider,
            gap: 8,
        },
        monthKey: {
            flex: 1,
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        monthAmt: {
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPrimary,
            textAlign: 'right',
        },
        monthPct: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textMuted,
            minWidth: 36,
            textAlign: 'right',
        },
        lifeDetailBtn: {
            marginTop: 16,
            backgroundColor: colors.primary,
            borderRadius: 12,
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
        },
        lifeDetailBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
    });
