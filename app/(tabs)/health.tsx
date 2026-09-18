import React, { memo, useCallback, useMemo, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, LineChartBicolor } from 'react-native-gifted-charts';
import { useIsFocused } from 'expo-router/react-navigation';
import { useFinanceRecords, useFinanceSettings } from '../../context/FinanceContext';
import { useAppTheme } from '../../context/ThemeContext';
import { useFocusedMemo } from '../../hooks/useFocusedMemo';
import { useIdleReady } from '../../hooks/useIdleReady';
import AppPressable from '../../components/ui/AppPressable';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import {
    HEALTH_SCORE_WEIGHTS,
    shiftMonth,
    type HealthInsight,
} from '../../services/financialHealthService';
import { buildHealthScreenData, type HealthDashboard } from '../../viewModels/healthViewModel';
import {
    buildCashFlowSplitDrilldown,
    buildCategoryDrilldown,
    buildInsightDrilldown,
    buildKpiDrilldown,
    buildMerchantMonthDrilldown,
    buildScoreDrilldown,
    type HealthDrilldownResult,
} from '../../viewModels/healthDrilldown';
import { PROJECT_DEFINITIONS } from '../../services/projectDefinitions';
import PageChrome from '../../components/layout/PageChrome';
import UnifiedDateNavigator from '../../components/layout/UnifiedDateNavigator';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SectionHeader from '../../components/ui/SectionHeader';
import EmptyState from '../../components/ui/EmptyState';
import CompactSummaryBar from '../../components/ui/CompactSummaryBar';
import AccentListCard from '../../components/ui/AccentListCard';
import HealthCheckCard from '../../components/budget/HealthCheckCard';
import CashflowSankeyChart from '../../components/health/CashflowSankeyChart';
import DetailModal from '../../components/DetailModal';
import Animated, { FadeInDown } from 'react-native-reanimated';

type DetailView = 'structure' | 'trends' | 'alerts' | null;
type AccountViewType = 'all' | 'personal' | 'shared';
type HealthMode = 'daily' | 'all';
type HealthStyles = ReturnType<typeof createStyles>;

const SCORE_PARTS = [
    ['生活結餘', 'livingSurplus', HEALTH_SCORE_WEIGHTS.livingSurplus],
    ['支出波動', 'stability', HEALTH_SCORE_WEIGHTS.stability],
    ['預算暴衝', 'spendControl', HEALTH_SCORE_WEIGHTS.spendControl],
    ['住房固定', 'housingBurden', HEALTH_SCORE_WEIGHTS.housingBurden],
    ['投資投入', 'investmentHabit', HEALTH_SCORE_WEIGHTS.investmentHabit],
] as const;

const DAILY_EXCLUDED_PROJECTS = PROJECT_DEFINITIONS
    .filter((item) => item.owner === 'capital' || item.owner === 'event')
    .map((item) => item.name);

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
    const { width } = useWindowDimensions();
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { records } = useFinanceRecords();
    const { budgets, budgetConfig, personalAccounts, sharedAccounts } = useFinanceSettings();
    const isFocused = useIsFocused();
    const [targetMonth, setTargetMonth] = useState(() => new Date());
    const [detailView, setDetailView] = useState<DetailView>(null);
    const [accountViewType, setAccountViewType] = useState<AccountViewType>('all');
    const [healthMode, setHealthMode] = useState<HealthMode>('daily');
    const [drilldown, setDrilldown] = useState<HealthDrilldownResult | null>(null);

    const screenData = useFocusedMemo(
        isFocused,
        () => buildHealthScreenData({
            accountViewType,
            personalAccounts,
            sharedAccounts,
            isSplitShared: !!budgetConfig.isSplitEnabled,
            dailyOnly: healthMode === 'daily',
            excludedDailyProjects: DAILY_EXCLUDED_PROJECTS,
            records,
            targetMonth,
            budgetConfig,
            budgets,
            isFocused: true,
            previousDashboard: null,
        }),
        [
            accountViewType,
            personalAccounts,
            sharedAccounts,
            budgetConfig,
            healthMode,
            records,
            targetMonth,
            budgets,
        ],
    );
    const dashboard = screenData.dashboard;
    const scopedRows = screenData.scopedRows;
    const accountScopedRows = screenData.accountScopedRows;

    const chartWidth = Math.max(240, width - 32 - 20);
    const monthLabel = `${targetMonth.getFullYear()}年${targetMonth.getMonth() + 1}月`;
    const onPrev = useCallback(() => setTargetMonth((date) => shiftMonth(date, -1)), []);
    const onNext = useCallback(() => setTargetMonth((date) => shiftMonth(date, 1)), []);
    const openDetail = useCallback((view: Exclude<DetailView, null>) => setDetailView(view), []);
    const closeDetail = useCallback(() => setDetailView(null), []);
    const openDrilldown = useCallback((next: HealthDrilldownResult) => setDrilldown(next), []);
    const closeDrilldown = useCallback(() => setDrilldown(null), []);

    const openScoreDrilldown = useCallback((scoreKey: keyof typeof dashboard.health.breakdown) => {
        const rows = scoreKey === 'housingBurden' ? accountScopedRows : scopedRows;
        openDrilldown(buildScoreDrilldown({
            scoreKey,
            score: dashboard.health.breakdown[scoreKey],
            rows,
            targetMonth,
            budgetConfig,
            budgets,
        }));
    }, [accountScopedRows, budgetConfig, budgets, dashboard.health.breakdown, openDrilldown, scopedRows, targetMonth]);

    const openInsightDrilldown = useCallback((insight: HealthInsight) => {
        const rows = insight.id === 'high-housing-burden' ? accountScopedRows : scopedRows;
        openDrilldown(buildInsightDrilldown({
            insight,
            rows,
            targetMonth,
            budgetConfig,
        }));
    }, [accountScopedRows, budgetConfig, openDrilldown, scopedRows, targetMonth]);

    const openKpiDrilldown = useCallback((kind: 'income' | 'expense' | 'net') => {
        openDrilldown(buildKpiDrilldown({ kind, rows: scopedRows, targetMonth }));
    }, [openDrilldown, scopedRows, targetMonth]);

    const openCategoryDrilldown = useCallback((category: string) => {
        openDrilldown(buildCategoryDrilldown({ category, rows: scopedRows, targetMonth }));
    }, [openDrilldown, scopedRows, targetMonth]);

    const openSplitDrilldown = useCallback((
        kind: 'livingIncome' | 'livingExpense' | 'investmentIncome' | 'investmentExpense',
    ) => {
        openDrilldown(buildCashFlowSplitDrilldown({ kind, rows: scopedRows, targetMonth }));
    }, [openDrilldown, scopedRows, targetMonth]);

    const openMerchantDrilldown = useCallback((merchant: string, title?: string) => {
        openDrilldown(buildMerchantMonthDrilldown({
            merchant,
            rows: scopedRows,
            targetMonth,
            title,
        }));
    }, [openDrilldown, scopedRows, targetMonth]);

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

    const chartsReady = useIdleReady(isFocused && !dashboard.health.insufficientData);

    const detailTitle =
        detailView === 'structure' ? '收入 / 支出流向'
            : detailView === 'trends' ? '趨勢'
                : detailView === 'alerts' ? '提醒'
                    : '';

    return (
        <View style={styles.root}>
            <PageChrome>
                <UnifiedDateNavigator
                    dateLabel={monthLabel}
                    subLabel={healthMode === 'daily' ? '日常健檢' : '含所有專案'}
                    onPrev={onPrev}
                    onNext={onNext}
                    onCenterPress={() => setTargetMonth(new Date())}
                />
            </PageChrome>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.filterSection}>
                    <Text style={styles.controlLabel}>帳戶</Text>
                    <SegmentedControl
                        options={[
                            { value: 'all', label: '全部', icon: 'apps-outline' },
                            { value: 'personal', label: '個人', icon: 'person-outline' },
                            { value: 'shared', label: '共享', icon: 'people-outline' },
                        ]}
                        value={accountViewType}
                        onChange={setAccountViewType}
                        variant="filter"
                        accessibilityLabel="帳戶範圍"
                    />
                </View>
                <View style={styles.filterSection}>
                    <Text style={styles.controlLabel}>口徑</Text>
                    <SegmentedControl
                        options={[
                            { value: 'daily', label: '日常', icon: 'leaf-outline' },
                            { value: 'all', label: '含專案', icon: 'briefcase-outline' },
                        ]}
                        value={healthMode}
                        onChange={setHealthMode}
                        variant="filter"
                        accessibilityLabel="健檢分析口徑"
                    />
                </View>

                {detailView ? (
                    <View style={styles.detailHeader}>
                        <AppPressable
                            onPress={closeDetail}
                            style={styles.detailBackBtn}
                            pressedStyle={styles.pressed}
                            haptic="light"
                            accessibilityRole="button"
                            accessibilityLabel="返回健檢總覽"
                            hitSlop={8}
                        >
                            <Ionicons name="chevron-back" size={20} color={colors.primary} />
                            <Text style={styles.detailBackText}>返回</Text>
                        </AppPressable>
                        <Text style={styles.detailHeaderTitle} numberOfLines={1}>{detailTitle}</Text>
                        <View style={styles.detailHeaderSide} />
                    </View>
                ) : null}

                {dashboard.health.insufficientData ? (
                    <EmptyState
                        icon="heart-outline"
                        title="這個範圍尚無收支資料"
                        description="切換月份、帳戶範圍或改看「含專案」"
                    />
                ) : null}

                {!detailView && !dashboard.health.insufficientData ? (
                    <OverviewTab
                        dashboard={dashboard}
                        scoreSummary={scoreSummary}
                        scoreColor={scoreColor}
                        colors={colors}
                        styles={styles}
                        onShowAlerts={() => openDetail('alerts')}
                        onShowStructure={() => openDetail('structure')}
                        onShowTrends={() => openDetail('trends')}
                        onOpenScore={openScoreDrilldown}
                        onOpenKpi={openKpiDrilldown}
                    />
                ) : null}

                {detailView === 'structure' && !dashboard.health.insufficientData ? (
                    <StructureTab
                        dashboard={dashboard}
                        colors={colors}
                        styles={styles}
                        onOpenCategory={openCategoryDrilldown}
                        onOpenSplit={openSplitDrilldown}
                    />
                ) : null}

                {detailView === 'trends' && !dashboard.health.insufficientData ? (
                    <TrendsTab
                        dashboard={dashboard}
                        chartWidth={chartWidth}
                        colors={colors}
                        styles={styles}
                        chartsReady={chartsReady}
                    />
                ) : null}

                {detailView === 'alerts' && !dashboard.health.insufficientData ? (
                    <AlertsTab
                        dashboard={dashboard}
                        colors={colors}
                        styles={styles}
                        onOpenInsight={openInsightDrilldown}
                        onOpenMerchant={openMerchantDrilldown}
                    />
                ) : null}
            </ScrollView>

            {drilldown ? (
                <DetailModal
                    visible
                    title={drilldown.title}
                    subtitle={drilldown.subtitle}
                    records={drilldown.records}
                    onClose={closeDrilldown}
                />
            ) : null}
        </View>
    );
}

const OverviewTab = memo(function OverviewTab({
    dashboard,
    scoreSummary,
    scoreColor,
    colors,
    styles,
    onShowAlerts,
    onShowStructure,
    onShowTrends,
    onOpenScore,
    onOpenKpi,
}: {
    dashboard: HealthDashboard;
    scoreSummary: string;
    scoreColor: (score: number | null) => string;
    colors: AppColors;
    styles: HealthStyles;
    onShowAlerts: () => void;
    onShowStructure: () => void;
    onShowTrends: () => void;
    onOpenScore: (key: keyof typeof dashboard.health.breakdown) => void;
    onOpenKpi: (kind: 'income' | 'expense' | 'net') => void;
}) {
    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const alertCount = dashboard.insights.length;
    const expenseRatio = dashboard.cashflowSankey.expenseRatio;
    const flowInsight = expenseRatio === null
        ? '點進去看流向結構'
        : expenseRatio > 100
            ? `支出超出收入 ${Math.round(expenseRatio - 100)}%`
            : `支出佔收入 ${Math.round(expenseRatio)}%`;
    const scoreStatus =
        (dashboard.health.score ?? 0) >= 75
            ? '狀況良好'
            : (dashboard.health.score ?? 0) >= 50
                ? '仍可改善'
                : '需要留意';

    return (
        <>
            <Animated.View entering={FadeInDown.duration(380).springify()} style={styles.summaryCard}>
                <AppPressable
                    onPress={() => setDetailsExpanded((value) => !value)}
                    pressScale={1}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: detailsExpanded }}
                    accessibilityLabel={`財務健康分數 ${dashboard.health.score ?? '無資料'}，${scoreStatus}`}
                >
                    <Text style={styles.eyebrow}>財務健康分數</Text>
                    <View style={styles.scoreHero}>
                        <Text
                            style={[styles.scoreValue, { color: scoreColor(dashboard.health.score) }]}
                            selectable
                        >
                            {dashboard.health.score ?? '—'}
                        </Text>
                        <View style={styles.scoreCopy}>
                            <Text style={styles.scoreStatus}>{scoreStatus}</Text>
                            <Text style={styles.scoreSummary}>{scoreSummary}</Text>
                        </View>
                        <Ionicons
                            name={detailsExpanded ? 'chevron-up' : 'chevron-forward'}
                            size={18}
                            color={colors.primary}
                        />
                    </View>
                </AppPressable>

                {detailsExpanded ? (
                    <View style={styles.breakdownList}>
                        {SCORE_PARTS.map(([label, key, max]) => {
                            const value = dashboard.health.breakdown[key];
                            const ratio = value / max;
                            return (
                                <AppPressable
                                    key={key}
                                    onPress={() => onOpenScore(key)}
                                    style={styles.breakdownRow}
                                    pressedStyle={styles.pressed}
                                    haptic="light"
                                    accessibilityRole="button"
                                    accessibilityLabel={`查看${label}相關明細，${value}分滿分${max}`}
                                >
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
                                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                                </AppPressable>
                            );
                        })}
                    </View>
                ) : null}
            </Animated.View>

            <CompactSummaryBar
                compact
                style={styles.inlineSummary}
                items={[
                    {
                        label: '收入',
                        value: money(dashboard.health.kpi.income),
                        valueColor: colors.green,
                        onPress: () => onOpenKpi('income'),
                    },
                    {
                        label: '支出',
                        value: money(dashboard.health.kpi.expense),
                        valueColor: colors.red,
                        onPress: () => onOpenKpi('expense'),
                    },
                    {
                        label: '結餘',
                        value: money(dashboard.health.kpi.net),
                        valueColor: dashboard.health.kpi.net >= 0 ? colors.green : colors.red,
                        onPress: () => onOpenKpi('net'),
                    },
                ]}
            />

            <AccentListCard
                accentColor={colors.primary}
                title="收入 / 支出流向"
                titleBadge={<Ionicons name="chevron-forward" size={18} color={colors.primary} />}
                meta={[{ icon: 'git-branch-outline', text: flowInsight }]}
                onPress={onShowStructure}
                accessibilityLabel="查看收入支出流向"
            />
            <AccentListCard
                accentColor={colors.blue}
                title="近 12 月趨勢"
                titleBadge={<Ionicons name="chevron-forward" size={18} color={colors.blue} />}
                meta={[{ icon: 'analytics-outline', text: '儲蓄率 · 現金流 · 類別' }]}
                onPress={onShowTrends}
                accessibilityLabel="查看趨勢"
            />
            <AccentListCard
                accentColor={alertCount ? colors.yellow : colors.green}
                title="提醒與固定扣款"
                titleBadge={<Ionicons name="chevron-forward" size={18} color={alertCount ? colors.yellow : colors.green} />}
                meta={[{
                    icon: 'notifications-outline',
                    text: alertCount ? `${alertCount} 則提醒` : '目前沒有重大警示',
                }]}
                onPress={onShowAlerts}
                accessibilityLabel="查看提醒"
            />
        </>
    );
});

const StructureTab = memo(function StructureTab({
    dashboard,
    colors,
    styles,
    onOpenCategory,
    onOpenSplit,
}: {
    dashboard: HealthDashboard;
    colors: AppColors;
    styles: HealthStyles;
    onOpenCategory: (category: string) => void;
    onOpenSplit: (kind: 'livingIncome' | 'livingExpense' | 'investmentIncome' | 'investmentExpense') => void;
}) {
    const [showAllCategories, setShowAllCategories] = useState(false);
    const [showBehavior, setShowBehavior] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [splitExpanded, setSplitExpanded] = useState(false);
    const sankey = dashboard.cashflowSankey;
    const visibleStructure = showAllCategories
        ? dashboard.structure.slice(0, 8)
        : dashboard.structure.slice(0, 5);

    return (
        <>
            {sankey.income <= 0 && sankey.expense <= 0 ? (
                <EmptyState
                    icon="git-branch-outline"
                    title="尚無收支流向"
                    description="這個月此範圍沒有收入或支出"
                />
            ) : (
                <CashflowSankeyChart
                    data={sankey}
                    height={220}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={setSelectedNodeId}
                />
            )}

            <SectionHeader
                title="生活／投資"
                style={styles.sectionHeader}
                trailing={(
                    <AppPressable
                        onPress={() => setSplitExpanded((value) => !value)}
                        hitSlop={8}
                        haptic="light"
                        pressScale={1}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: splitExpanded }}
                        accessibilityLabel="展開或收合生活與投資現金流"
                    >
                        <Ionicons
                            name={splitExpanded ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={colors.primary}
                        />
                    </AppPressable>
                )}
            />
            {splitExpanded ? (
                <>
                    <Text style={styles.inlineHelper}>
                        依分類計算，不看專案欄（利息標正常開銷仍算投資收入）
                    </Text>
                    <View style={styles.panel}>
                        {([
                            ['生活收入', dashboard.cashFlowSplit.livingIncome, colors.green, 'livingIncome'],
                            ['生活支出', -dashboard.cashFlowSplit.livingExpense, colors.red, 'livingExpense'],
                            ['生活結餘', dashboard.cashFlowSplit.livingNet, dashboard.cashFlowSplit.livingNet >= 0 ? colors.green : colors.red, null],
                            ['投資收入', dashboard.cashFlowSplit.investmentIncome, colors.blue, 'investmentIncome'],
                            ['投資支出', -dashboard.cashFlowSplit.investmentExpense, colors.yellow, 'investmentExpense'],
                            ['投資結餘', dashboard.cashFlowSplit.investmentNet, dashboard.cashFlowSplit.investmentNet >= 0 ? colors.green : colors.red, null],
                        ] as const).map(([label, value, color, drillKind], index) => {
                            const row = (
                                <>
                                    <Text style={styles.rowLabel}>{label}</Text>
                                    <Text style={[styles.rowValue, { color: color as string }]}>{money(value as number)}</Text>
                                    {drillKind ? <Ionicons name="chevron-forward" size={14} color={colors.textMuted} /> : null}
                                </>
                            );
                            if (!drillKind) {
                                return (
                                    <View key={label} style={[styles.valueRow, index > 0 && styles.divider]}>
                                        {row}
                                    </View>
                                );
                            }
                            return (
                                <AppPressable
                                    key={label}
                                    onPress={() => onOpenSplit(drillKind)}
                                    style={[styles.valueRow, index > 0 && styles.divider]}
                                    pressedStyle={styles.pressed}
                                    haptic="light"
                                    accessibilityRole="button"
                                    accessibilityLabel={`查看${label}明細`}
                                >
                                    {row}
                                </AppPressable>
                            );
                        })}
                    </View>
                </>
            ) : null}

            <SectionHeader title="支出結構" style={styles.sectionHeader} />
            {visibleStructure.map((item) => (
                <AccentListCard
                    key={item.name}
                    title={item.name}
                    amount={money(item.amount)}
                    meta={[{
                        text: `${item.pct.toFixed(1)}% · ${item.deltaPct === null ? '首次' : `${deltaLabel(item.deltaPct)} vs 上月`}`,
                    }]}
                    titleBadge={<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                    onPress={() => onOpenCategory(item.name)}
                    accessibilityLabel={`查看${item.name}支出明細`}
                >
                    <View style={styles.structureTrackFull}>
                        <View style={[styles.structureFill, { width: `${Math.min(100, item.pct)}%` }]} />
                    </View>
                </AccentListCard>
            ))}
            {dashboard.structure.length > 5 ? (
                <AppPressable
                    onPress={() => setShowAllCategories((value) => !value)}
                    style={styles.listExpandButton}
                    pressedStyle={styles.pressed}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={showAllCategories ? '收合類別' : '顯示其餘類別'}
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
                </AppPressable>
            ) : null}

            <SectionHeader
                title="行為"
                style={styles.sectionHeader}
                trailing={(
                    <AppPressable
                        onPress={() => setShowBehavior((value) => !value)}
                        hitSlop={8}
                        haptic="light"
                        pressScale={1}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: showBehavior }}
                        accessibilityLabel="展開或收合消費行為"
                    >
                        <Ionicons
                            name={showBehavior ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={colors.primary}
                        />
                    </AppPressable>
                )}
            />
            {showBehavior ? (
                <>
                    <CompactSummaryBar
                        compact
                        style={styles.inlineSummary}
                        items={[
                            { label: '每日平均', value: money(dashboard.behavior.avgDaily) },
                            { label: '每筆平均', value: money(dashboard.behavior.avgTxn) },
                        ]}
                    />
                    <CompactSummaryBar
                        compact
                        style={styles.inlineSummary}
                        items={[
                            { label: '交易筆數', value: `${dashboard.behavior.txnCount} 筆` },
                            {
                                label: '最大消費日',
                                value: dashboard.behavior.maxSpendDay
                                    ? money(dashboard.behavior.maxSpendDay.amount)
                                    : '—',
                            },
                        ]}
                    />
                    <SectionHeader title="星期分布" style={styles.sectionHeader} />
                    <BarList items={dashboard.behavior.byWeekday} styles={styles} />
                    <SectionHeader title="月初／月中／月底" style={styles.sectionHeader} />
                    <BarList items={dashboard.behavior.byMonthThird} styles={styles} />
                </>
            ) : null}
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
    dashboard: HealthDashboard;
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
            <View style={styles.chartCard}>
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
            <View style={styles.chartCard}>
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
                            <AppPressable
                                key={trend.category}
                                onPress={() => setCategoryIndex(index)}
                                style={[
                                    styles.categoryChip,
                                    categoryIndex === index && styles.categoryChipActive,
                                ]}
                                pressedStyle={styles.pressed}
                                haptic="selection"
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
                            </AppPressable>
                        ))}
                    </View>
                    <View style={styles.chartCard}>
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
    onOpenInsight,
    onOpenMerchant,
}: {
    dashboard: HealthDashboard;
    colors: AppColors;
    styles: HealthStyles;
    onOpenInsight: (insight: HealthInsight) => void;
    onOpenMerchant: (merchant: string, title?: string) => void;
}) {
    const dangerCount = dashboard.insights.filter((item) => item.severity === 'danger').length;

    return (
        <>
            <CompactSummaryBar
                compact
                style={styles.inlineSummary}
                items={[
                    {
                        label: '警示',
                        value: `${dashboard.insights.length}`,
                        valueColor: dangerCount ? colors.red : undefined,
                    },
                    { label: '固定扣款', value: `${dashboard.recurring.length}` },
                    {
                        label: '即將付款',
                        value: `${dashboard.upcoming.length}`,
                        valueColor: dashboard.upcoming.length ? colors.yellow : undefined,
                    },
                ]}
            />

            <SectionHeader
                title={`規則提醒${dashboard.insights.length ? ` (${dashboard.insights.length})` : ''}`}
                style={styles.sectionHeader}
            />
            <View style={styles.cardStack}>
                {dashboard.insights.length > 0 ? dashboard.insights.map((item) => (
                    <HealthCheckCard
                        key={item.id}
                        variant={insightVariant(item.severity)}
                        title={item.title}
                        description={item.detail}
                        actionLabel="查看相關明細"
                        onPress={() => onOpenInsight(item)}
                    />
                )) : (
                    <HealthCheckCard
                        variant="success"
                        title="目前沒有規則警示"
                        description="超支、負現金流與跨月異常皆未觸發"
                    />
                )}
            </View>

            <SectionHeader title="固定扣款" style={styles.sectionHeader} />
            {dashboard.recurring.length > 0 ? (
                dashboard.recurring.slice(0, 12).map((item, index) => (
                    <AccentListCard
                        key={`${item.merchant}-${item.amount}-${index}`}
                        accentColor={colors.primary}
                        title={item.merchant}
                        amount={money(item.amount)}
                        meta={[{ icon: 'repeat-outline', text: `每 ${item.intervalDays} 天 · 下次 ${item.nextDate}` }]}
                        titleBadge={<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                        onPress={() => onOpenMerchant(item.merchant, `${item.merchant} 固定扣款`)}
                        accessibilityLabel={`查看${item.merchant}本月明細`}
                    />
                ))
            ) : (
                <EmptyState
                    icon="repeat-outline"
                    title="尚未偵測到固定扣款"
                    description="需至少 3 筆相近金額、週期穩定的同商家支出"
                />
            )}

            <SectionHeader title="45 天內即將付款" style={styles.sectionHeader} />
            {dashboard.upcoming.length > 0 ? (
                dashboard.upcoming.map((item) => (
                    <AccentListCard
                        key={`${item.date}-${item.merchant}`}
                        accentColor={colors.red}
                        title={item.merchant}
                        amount={money(item.amount)}
                        amountColor={colors.red}
                        meta={[{ icon: 'calendar-outline', text: item.date }]}
                        titleBadge={<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                        onPress={() => onOpenMerchant(item.merchant, `${item.merchant} 即將付款`)}
                        accessibilityLabel={`查看${item.merchant}本月明細`}
                    />
                ))
            ) : (
                <EmptyState icon="calendar-outline" title="45 天內無預估扣款" />
            )}
        </>
    );
});

function BarList({ items, styles }: { items: { label: string; amount: number }[]; styles: HealthStyles }) {
    const max = Math.max(1, ...items.map((item) => item.amount));
    return (
        <View style={styles.panel}>
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

const createStyles = (colors: AppColors) => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    pressed: { opacity: 0.55 },
    content: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        paddingBottom: 40,
        gap: 10,
    },
    filterSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 2,
    },
    controlLabel: {
        color: colors.onSurfaceVariant,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.6,
        minWidth: 28,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        marginTop: 4,
        marginBottom: 8,
    },
    detailBackBtn: {
        minWidth: 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingVertical: 6,
        paddingRight: 8,
    },
    detailBackText: { fontSize: 15, fontWeight: '600', color: colors.primary },
    detailHeaderTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    detailHeaderSide: { minWidth: 72 },
    sectionHeaderFirst: { marginTop: 4, marginBottom: 2 },
    sectionHeader: { marginTop: 14, marginBottom: 2 },
    inlineSummary: { marginHorizontal: 0, marginTop: 0, marginBottom: 8 },
    inlineHelper: {
        fontSize: 12,
        lineHeight: 18,
        color: colors.textMuted,
        marginBottom: 8,
    },
    cardStack: { gap: 10 },
    summaryCard: {
        backgroundColor: colors.surfaceContainer,
        ...withContinuousRadius(RADIUS.md),
        padding: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
        overflow: 'hidden',
    },
    scoreHero: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 12,
    },
    eyebrow: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    scoreValue: {
        fontSize: 44,
        fontWeight: '800',
        lineHeight: 48,
        letterSpacing: -1.5,
        fontVariant: ['tabular-nums'],
        minWidth: 72,
    },
    scoreCopy: { flex: 1, minWidth: 0 },
    scoreStatus: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
    scoreSummary: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
    breakdownList: {
        marginTop: 4,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
    },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', minHeight: 26 },
    breakdownLabel: { width: 72, fontSize: 12, color: colors.textSecondary },
    breakdownPoints: { width: 42, textAlign: 'right', fontSize: 11, color: colors.textMuted },
    expandButton: {
        alignSelf: 'flex-start',
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        paddingVertical: 4,
    },
    expandButtonText: { fontSize: 13, fontWeight: '600', color: colors.primary, marginRight: 2 },
    metricsBlock: {
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
    },
    metricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metricsRowDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.divider,
        marginVertical: 12,
    },
    metricItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
    metricLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    metricValue: {
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.3,
        fontVariant: ['tabular-nums'],
        width: '100%',
        textAlign: 'center',
    },
    metricDividerV: {
        width: StyleSheet.hairlineWidth,
        height: 36,
        backgroundColor: colors.divider,
        marginHorizontal: 8,
    },
    listExpandButton: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
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
    panel: {
        backgroundColor: colors.surfaceContainer,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
        ...withContinuousRadius(RADIUS.md),
        paddingHorizontal: 14,
        paddingVertical: 4,
        marginBottom: 4,
    },
    chartCard: {
        backgroundColor: colors.surfaceContainer,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
        ...withContinuousRadius(RADIUS.md),
        paddingHorizontal: 10,
        paddingTop: 12,
        paddingBottom: 8,
        overflow: 'hidden',
        marginBottom: 4,
    },
    chartAxis: { color: colors.textMuted, fontSize: 9 },
    chartLoading: {
        minHeight: 220,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainer,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
        ...withContinuousRadius(RADIUS.md),
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
        ...withContinuousRadius(RADIUS.sm),
        backgroundColor: colors.surfaceContainer,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
    },
    categoryChipActive: { backgroundColor: colors.primaryContainer, borderColor: colors.outlineVariant },
    categoryChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    categoryChipTextActive: { color: colors.primary },
    valueRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
    rowLabel: { flex: 1, minWidth: 0, fontSize: 14, color: colors.textSecondary, marginRight: 8 },
    rowValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
    structureTrackFull: {
        height: 6,
        backgroundColor: colors.divider,
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 2,
    },
    structureFill: { height: '100%', maxWidth: '100%', backgroundColor: colors.primary, borderRadius: 3 },
    barRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center' },
    barLabel: { width: 62, fontSize: 11, color: colors.textSecondary },
    barAmount: { width: 48, textAlign: 'right', fontSize: 11, fontWeight: '600', color: colors.textPrimary },
    statRow: { flexDirection: 'row', marginBottom: 14 },
    stat: { flex: 1, alignItems: 'center' },
    statLabel: { fontSize: 10, color: colors.textMuted, marginBottom: 3 },
    statValue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
});
