import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    InteractionManager,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, LineChartBicolor } from 'react-native-gifted-charts';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useFinance } from '../../context/FinanceContext';
import { useAppTheme } from '../../context/ThemeContext';
import { TransformedRecord } from '../../types';
import { AppColors, RADIUS, SHADOWS, withContinuousRadius } from '../../theme';
import {
    buildHealthDashboard,
    getIncomeExpenseRows,
    HEALTH_SCORE_WEIGHTS,
    shiftMonth,
    type Achievement,
    type HealthInsight,
} from '../../services/financialHealthService';
import { PROJECT_DEFINITIONS } from '../../services/projectDefinitions';
import PageChrome from '../../components/layout/PageChrome';
import UnifiedDateNavigator from '../../components/layout/UnifiedDateNavigator';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SectionHeader from '../../components/ui/SectionHeader';
import EmptyState from '../../components/ui/EmptyState';
import HealthCheckCard from '../../components/budget/HealthCheckCard';
import BottomSheet from '../../components/ui/BottomSheet';
import ModalBackdrop from '../../components/ui/ModalBackdrop';
import SheetHeader from '../../components/ui/SheetHeader';

type TabKey = 'overview' | 'structure' | 'trends' | 'alerts';
type AccountViewType = 'all' | 'personal' | 'shared';
type HealthMode = 'daily' | 'all';
type HealthStyles = ReturnType<typeof createStyles>;

const SCORE_PARTS = [
    ['儲蓄率', 'savings', HEALTH_SCORE_WEIGHTS.savings],
    ['現金流', 'cashflow', HEALTH_SCORE_WEIGHTS.cashflow],
    ['支出穩定', 'stability', HEALTH_SCORE_WEIGHTS.stability],
    ['固定負擔', 'debtOrBurden', HEALTH_SCORE_WEIGHTS.debtOrBurden],
    ['超支控制', 'overspend', HEALTH_SCORE_WEIGHTS.overspend],
] as const;

const DAILY_EXCLUDED_PROJECTS = PROJECT_DEFINITIONS
    .filter((item) => item.owner === 'capital' || item.owner === 'event')
    .map((item) => item.name);

const EMPTY_PREPARED_ROWS: TransformedRecord[] = [];

const TAB_OPTIONS = [
    { value: 'overview', label: '總覽' },
    { value: 'structure', label: '結構' },
    { value: 'trends', label: '趨勢' },
    { value: 'alerts', label: '提醒' },
] as const;

function money(value: number): string {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(Math.round(value)).toLocaleString()}`;
}

function compactMoney(value: number): string {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}m`;
    if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
    return `${sign}${Math.round(abs)}`;
}

function pct(value: number | null, digits = 1): string {
    return value === null || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}%`;
}

function deltaLabel(value: number | null): string {
    if (value === null) return '—';
    if (value === 0) return '±0%';
    const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '−';
    return `${arrow}${Math.abs(value).toFixed(0)}%`;
}

function monthShort(monthKey: string): string {
    return monthKey.slice(5);
}

export default function HealthScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const { width } = useWindowDimensions();
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { records, budgets, budgetConfig, personalAccounts, sharedAccounts } = useFinance();
    const isFocused = useIsFocused();
    const [targetMonth, setTargetMonth] = useState(() => new Date());
    const [tab, setTab] = useState<TabKey>('overview');
    const [accountViewType, setAccountViewType] = useState<AccountViewType>('personal');
    const [healthMode, setHealthMode] = useState<HealthMode>('daily');
    const [filtersVisible, setFiltersVisible] = useState(false);
    const [draftAccountViewType, setDraftAccountViewType] = useState<AccountViewType>('personal');
    const [draftHealthMode, setDraftHealthMode] = useState<HealthMode>('daily');

    const exitHealth = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
    }, [router]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerLeft: () => (
                <Pressable
                    onPress={exitHealth}
                    hitSlop={12}
                    style={({ pressed }) => [styles.headerBack, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="離開財務健檢"
                >
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    <Text style={styles.headerBackText}>返回</Text>
                </Pressable>
            ),
        });
    }, [colors.textPrimary, exitHealth, navigation, styles]);

    // Heavy aggregation is gated behind focus so background tabs don't burn JS time
    // when records change while the user is on another screen.
    const preparedRows = useMemo(
        () => (isFocused ? getIncomeExpenseRows(records) : EMPTY_PREPARED_ROWS),
        [isFocused, records]
    );

    const healthScope = useMemo(() => {
        const accountFilter =
            accountViewType === 'personal'
                ? personalAccounts
                : accountViewType === 'shared'
                    ? sharedAccounts
                    : null;
        return {
            accountFilter,
            isSplitShared: !!budgetConfig.isSplitEnabled,
            sharedAccounts,
            excludedProjects: healthMode === 'daily' ? DAILY_EXCLUDED_PROJECTS : [],
            excludeTravelProjects: healthMode === 'daily',
            preparedRows,
        };
    }, [
        accountViewType,
        personalAccounts,
        sharedAccounts,
        budgetConfig.isSplitEnabled,
        healthMode,
        preparedRows,
    ]);

    const lastGoodDashboard = useRef<ReturnType<typeof buildHealthDashboard> | null>(null);

    const dashboard = useMemo(
        () => {
            if (!isFocused) return lastGoodDashboard.current ?? buildHealthDashboard([], targetMonth, budgetConfig, budgets, healthScope);
            const next = buildHealthDashboard(records, targetMonth, budgetConfig, budgets, healthScope);
            lastGoodDashboard.current = next;
            return next;
        },
        [isFocused, records, targetMonth, budgetConfig, budgets, healthScope]
    );

    const chartWidth = Math.max(240, width - 104);
    const monthLabel = `${targetMonth.getFullYear()}年${targetMonth.getMonth() + 1}月`;
    const onPrev = useCallback(() => setTargetMonth((date) => shiftMonth(date, -1)), []);
    const onNext = useCallback(() => setTargetMonth((date) => shiftMonth(date, 1)), []);
    const changeTab = useCallback((nextTab: TabKey) => {
        setTab(nextTab);
    }, []);
    const showAlerts = useCallback(() => changeTab('alerts'), [changeTab]);
    const openFilters = useCallback(() => {
        setDraftAccountViewType(accountViewType);
        setDraftHealthMode(healthMode);
        setFiltersVisible(true);
    }, [accountViewType, healthMode]);
    const closeFilters = useCallback(() => setFiltersVisible(false), []);
    const applyFilters = useCallback(() => {
        setAccountViewType(draftAccountViewType);
        setHealthMode(draftHealthMode);
        setFiltersVisible(false);
    }, [draftAccountViewType, draftHealthMode]);

    const scoreColor = useCallback((score: number | null) => {
        if (score === null) return colors.textMuted;
        if (score >= 75) return colors.green;
        if (score >= 50) return colors.yellow;
        return colors.red;
    }, [colors]);

    const scoreSummary = useMemo(() => {
        const ranked = SCORE_PARTS.map(([label, key, max]) => ({
            label,
            score: dashboard.health.breakdown[key],
            max,
            ratio: dashboard.health.breakdown[key] / max,
        })).sort((a, b) => a.ratio - b.ratio);
        const weakest = ranked[0];
        const strongest = ranked[ranked.length - 1];
        return `${strongest.label}表現最佳；${weakest.label}仍有 ${weakest.max - weakest.score} 分改善空間`;
    }, [dashboard.health.breakdown]);

    const topAlerts = useMemo(
        () => (tab === 'overview' || tab === 'alerts' ? dashboard.insights.slice(0, 2) : []),
        [tab, dashboard]
    );

    // Hoisted so re-entering the trends tab skips the loading placeholder.
    const [chartsReady, setChartsReady] = useState(false);
    useEffect(() => {
        if (!isFocused || chartsReady) return;
        const task = InteractionManager.runAfterInteractions(() => {
            // Warm the trend aggregations before flipping ready, so the first
            // chart frame doesn't pay for 12-month aggregation work.
            void dashboard.savings.months.length;
            void dashboard.cashflowYear.length;
            void dashboard.categoryTrends.length;
            setChartsReady(true);
        });
        return () => task.cancel();
    }, [isFocused, chartsReady, dashboard]);
    const accountLabel =
        accountViewType === 'personal' ? '個人' : accountViewType === 'shared' ? '共享' : '全部';
    const modeLabel = healthMode === 'daily' ? '日常' : '含專案';

    return (
        <View style={styles.root}>
            <PageChrome style={styles.chrome}>
                <UnifiedDateNavigator
                    dateLabel={monthLabel}
                    subLabel={healthMode === 'daily' ? '日常健檢' : '含所有專案'}
                    onPrev={onPrev}
                    onNext={onNext}
                    onCenterPress={() => setTargetMonth(new Date())}
                />
                <Pressable
                    onPress={openFilters}
                    style={({ pressed }) => [styles.filterSummary, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`篩選條件，${accountLabel}帳戶，${modeLabel}健檢`}
                >
                    <View style={styles.filterSummaryIcon}>
                        <Ionicons name="options-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.filterSummaryCopy}>
                        <Text style={styles.filterSummaryTitle} numberOfLines={1}>
                            {accountLabel} · {modeLabel}
                        </Text>
                        <Text style={styles.filterSummarySub} numberOfLines={1}>
                            帳戶範圍與分析口徑
                        </Text>
                    </View>
                    <View style={styles.filterActionWrap}>
                        <Text style={styles.filterAction}>調整</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                    </View>
                </Pressable>
                <View style={styles.tabs}>
                    <SegmentedControl
                        options={[...TAB_OPTIONS]}
                        value={tab}
                        onChange={changeTab}
                        variant="view"
                        fullWidth
                        accessibilityLabel="健檢分頁"
                    />
                </View>
            </PageChrome>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {dashboard.health.insufficientData ? (
                    <EmptyState
                        icon="heart-outline"
                        title="這個範圍尚無收支資料"
                        description="切換月份、帳戶範圍或改看「含專案」"
                    />
                ) : null}

                {tab === 'overview' && !dashboard.health.insufficientData ? (
                    <OverviewTab
                        dashboard={dashboard}
                        topAlerts={topAlerts}
                        scoreSummary={scoreSummary}
                        scoreColor={scoreColor}
                        colors={colors}
                        styles={styles}
                        onShowAlerts={showAlerts}
                    />
                ) : null}

                {tab === 'structure' && !dashboard.health.insufficientData ? (
                    <StructureTab dashboard={dashboard} colors={colors} styles={styles} />
                ) : null}

                {tab === 'trends' && !dashboard.health.insufficientData ? (
                    <TrendsTab
                        dashboard={dashboard}
                        chartWidth={chartWidth}
                        colors={colors}
                        styles={styles}
                        chartsReady={chartsReady}
                    />
                ) : null}

                {tab === 'alerts' && !dashboard.health.insufficientData ? (
                    <AlertsTab dashboard={dashboard} colors={colors} styles={styles} />
                ) : null}
                <View style={styles.bottomSpace} />
            </ScrollView>
            <Modal
                transparent
                visible={filtersVisible}
                animationType="fade"
                statusBarTranslucent
                onRequestClose={closeFilters}
            >
                <ModalBackdrop colors={colors}>
                    <Pressable
                        style={styles.modalDismiss}
                        onPress={closeFilters}
                        accessibilityRole="button"
                        accessibilityLabel="關閉篩選"
                    />
                    <BottomSheet maxHeight="70%" contentStyle={styles.sheetContent}>
                        <SheetHeader
                            title="健檢篩選"
                            subtitle="切換後所有分數與統計會同步更新"
                            onClose={applyFilters}
                            closeLabel="完成"
                        />
                        <View style={styles.sheetSection}>
                            <Text style={styles.sheetLabel}>帳戶範圍</Text>
                            <SegmentedControl
                                options={[
                                    { value: 'all', label: '全部', icon: 'apps-outline' },
                                    { value: 'personal', label: '個人', icon: 'person-outline' },
                                    { value: 'shared', label: '共享', icon: 'people-outline' },
                                ]}
                                value={draftAccountViewType}
                                onChange={setDraftAccountViewType}
                                fullWidth
                                accessibilityLabel="帳戶範圍篩選"
                            />
                        </View>
                        <View style={styles.sheetSection}>
                            <Text style={styles.sheetLabel}>分析口徑</Text>
                            <SegmentedControl
                                options={[
                                    { value: 'daily', label: '日常', icon: 'leaf-outline' },
                                    { value: 'all', label: '含專案', icon: 'briefcase-outline' },
                                ]}
                                value={draftHealthMode}
                                onChange={setDraftHealthMode}
                                fullWidth
                                accessibilityLabel="健檢分析口徑"
                            />
                            <Text style={styles.sheetHelper}>
                                日常模式會排除裝潢、購屋、婚禮與旅遊等一次性專案。
                            </Text>
                        </View>
                    </BottomSheet>
                </ModalBackdrop>
            </Modal>
        </View>
    );
}

const OverviewTab = memo(function OverviewTab({
    dashboard,
    topAlerts,
    scoreSummary,
    scoreColor,
    colors,
    styles,
    onShowAlerts,
}: {
    dashboard: ReturnType<typeof buildHealthDashboard>;
    topAlerts: HealthInsight[];
    scoreSummary: string;
    scoreColor: (score: number | null) => string;
    colors: AppColors;
    styles: HealthStyles;
    onShowAlerts: () => void;
}) {
    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const unlocked = detailsExpanded
        ? dashboard.achievements.filter((item) => item.unlocked)
        : [];
    return (
        <>
            <View style={[styles.scoreCard, SHADOWS.sm]}>
                <View
                    style={styles.scoreHero}
                    accessible
                    accessibilityLabel={`財務健康分數 ${dashboard.health.score ?? '無資料'}，${
                        (dashboard.health.score ?? 0) >= 75
                            ? '狀況良好'
                            : (dashboard.health.score ?? 0) >= 50
                                ? '仍可改善'
                                : '需要留意'
                    }`}
                >
                    <View>
                        <Text style={styles.eyebrow}>財務健康分數</Text>
                        <Text
                            style={[styles.scoreValue, { color: scoreColor(dashboard.health.score) }]}
                            selectable
                        >
                            {dashboard.health.score ?? '—'}
                        </Text>
                    </View>
                    <View style={styles.scoreCopy}>
                        <Text style={styles.scoreStatus}>
                            {(dashboard.health.score ?? 0) >= 75
                                ? '狀況良好'
                                : (dashboard.health.score ?? 0) >= 50
                                    ? '仍可改善'
                                    : '需要留意'}
                        </Text>
                        <Text style={styles.scoreSummary}>{scoreSummary}</Text>
                    </View>
                </View>
                <Pressable
                    onPress={() => setDetailsExpanded((value) => !value)}
                    style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={detailsExpanded ? '收合評分細項' : '查看評分細項'}
                    accessibilityState={{ expanded: detailsExpanded }}
                >
                    <Text style={styles.expandButtonText}>
                        {detailsExpanded ? '收合評分細項' : '查看評分細項'}
                    </Text>
                    <Ionicons
                        name={detailsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.primary}
                    />
                </Pressable>
                {detailsExpanded ? (
                    <View style={styles.breakdownList}>
                        {SCORE_PARTS.map(([label, key, max]) => {
                            const value = dashboard.health.breakdown[key];
                            const ratio = value / max;
                            return (
                                <View key={key} style={styles.breakdownRow}>
                                    <Text style={styles.breakdownLabel}>{label}</Text>
                                    <View style={styles.barTrack}>
                                        <View
                                            style={[
                                                styles.barFill,
                                                {
                                                    width: `${ratio * 100}%`,
                                                    backgroundColor: scoreColor(ratio * 100),
                                                },
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.breakdownPoints}>{value}/{max}</Text>
                                </View>
                            );
                        })}
                    </View>
                ) : null}
            </View>

            <View style={[styles.overviewKpiRow, SHADOWS.sm]}>
                {[
                    ['收入', money(dashboard.health.kpi.income), colors.green],
                    ['支出', money(dashboard.health.kpi.expense), colors.red],
                    ['結餘', money(dashboard.health.kpi.net), dashboard.health.kpi.net >= 0 ? colors.green : colors.red],
                    ['儲蓄率', pct(dashboard.health.kpi.savingsRate), colors.blue],
                ].map(([label, value, color]) => (
                    <View key={label} style={styles.overviewKpiCell} accessibilityLabel={`${label} ${value}`}>
                        <Text style={styles.kpiLabel}>{label}</Text>
                        <Text
                            style={[styles.overviewKpiValue, { color }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {value}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={styles.insightStrip}>
                {dashboard.health.kpi.netVsPrevMonth === 0 ? (
                    <Ionicons name="remove" size={22} color={colors.textMuted} />
                ) : (
                    <Ionicons
                        name={dashboard.health.kpi.netVsPrevMonth > 0 ? 'trending-up' : 'trending-down'}
                        size={22}
                        color={dashboard.health.kpi.netVsPrevMonth > 0 ? colors.green : colors.red}
                    />
                )}
                <View style={styles.insightCopy}>
                    <Text style={styles.insightTitle}>
                        {dashboard.health.kpi.netVsPrevMonth === 0
                            ? '與上月持平'
                            : `比上月${dashboard.health.kpi.netVsPrevMonth > 0 ? '多存' : '少存'} ${money(Math.abs(dashboard.health.kpi.netVsPrevMonth))}`}
                    </Text>
                    <Text style={styles.insightSub}>
                        最大支出：{dashboard.health.kpi.topExpenseCategory || '—'}
                        {dashboard.health.kpi.topExpenseAmount
                            ? ` ${money(dashboard.health.kpi.topExpenseAmount)}`
                            : ''}
                    </Text>
                </View>
            </View>

            <SectionHeader
                title="本月重點"
                style={styles.section}
                trailing={topAlerts.length > 0 ? (
                    <Pressable
                        onPress={onShowAlerts}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="查看全部警示"
                    >
                        <Text style={styles.link}>查看全部</Text>
                    </Pressable>
                ) : null}
            />
            {topAlerts.length > 0 ? topAlerts.map((item) => (
                <View key={item.id} style={styles.mb10}>
                    <HealthCheckCard
                        variant={insightVariant(item.severity)}
                        title={item.title}
                        description={item.detail}
                    />
                </View>
            )) : (
                <HealthCheckCard
                    variant="success"
                    title="本月沒有重大警示"
                    description="目前的跨月趨勢與預算狀態穩定"
                />
            )}

            <SectionHeader title="月報摘要" style={styles.section} />
            <View style={[styles.card, SHADOWS.sm]}>
                <ReportRow label="收入" value={money(dashboard.report.income)} delta={dashboard.report.incomeDeltaPct} colors={colors} styles={styles} />
                <ReportRow label="支出" value={money(dashboard.report.expense)} delta={dashboard.report.expenseDeltaPct} colors={colors} styles={styles} invert />
                <ReportRow label="結餘" value={money(dashboard.report.net)} delta={dashboard.report.netDeltaPct} colors={colors} styles={styles} />
            </View>

            {detailsExpanded && unlocked.length > 0 ? (
                <>
                    <SectionHeader title={`已達成 ${unlocked.length} 項成就`} style={styles.section} />
                    {unlocked.map((item) => (
                        <AchievementRow key={item.id} item={item} colors={colors} styles={styles} />
                    ))}
                </>
            ) : null}
        </>
    );
});

const StructureTab = memo(function StructureTab({
    dashboard,
    colors,
    styles,
}: {
    dashboard: ReturnType<typeof buildHealthDashboard>;
    colors: AppColors;
    styles: HealthStyles;
}) {
    const [showAllCategories, setShowAllCategories] = useState(false);
    const visibleStructure = showAllCategories
        ? dashboard.structure.slice(0, 8)
        : dashboard.structure.slice(0, 5);
    return (
        <>
            <SectionHeader title="本月現金流" style={styles.sectionFirst} />
            <View style={[styles.card, SHADOWS.sm]}>
                {[
                    ['收入', dashboard.cashflow.income, colors.green],
                    ['固定支出', -dashboard.cashflow.fixedExpense, colors.red],
                    ['變動支出', -dashboard.cashflow.variableExpense, colors.yellow],
                    ['最後剩餘', dashboard.cashflow.remainder, dashboard.cashflow.remainder >= 0 ? colors.green : colors.red],
                ].map(([label, value, color], index) => (
                    <View key={label as string} style={[styles.valueRow, index > 0 && styles.divider]}>
                        <Text style={styles.rowLabel}>{label}</Text>
                        <Text style={[styles.rowValue, { color: color as string }]}>{money(value as number)}</Text>
                    </View>
                ))}
            </View>

            <SectionHeader title="支出結構" style={styles.section} />
            <View style={[styles.card, SHADOWS.sm]}>
                {visibleStructure.map((item, index) => (
                    <View key={item.name} style={[styles.structureRow, index > 0 && styles.divider]}>
                        <View style={styles.structureHead}>
                            <Text style={styles.structureName}>{item.name}</Text>
                            <Text style={styles.structureAmount}>{money(item.amount)}</Text>
                        </View>
                        <View style={styles.structureMetaRow}>
                            <View style={styles.structureTrack}>
                                <View style={[styles.structureFill, { width: `${item.pct}%` }]} />
                            </View>
                            <Text style={styles.structureMeta}>
                                {item.pct.toFixed(1)}% · {item.deltaPct === null ? '首次' : `${deltaLabel(item.deltaPct)} vs 上月`}
                            </Text>
                        </View>
                    </View>
                ))}
                {dashboard.structure.length > 5 ? (
                    <Pressable
                        onPress={() => setShowAllCategories((value) => !value)}
                        style={({ pressed }) => [styles.listExpandButton, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel={showAllCategories ? '收合類別' : `顯示其餘類別`}
                        accessibilityState={{ expanded: showAllCategories }}
                    >
                        <Text style={styles.expandButtonText}>
                            {showAllCategories ? '收合類別' : `顯示其餘 ${Math.min(3, dashboard.structure.length - 5)} 項`}
                        </Text>
                        <Ionicons
                            name={showAllCategories ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={colors.primary}
                        />
                    </Pressable>
                ) : null}
            </View>

            <SectionHeader title="消費行為" style={styles.section} />
            <View style={styles.kpiGrid}>
                {[
                    ['每日平均', money(dashboard.behavior.avgDaily)],
                    ['每筆平均', money(dashboard.behavior.avgTxn)],
                    ['交易筆數', `${dashboard.behavior.txnCount} 筆`],
                    ['最大消費日', dashboard.behavior.maxSpendDay ? money(dashboard.behavior.maxSpendDay.amount) : '—'],
                ].map(([label, value]) => (
                    <View key={label} style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>{label}</Text>
                        <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
                    </View>
                ))}
            </View>
            <SectionHeader title="星期分布" style={styles.section} />
            <BarList items={dashboard.behavior.byWeekday} styles={styles} />
            <SectionHeader title="月初／月中／月底" style={styles.section} />
            <BarList items={dashboard.behavior.byMonthThird} styles={styles} />
        </>
    );
});

const TrendsTab = memo(function TrendsTab({
    dashboard,
    chartWidth,
    colors,
    styles,
    chartsReady,
}: {
    dashboard: ReturnType<typeof buildHealthDashboard>;
    chartWidth: number;
    colors: AppColors;
    styles: HealthStyles;
    chartsReady: boolean;
}) {
    const [metric, setMetric] = useState<'savings' | 'cashflow' | 'category'>('savings');
    const [categoryIndex, setCategoryIndex] = useState(0);

    if (!chartsReady) {
        return (
            <View style={styles.chartLoading} accessibilityRole="progressbar">
                <Ionicons name="analytics-outline" size={28} color={colors.primary} />
                <Text style={styles.chartLoadingTitle}>正在準備趨勢圖</Text>
                <Text style={styles.chartLoadingSub}>先完成頁面切換，再載入圖表</Text>
            </View>
        );
    }

    return (
        <>
            <SectionHeader title="近 12 月趨勢" style={styles.sectionFirst} />
            <View style={styles.metricSelector}>
                <SegmentedControl
                    options={[
                        { value: 'savings', label: '儲蓄率' },
                        { value: 'cashflow', label: '現金流' },
                        { value: 'category', label: '類別' },
                    ]}
                    value={metric}
                    onChange={setMetric}
                    variant="filter"
                    fullWidth
                    accessibilityLabel="趨勢指標"
                />
            </View>

            {metric === 'savings' ? (
            <View style={[styles.chartCard, SHADOWS.sm]}>
                <View style={styles.statRow}>
                    <Stat label="12 月平均" value={pct(dashboard.savings.averageRate)} styles={styles} />
                    <Stat label="最佳" value={dashboard.savings.best ? `${monthShort(dashboard.savings.best.monthKey)}月 ${pct(dashboard.savings.best.savingsRate, 0)}` : '—'} styles={styles} />
                    <Stat label="最差" value={dashboard.savings.worst ? `${monthShort(dashboard.savings.worst.monthKey)}月 ${pct(dashboard.savings.worst.savingsRate, 0)}` : '—'} styles={styles} />
                </View>
                <LineChartBicolor
                    data={dashboard.savings.months.map((item) => ({
                        value: item.savingsRate ?? 0,
                        label: monthShort(item.monthKey),
                    }))}
                    width={chartWidth}
                    height={160}
                    spacing={Math.max(34, chartWidth / 11)}
                    initialSpacing={10}
                    endSpacing={12}
                    color={colors.green}
                    colorNegative={colors.red}
                    thickness={2.5}
                    hideDataPoints
                    noOfSections={4}
                    rulesColor={colors.divider}
                    yAxisThickness={0}
                    xAxisThickness={0}
                    yAxisTextStyle={styles.chartAxis}
                    xAxisLabelTextStyle={styles.chartAxis}
                    formatYLabel={(value) => `${Math.round(Number(value))}%`}
                />
            </View>
            ) : null}

            {metric === 'cashflow' ? (
            <View style={[styles.chartCard, SHADOWS.sm]}>
                <LineChartBicolor
                    data={dashboard.cashflowYear.map((item) => ({
                        value: item.remainder,
                        label: monthShort(item.monthKey),
                    }))}
                    width={chartWidth}
                    height={160}
                    spacing={Math.max(34, chartWidth / 11)}
                    initialSpacing={10}
                    endSpacing={12}
                    color={colors.green}
                    colorNegative={colors.red}
                    thickness={2.5}
                    hideDataPoints
                    noOfSections={4}
                    rulesColor={colors.divider}
                    yAxisThickness={0}
                    xAxisThickness={0}
                    yAxisTextStyle={styles.chartAxis}
                    xAxisLabelTextStyle={styles.chartAxis}
                    formatYLabel={(value) => compactMoney(Number(value))}
                />
            </View>
            ) : null}

            {metric === 'category' && dashboard.categoryTrends.length > 0 ? (
                <>
                    <View style={styles.categoryChips}>
                        {dashboard.categoryTrends.map((trend, index) => (
                            <Pressable
                                key={trend.category}
                                onPress={() => setCategoryIndex(index)}
                                style={({ pressed }) => [
                                    styles.categoryChip,
                                    categoryIndex === index && styles.categoryChipActive,
                                    pressed && styles.pressed,
                                ]}
                                accessibilityRole="tab"
                                accessibilityLabel={`類別 ${trend.category}`}
                                accessibilityState={{ selected: categoryIndex === index }}
                            >
                                <Text
                                    style={[
                                        styles.categoryChipText,
                                        categoryIndex === index && styles.categoryChipTextActive,
                                    ]}
                                    numberOfLines={1}
                                >
                                    {trend.category}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                    <View style={[styles.chartCard, SHADOWS.sm]}>
                        <Text style={styles.cardTitle}>
                            {dashboard.categoryTrends[categoryIndex]?.category}
                        </Text>
                        <LineChart
                            data={(dashboard.categoryTrends[categoryIndex]?.points ?? []).map((point) => ({
                                value: point.amount,
                                label: monthShort(point.monthKey),
                            }))}
                            width={chartWidth}
                            height={160}
                            spacing={Math.max(34, chartWidth / 11)}
                            initialSpacing={10}
                            endSpacing={12}
                            areaChart
                            curved
                            color={colors.primary}
                            startFillColor={colors.primary}
                            endFillColor={colors.primary}
                            startOpacity={0.18}
                            endOpacity={0.01}
                            thickness={2}
                            hideDataPoints
                            noOfSections={4}
                            rulesColor={colors.divider}
                            yAxisThickness={0}
                            xAxisThickness={0}
                            yAxisTextStyle={styles.chartAxis}
                            xAxisLabelTextStyle={styles.chartAxis}
                            formatYLabel={(value) => compactMoney(Number(value))}
                        />
                    </View>
                </>
            ) : null}

            {metric === 'category' && dashboard.categoryTrends.length === 0 ? (
                <EmptyState icon="analytics-outline" title="尚無類別趨勢資料" />
            ) : null}
        </>
    );
});

const AlertsTab = memo(function AlertsTab({
    dashboard,
    colors,
    styles,
}: {
    dashboard: ReturnType<typeof buildHealthDashboard>;
    colors: AppColors;
    styles: HealthStyles;
}) {
    return (
        <>
            <SectionHeader title={`規則提醒 ${dashboard.insights.length ? `(${dashboard.insights.length})` : ''}`} style={styles.sectionFirst} />
            {dashboard.insights.length > 0 ? dashboard.insights.map((item) => (
                <View key={item.id} style={styles.mb10}>
                    <HealthCheckCard
                        variant={insightVariant(item.severity)}
                        title={item.title}
                        description={item.detail}
                    />
                </View>
            )) : (
                <HealthCheckCard
                    variant="success"
                    title="目前沒有規則警示"
                    description="超支、負現金流與跨月異常皆未觸發"
                />
            )}

            <SectionHeader title="固定扣款" style={styles.section} />
            {dashboard.recurring.length > 0 ? (
                <View style={[styles.card, SHADOWS.sm]}>
                    {dashboard.recurring.slice(0, 12).map((item, index) => (
                        <View key={`${item.merchant}-${item.amount}-${index}`} style={[styles.valueRow, index > 0 && styles.divider]}>
                            <View style={styles.flex}>
                                <Text style={styles.structureName} numberOfLines={1}>{item.merchant}</Text>
                                <Text style={styles.structureMeta}>
                                    每 {item.intervalDays} 天 · 下次 {item.nextDate}
                                </Text>
                            </View>
                            <Text style={styles.rowValue}>{money(item.amount)}</Text>
                        </View>
                    ))}
                </View>
            ) : (
                <EmptyState
                    icon="repeat-outline"
                    title="尚未偵測到固定扣款"
                    description="需至少 3 筆相近金額、週期穩定的同商家支出"
                />
            )}

            <SectionHeader title="45 天內即將付款" style={styles.section} />
            {dashboard.upcoming.length > 0 ? (
                <View style={[styles.card, SHADOWS.sm]}>
                    {dashboard.upcoming.map((item, index) => (
                        <View key={`${item.date}-${item.merchant}`} style={[styles.valueRow, index > 0 && styles.divider]}>
                            <View style={styles.flex}>
                                <Text style={styles.structureName}>{item.merchant}</Text>
                                <Text style={styles.structureMeta}>{item.date}</Text>
                            </View>
                            <Text style={[styles.rowValue, { color: colors.red }]}>{money(item.amount)}</Text>
                        </View>
                    ))}
                </View>
            ) : (
                <EmptyState icon="calendar-outline" title="45 天內無預估扣款" />
            )}
        </>
    );
});

function BarList({ items, styles }: { items: { label: string; amount: number }[]; styles: HealthStyles }) {
    const max = Math.max(1, ...items.map((item) => item.amount));
    return (
        <View style={[styles.card, SHADOWS.sm]}>
            {items.map((item) => (
                <View key={item.label} style={styles.barRow}>
                    <Text style={styles.barLabel}>{item.label}</Text>
                    <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${(item.amount / max) * 100}%` }]} />
                    </View>
                    <Text style={styles.barAmount}>{compactMoney(item.amount)}</Text>
                </View>
            ))}
        </View>
    );
}

function ReportRow({
    label,
    value,
    delta,
    colors,
    styles,
    invert = false,
}: {
    label: string;
    value: string;
    delta: number | null;
    colors: AppColors;
    styles: HealthStyles;
    invert?: boolean;
}) {
    const positive = (delta ?? 0) > 0;
    const deltaColor = delta === null
        ? colors.textMuted
        : invert
            ? (positive ? colors.red : colors.green)
            : (positive ? colors.green : colors.red);
    return (
        <View style={styles.reportRow}>
            <Text style={styles.reportLabel}>{label}</Text>
            <View style={styles.reportValueWrap}>
                <Text style={styles.reportValue}>{value}</Text>
                <Text style={[styles.reportDelta, { color: deltaColor }]}>
                    {deltaLabel(delta)}
                </Text>
            </View>
        </View>
    );
}

function AchievementRow({
    item,
    colors,
    styles,
}: {
    item: Achievement;
    colors: AppColors;
    styles: HealthStyles;
}) {
    return (
        <View style={styles.achievement}>
            <Ionicons name="trophy" size={20} color={colors.yellow} />
            <View style={styles.achievementCopy}>
                <Text style={styles.achievementTitle}>{item.title}</Text>
                <Text style={styles.achievementDetail}>{item.detail}</Text>
            </View>
        </View>
    );
}

function Stat({ label, value, styles }: { label: string; value: string; styles: HealthStyles }) {
    return (
        <View style={styles.stat}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
        </View>
    );
}

function insightVariant(severity: HealthInsight['severity']) {
    if (severity === 'danger') return 'red' as const;
    if (severity === 'warning') return 'yellow' as const;
    return 'new' as const;
}

const createStyles = (
    colors: AppColors,
    typography: ReturnType<typeof useAppTheme>['typography']
) => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    chrome: { paddingTop: 8, paddingBottom: 12 },
    headerBack: {
        minWidth: 72,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    headerBackText: { fontSize: 15, color: colors.textPrimary, marginLeft: 2 },
    pressed: { opacity: 0.55 },
    filterSummary: {
        alignSelf: 'stretch',
        width: '100%',
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        paddingVertical: 4,
    },
    filterSummaryIcon: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 17,
        backgroundColor: colors.primaryContainer,
        flexShrink: 0,
    },
    filterSummaryCopy: { flex: 1, minWidth: 0, marginHorizontal: 10, gap: 2 },
    filterSummaryTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
    filterSummarySub: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
    filterActionWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
    filterAction: { fontSize: 13, fontWeight: '700', color: colors.primary },
    tabs: { marginTop: 10, alignSelf: 'stretch', width: '100%' },
    content: { padding: 16, paddingBottom: 28 },
    bottomSpace: { height: 28 },
    modalDismiss: { flex: 1, width: '100%' },
    sheetContent: { backgroundColor: colors.surfaceContainer },
    sheetSection: { paddingHorizontal: 20, paddingTop: 18 },
    sheetLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
    sheetHelper: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: 10 },
    sectionFirst: { marginTop: 0, marginBottom: 12 },
    section: { marginTop: 16, marginBottom: 12 },
    mb10: { marginBottom: 10 },
    flex: { flex: 1, marginRight: 12 },
    scoreCard: {
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        ...withContinuousRadius(RADIUS.lg),
        padding: 18,
        marginBottom: 12,
    },
    scoreHero: { flexDirection: 'row', alignItems: 'center' },
    eyebrow: { ...typography.caption, color: colors.textSecondary },
    scoreValue: { fontSize: 54, fontWeight: '800', lineHeight: 62, letterSpacing: -1, fontVariant: ['tabular-nums'] },
    scoreCopy: { flex: 1, marginLeft: 18 },
    scoreStatus: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
    scoreSummary: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
    breakdownList: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', minHeight: 26 },
    breakdownLabel: { width: 64, fontSize: 12, color: colors.textSecondary },
    breakdownPoints: { width: 42, textAlign: 'right', fontSize: 11, color: colors.textMuted },
    expandButton: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
    },
    expandButtonText: { fontSize: 12, fontWeight: '600', color: colors.primary, marginRight: 4 },
    listExpandButton: {
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
    },
    barTrack: {
        flex: 1,
        height: 7,
        marginHorizontal: 8,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: colors.divider,
    },
    barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    kpiCard: {
        width: '48.5%',
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        ...withContinuousRadius(RADIUS.md),
        padding: 13,
        marginBottom: 10,
    },
    kpiLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 5 },
    kpiValue: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    overviewKpiRow: {
        flexDirection: 'row',
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        borderRadius: RADIUS.md,
        marginBottom: 10,
        paddingVertical: 10,
    },
    overviewKpiCell: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        paddingHorizontal: 3,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: colors.divider,
    },
    overviewKpiValue: { width: '100%', textAlign: 'center', fontSize: 14, fontWeight: '700' },
    insightStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primaryContainer,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        borderRadius: RADIUS.md,
        padding: 13,
    },
    insightCopy: { flex: 1, marginLeft: 10 },
    insightTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    insightSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
    link: { fontSize: 13, fontWeight: '600', color: colors.primary },
    card: {
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        ...withContinuousRadius(RADIUS.md),
        paddingHorizontal: 14,
        paddingVertical: 3,
    },
    reportRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
    },
    reportLabel: { fontSize: 14, color: colors.textSecondary },
    reportValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    reportValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    reportDelta: { width: 46, textAlign: 'right', fontSize: 12, fontWeight: '600' },
    chartCard: {
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        ...withContinuousRadius(RADIUS.md),
        paddingHorizontal: 10,
        paddingTop: 12,
        paddingBottom: 8,
        overflow: 'hidden',
    },
    chartAxis: { color: colors.textMuted, fontSize: 9 },
    chartLoading: {
        minHeight: 220,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        borderRadius: RADIUS.md,
    },
    chartLoadingTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 10 },
    chartLoadingSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
    metricSelector: { marginBottom: 10 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginHorizontal: 6, marginBottom: 6 },
    categoryChips: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    categoryChip: {
        flex: 1,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        borderRadius: RADIUS.sm,
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
    },
    categoryChipActive: { backgroundColor: colors.primaryContainer, borderColor: colors.outlineVariant },
    categoryChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    categoryChipTextActive: { color: colors.primary },
    valueRow: {
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
    rowLabel: { fontSize: 14, color: colors.textSecondary },
    rowValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    structureRow: { paddingVertical: 11 },
    structureHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    structureName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    structureAmount: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    structureMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
    structureTrack: {
        flex: 1,
        height: 6,
        backgroundColor: colors.divider,
        borderRadius: 3,
        overflow: 'hidden',
        marginRight: 10,
    },
    structureFill: { height: '100%', maxWidth: '100%', backgroundColor: colors.primary, borderRadius: 3 },
    structureMeta: { minWidth: 105, textAlign: 'right', fontSize: 10, color: colors.textMuted },
    barRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center' },
    barLabel: { width: 62, fontSize: 11, color: colors.textSecondary },
    barAmount: { width: 48, textAlign: 'right', fontSize: 11, fontWeight: '600', color: colors.textPrimary },
    statRow: { flexDirection: 'row', marginBottom: 14 },
    stat: { flex: 1, alignItems: 'center' },
    statLabel: { fontSize: 10, color: colors.textMuted, marginBottom: 3 },
    statValue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    achievement: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.yellowLight,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        borderRadius: RADIUS.md,
        padding: 13,
        marginBottom: 8,
    },
    achievementCopy: { flex: 1, marginLeft: 10 },
    achievementTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    achievementDetail: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
