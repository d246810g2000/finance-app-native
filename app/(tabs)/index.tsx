
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Dimensions, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager, Modal, TouchableWithoutFeedback } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { BarChart, LineChartBicolor } from 'react-native-gifted-charts';
import Animated, { FadeInDown, FadeInLeft } from 'react-native-reanimated';
import { useFinance } from '../../context/FinanceContext';
import { processAndAggregateRecords, transformRecordsForExport, filterAndSortRecords } from '../../services/financeService';
import { PERSONAL_ACCOUNTS, SHARED_ACCOUNTS, ASSET_CLASSES, ASSET_CLASS_COLORS, getAssetClass } from '../../constants';
import { TrendDataPoint, AccountsSummaryMap, TransformedRecord } from '../../types';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import DateRangeSelector from '../../components/DateRangeSelector';
import DetailModal from '../../components/DetailModal';
import AccountDetailModal from '../../components/AccountDetailModal';
import SegmentedControl from '../../components/ui/SegmentedControl';
import IconCircle from '../../components/ui/IconCircle';
import ModalBackdrop from '../../components/ui/ModalBackdrop';
import EmptyState from '../../components/ui/EmptyState';
import SheetHeader from '../../components/ui/SheetHeader';
import PageChrome from '../../components/layout/PageChrome';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { loadExcludedAccounts, saveExcludedAccounts } from '../../services/accountConfigService';
import AccountSettingsModal from '../../components/account/AccountSettingsModal';
import { useBottomSheetSwipe } from '../../components/ui/useBottomSheetSwipe';
import BottomSheetGestureWrapper from '../../components/ui/BottomSheetGestureWrapper';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;

type AccountViewType = 'all' | 'personal' | 'shared';

// ─── Summary Card ───
type DashboardStyles = ReturnType<typeof createStyles>;

const SummaryCard = ({ title, value, previousValue, isPercentage, invertColor, onPress, index, fullWidth, colors, styles }: {
    title: string; value: number; previousValue: number;
    isPercentage?: boolean; invertColor?: boolean; onPress?: () => void; index?: number; fullWidth?: boolean;
    colors: AppColors; styles: DashboardStyles;
}) => {
    const diff = value - previousValue;
    const pctChange = previousValue !== 0
        ? ((diff / Math.abs(previousValue)) * 100).toFixed(1)
        : (diff > 0 ? '∞' : (diff < 0 ? '-∞' : '0'));
    const isPositive = diff > 0;
    const isNegative = diff < 0;
    let changeColor: string = colors.textMuted;
    if (invertColor) {
        if (isPositive) changeColor = colors.red;
        else if (isNegative) changeColor = colors.green;
    } else {
        if (isPositive) changeColor = colors.green;
        else if (isNegative) changeColor = colors.red;
    }
    const displayValue = isPercentage ? `${value.toFixed(1)}%` : `$${Math.round(value).toLocaleString()}`;
    const arrow = isPositive ? '↑' : isNegative ? '↓' : '−';
    const iconMap: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
        '資產': 'diamond-outline', '收入': 'trending-up', '支出': 'trending-down',
        '儲蓄率': 'flag-outline', '日均消費': 'cafe-outline',
    };
    const accentMap: Record<string, string> = {
        '資產': colors.accent, '收入': colors.green, '支出': colors.red,
        '儲蓄率': colors.blue, '日均消費': colors.yellow,
    };

    return (
        <Animated.View entering={FadeInDown.delay((index || 0) * 80).springify()} style={[styles.summaryCardContainer, fullWidth ? { width: '100%' } : { width: '48%' }]}>
            <Pressable
                disabled={!onPress}
                onPress={onPress}
                style={({ pressed }) => [
                    styles.summaryCardWrapper,
                    pressed && onPress ? { opacity: 0.85, transform: [{ scale: 0.96 }], ...SHADOWS.hover } : { ...SHADOWS.md },
                ]}
            >
                <View style={[styles.summaryCardInner, { borderColor: colors.cardBorder }]}>
                    <View style={[styles.summaryAccentStrip, { backgroundColor: accentMap[title] || colors.accent }]} />
                    <View style={styles.summaryCardBody}>
                        <View style={styles.summaryCardHeader}>
                            <IconCircle
                                name={iconMap[title] || 'stats-chart-outline'}
                                color={accentMap[title] || colors.accent}
                                size={32}
                                iconSize={16}
                            />
                            <Text style={styles.summaryCardTitle}>{title}</Text>
                        </View>
                        <Text style={styles.summaryCardValue} numberOfLines={1} adjustsFontSizeToFit>
                            {displayValue}
                        </Text>
                        {!isNaN(previousValue) ? (
                            <View style={styles.summaryCardChange}>
                                <Text style={[styles.summaryCardChangeText, { color: changeColor }]}>
                                    {arrow} {isPercentage ? `${Math.abs(diff).toFixed(1)}%` : `${pctChange}%`}
                                </Text>
                                <Text style={styles.summaryCardChangeLabel}> vs 上期</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </Pressable>
        </Animated.View>
    );
};

export default function DashboardScreen() {
    const { records } = useFinance();
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const navigation = useNavigation();
    const [accountViewType, setAccountViewType] = useState<AccountViewType>('personal');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(Object.keys(ASSET_CLASSES)));
    const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});
    const [showRatioView, setShowRatioView] = useState(false);

    const [excludedAccounts, setExcludedAccounts] = useState<string[]>([]);
    const [isAccountSettingsVisible, setIsAccountSettingsVisible] = useState(false);

    React.useEffect(() => {
        loadExcludedAccounts().then(setExcludedAccounts);
    }, []);

    const handleSaveExcludedAccounts = (newExclusions: string[]) => {
        setExcludedAccounts(newExclusions);
        saveExcludedAccounts(newExclusions);
    };

    React.useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Pressable
                    onPress={() => setIsAccountSettingsVisible(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => [{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.5 }]}
                    accessibilityRole="button"
                    accessibilityLabel="帳戶顯示設定"
                >
                    <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
                </Pressable>
            ),
        });
    }, [navigation, colors.textSecondary]);

    const toggleGroup = useCallback((groupName: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) {
                next.delete(groupName);
            } else {
                next.add(groupName);
            }
            return next;
        });
    }, []);

    const toggleSubGroup = useCallback((subGroupId: string) => {
        setExpandedSubGroups(prev => ({
            ...prev,
            [subGroupId]: !prev[subGroupId]
        }));
    }, []);

    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d;
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date(); d.setHours(23, 59, 59, 999); return d;
    });

    const [detailModal, setDetailModal] = useState<{
        visible: boolean; title: string; data: TransformedRecord[];
    }>({ visible: false, title: '', data: [] });

    const [accountDetailModal, setAccountDetailModal] = useState<{
        visible: boolean; accountName: string;
    }>({ visible: false, accountName: '' });

    const accountFilter = useMemo(() => {
        if (accountViewType === 'personal') return PERSONAL_ACCOUNTS;
        if (accountViewType === 'shared') return SHARED_ACCOUNTS;
        return null;
    }, [accountViewType]);

    const durationInDays = useMemo(() => {
        const diffTime = new Date(endDate).getTime() - new Date(startDate).getTime();
        return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }, [startDate, endDate]);

    const { aggregatedSummary, dailyTrend, periodSummary, previousPeriodSummary } = useMemo(() => {
        if (records.length === 0) return {
            aggregatedSummary: {} as AccountsSummaryMap,
            dailyTrend: [] as TrendDataPoint[],
            periodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 },
            previousPeriodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 },
        };
        return processAndAggregateRecords(records, startDate, endDate, accountFilter, excludedAccounts);
    }, [records, startDate, endDate, accountFilter, excludedAccounts]);

    const currentSavingsRate = periodSummary.totalIncome > 0
        ? ((periodSummary.totalIncome - periodSummary.totalExpense) / periodSummary.totalIncome) * 100 : 0;
    const prevSavingsRate = previousPeriodSummary.totalIncome > 0
        ? ((previousPeriodSummary.totalIncome - previousPeriodSummary.totalExpense) / previousPeriodSummary.totalIncome) * 100 : 0;

    const handleDateChange = useCallback((start: Date, end: Date) => {
        setStartDate(start);
        setEndDate(end);
    }, []);

    const handleSummaryCardClick = useCallback((type: 'income' | 'expense') => {
        const recordsInPeriod = filterAndSortRecords(records, startDate, endDate);
        const filteredRaw = recordsInPeriod.filter(row => {
            const isIncomeAcc = row['收款(轉入)'] && (!accountFilter || accountFilter.includes(row['收款(轉入)']));
            const isExpenseAcc = row['付款(轉出)'] && (!accountFilter || accountFilter.includes(row['付款(轉出)']));
            let isIncome = isIncomeAcc && !isExpenseAcc;
            let isExpense = isExpenseAcc && !isIncomeAcc;
            if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) return false;
            if (row['分類'] === '轉帳') {
                if (!(row['子分類'] === '小伊轉帳' && isIncome)) return false;
            }
            return type === 'income' ? isIncome : isExpense;
        });
        const transformed = transformRecordsForExport(filteredRaw);
        setDetailModal({ visible: true, title: `${type === 'income' ? '收入' : '支出'}明細`, data: transformed });
    }, [records, startDate, endDate, accountFilter]);

    const handleAccountClick = useCallback((accountName: string) => {
        setAccountDetailModal({ visible: true, accountName });
    }, []);

    const [savingsModalVisible, setSavingsModalVisible] = useState(false);
    const [balanceModalVisible, setBalanceModalVisible] = useState(false);
    const balanceSwipe = useBottomSheetSwipe(() => setBalanceModalVisible(false), balanceModalVisible);
    const savingsSwipe = useBottomSheetSwipe(() => setSavingsModalVisible(false), savingsModalVisible);

    // Calculate 12 periods of history for Savings Rate & Asset Trend modals
    const past12PeriodsData = useMemo(() => {
        if (!savingsModalVisible && !balanceModalVisible) return [];

        const results = [];
        const baseEnd = new Date(endDate);
        const baseStart = new Date(startDate);
        const ONE_DAY = 1000 * 60 * 60 * 24;
        const durationMs = (durationInDays || 1) * ONE_DAY;

        let runningBalance = periodSummary.totalBalance;

        for (let i = 0; i < 12; i++) {
            const pStart = new Date(baseStart.getTime() - (i * durationMs));
            const pEnd = new Date(baseEnd.getTime() - (i * durationMs));

            let mInc = 0;
            let mExp = 0;

            const recordsInM = filterAndSortRecords(records, pStart, pEnd);
            recordsInM.forEach(row => {
                const amountStr = (row['金額'] || '').replace(/[,￥$€£]/g, '').trim();
                let amount = Math.abs(parseFloat(amountStr) || 0);

                const isIncomeAcc = row['收款(轉入)'] && (!accountFilter || accountFilter.includes(row['收款(轉入)']));
                const isExpenseAcc = row['付款(轉出)'] && (!accountFilter || accountFilter.includes(row['付款(轉出)']));
                let isIncome = isIncomeAcc && !isExpenseAcc;
                let isExpense = isExpenseAcc && !isIncomeAcc;

                if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付') || row['分類'] === 'SYSTEM') {
                    isIncome = false;
                    isExpense = false;
                } else if (row['分類'] === '轉帳') {
                    if (!(row['子分類'] === '小伊轉帳' && isIncome)) {
                        isIncome = false;
                        isExpense = false;
                    }
                }

                if (isIncome) mInc += amount;
                if (isExpense) mExp += amount;
            });

            const mRate = mInc > 0 ? ((mInc - mExp) / mInc) * 100 : 0;
            const net = mInc - mExp;

            let mLabel = '';
            let shortLabel = '';
            if (durationInDays <= 31) {
                mLabel = `${pStart.getMonth() + 1}/${pStart.getDate()} - ${pEnd.getMonth() + 1}/${pEnd.getDate()}`;
                shortLabel = `${pStart.getMonth() + 1}/${pStart.getDate()}`;
            } else if (durationInDays <= 92) {
                mLabel = `${pStart.getFullYear()}/${pStart.getMonth() + 1} - ${pEnd.getFullYear()}/${pEnd.getMonth() + 1}`;
                shortLabel = `${pStart.getMonth() + 1}/${pEnd.getMonth() + 1}`;
            } else {
                mLabel = `${pStart.getFullYear()}/${pStart.getMonth() + 1}`;
                shortLabel = `${pStart.getFullYear()}`;
            }

            results.push({
                monthLabel: i === 0 ? '本期' : `過去 ${i} 期`,
                shortLabel: shortLabel,
                income: mInc,
                expense: mExp,
                rate: mRate,
                net: net,
                endBalance: runningBalance,
                index: i
            });

            runningBalance -= net;
        }
        return results;
    }, [savingsModalVisible, balanceModalVisible, records, startDate, endDate, durationInDays, accountFilter, periodSummary.totalBalance]);

    const accountTableData = useMemo(() => {
        // Prepare groups for all 5 ASSET_CLASSES in order
        const groupsMap = new Map<string, {
            category: string;
            accounts: { name: string; balance: number; originalCategory: string }[];
            subGroups: { name: string; accounts: { name: string; balance: number; originalCategory: string }[], totalBalance: number }[];
            isCollapsed: boolean;
            totalBalance: number;
            percentage: number;
        }>();

        Object.keys(ASSET_CLASSES).forEach(assetClass => {
            groupsMap.set(assetClass, {
                category: assetClass,
                accounts: [],
                subGroups: [],
                isCollapsed: collapsedGroups.has(assetClass),
                totalBalance: 0,
                percentage: 0
            });
        });

        // Populate accounts
        Object.entries(aggregatedSummary).forEach(([accountName, accData]) => {
            if (accData.balance === 0) return;

            // Optional: apply personal/shared filter logic if needed here, 
            // but aggregatedSummary might already be filtered. Assuming it's already filtered by processAndAggregateRecords

            // We need to know the original category to map it to ASSET_CLASSES
            const originalCategory = accData.category || '未分類';
            const assetClass = getAssetClass(originalCategory);

            const group = groupsMap.get(assetClass);
            if (group) {
                const newAcc = { name: accountName, balance: accData.balance, originalCategory };
                group.accounts.push(newAcc);

                // Find or create subGroup
                let subGroup = group.subGroups.find(sg => sg.name === originalCategory);
                if (!subGroup) {
                    subGroup = { name: originalCategory, accounts: [], totalBalance: 0 };
                    group.subGroups.push(subGroup);
                }
                subGroup.accounts.push(newAcc);
                subGroup.totalBalance += accData.balance;

                // Note: For liabilities, balances are typically negative. 
                // We keep the raw balance, but sum them up based on the absolute value for percentage later
                group.totalBalance += accData.balance;
            }
        });

        const groups = Array.from(groupsMap.values());

        // Sort accounts and subGroups by absolute balance descending
        groups.forEach(g => {
            g.accounts.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
            g.subGroups.sort((a, b) => Math.abs(b.totalBalance) - Math.abs(a.totalBalance));
            g.subGroups.forEach(sg => {
                sg.accounts.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
            });
        });

        // Compute total absolute sum across all classes for calculating percentages
        const totalAbsoluteSum = groups.reduce((sum, g) => sum + Math.abs(g.totalBalance), 0);

        // Assign percentage
        groups.forEach(g => {
            g.percentage = totalAbsoluteSum > 0 ? (Math.abs(g.totalBalance) / totalAbsoluteSum) * 100 : 0;
        });

        // Determine if there are ANY accounts to show at all
        const hasAnyAccounts = groups.some(g => g.accounts.length > 0);

        return { groups, totalAbsoluteSum, hasAnyAccounts };
    }, [aggregatedSummary, collapsedGroups]);

    const accountCategoryIcons: Record<string, string> = {
        '現金': '💵', '銀行': '🏦', '信用卡': '💳', '儲值卡': '🪪', '證券戶': '📈', '其他': '📦',
    };

    if (records.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <EmptyState
                    icon="stats-chart-outline"
                    title="尚無數據"
                    description="請先至「匯入」頁面載入 CSV 檔案"
                />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* Date Range Selector */}
            <PageChrome>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={`淨存額 $${(periodSummary.totalIncome - periodSummary.totalExpense).toLocaleString()}`}
                />
            </PageChrome>

            <View style={styles.filterSection}>
                <SegmentedControl
                    options={[
                        { value: 'all', label: '全部' },
                        { value: 'personal', label: '個人' },
                        { value: 'shared', label: '共享' },
                    ]}
                    value={accountViewType}
                    onChange={setAccountViewType}
                    colors={colors}
                />
            </View>

            {/* Summary Cards Grid */}
            <View style={styles.summaryGrid}>
                <SummaryCard index={0} title="資產" value={periodSummary.totalBalance} previousValue={previousPeriodSummary.totalBalance}
                    onPress={() => setBalanceModalVisible(true)} colors={colors} styles={styles} />
                <SummaryCard index={1} title="收入" value={periodSummary.totalIncome} previousValue={previousPeriodSummary.totalIncome}
                    onPress={() => handleSummaryCardClick('income')} colors={colors} styles={styles} />
                <SummaryCard index={2} title="支出" value={periodSummary.totalExpense} previousValue={previousPeriodSummary.totalExpense}
                    invertColor onPress={() => handleSummaryCardClick('expense')} colors={colors} styles={styles} />
                <SummaryCard index={3} title="儲蓄率" value={currentSavingsRate} previousValue={prevSavingsRate} isPercentage
                    onPress={() => setSavingsModalVisible(true)} colors={colors} styles={styles} />
            </View>



            {/* Account List and Ratio Visualization Area */}
            {accountTableData.hasAnyAccounts ? (
                <View style={{ marginTop: 20 }}>
                    <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                        <SegmentedControl
                            options={[
                                { value: 'list', label: '列表' },
                                { value: 'ratio', label: '比例' },
                            ]}
                            value={showRatioView ? 'ratio' : 'list'}
                            onChange={(v) => setShowRatioView(v === 'ratio')}
                            accessibilityLabel="帳戶檢視模式"
                        />
                    </View>

                    {showRatioView && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>資產分配比</Text>
                        </View>
                    )}

                    {showRatioView ? (
                        <Animated.View entering={FadeInLeft.duration(300).springify().damping(15)} style={{ paddingHorizontal: 20, height: 420, flexDirection: 'row', width: '100%' }}>
                            {(() => {
                                // 1. Calculate the core total of purely Assets (excluding Liabilities)
                                const assetGroups = accountTableData.groups.filter(g => g.category !== '負債' && Math.abs(g.totalBalance) > 0);
                                const totalAssets = assetGroups.reduce((sum, g) => sum + Math.abs(g.totalBalance), 0);

                                // 2. Identify Liability group
                                const liabilityGroup = accountTableData.groups.find(g => g.category === '負債');
                                const totalLiabilities = liabilityGroup ? Math.abs(liabilityGroup.totalBalance) : 0;
                                const hasLiabilities = totalLiabilities > 0;

                                // Calculate percentages relative to Total Assets
                                const liabilityPercentage = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
                                // Constrain liability percentage height visually so it looks decent even if ratio is extreme
                                const liabilityDisplayHeight = Math.min(Math.max(liabilityPercentage, 15), 90);

                                return (
                                    <>
                                        {/* Left Column: Liabilities */}
                                        {hasLiabilities && (
                                            <View style={{ flex: 0.8, justifyContent: 'flex-end', marginRight: 0 }}>
                                                <View style={{
                                                    height: `${liabilityDisplayHeight}%`,
                                                    minHeight: 100,
                                                    backgroundColor: ASSET_CLASS_COLORS['負債'],
                                                    borderTopLeftRadius: 28,
                                                    borderBottomLeftRadius: 28,
                                                    padding: 16,
                                                    paddingTop: 24,
                                                    justifyContent: 'flex-start'
                                                }}>
                                                    <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '800', opacity: 0.8, letterSpacing: -1 }}>
                                                        {Math.round(liabilityPercentage)}%
                                                    </Text>
                                                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', opacity: 0.6, marginTop: 4 }}>
                                                        負債
                                                    </Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Right Column: Positive Assets */}
                                        <View style={{
                                            flex: 2,
                                            borderTopLeftRadius: 28,
                                            borderTopRightRadius: 28,
                                            borderBottomRightRadius: 28,
                                            borderBottomLeftRadius: hasLiabilities ? 0 : 28,
                                            overflow: 'hidden',
                                            flexDirection: 'column'
                                        }}>
                                            {assetGroups.map(group => {
                                                const percentage = totalAssets > 0 ? (Math.abs(group.totalBalance) / totalAssets) * 100 : 0;
                                                // Only render if non-zero
                                                if (percentage === 0) return null;

                                                return (
                                                    <View key={`ratio-${group.category}`} style={{
                                                        height: `${percentage}%`,
                                                        backgroundColor: ASSET_CLASS_COLORS[group.category],
                                                        justifyContent: 'flex-start',
                                                        padding: 16,
                                                        paddingTop: 24
                                                    }}>
                                                        {/* Arrange percentage and label depending on height available */}
                                                        {percentage > 12 ? (
                                                            <View>
                                                                <Text style={{ color: colors.textPrimary, fontSize: 36, fontWeight: '800', opacity: 0.8, letterSpacing: -1, lineHeight: 38 }}>
                                                                    {Math.round(percentage)}%
                                                                </Text>
                                                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: 2 }}>
                                                                    {group.category}
                                                                </Text>
                                                            </View>
                                                        ) : (
                                                            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                                                                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', opacity: 0.8 }}>
                                                                    {Math.round(percentage)}%
                                                                </Text>
                                                                <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600', opacity: 0.7, paddingBottom: 1 }}>
                                                                    {group.category}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </>
                                );
                            })()}
                        </Animated.View>
                    ) : (
                        <Animated.View entering={FadeInDown.duration(400).springify()} style={{ marginHorizontal: 20, gap: 12 }}>
                            {accountTableData.groups.filter(g => g.accounts.length > 0).map((group) => {
                                const color = ASSET_CLASS_COLORS[group.category];

                                return (
                                    <View key={`list-${group.category}`}>
                                        {/* Top Level Card - color accent is INSIDE the card */}
                                        <View style={[{
                                            borderRadius: 20,
                                            backgroundColor: group.isCollapsed ? colors.card : color,
                                            overflow: 'hidden',
                                        }, group.isCollapsed && SHADOWS.sm]}>
                                            <Pressable
                                                onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                    toggleGroup(group.category);
                                                }}
                                                android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: false, radius: 200 }}
                                                style={({ pressed }) => [
                                                    pressed && { opacity: 0.8 }
                                                ]}
                                            >
                                                <View style={{
                                                    paddingLeft: 28,
                                                    paddingRight: 20,
                                                    paddingVertical: 18,
                                                    flexDirection: 'row',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                }}>
                                                <View style={{ flex: 1, marginRight: 12 }}>
                                                    {group.isCollapsed ? (
                                                        <>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                                <Text style={{ ...typography.body, fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
                                                                    {group.category}
                                                                </Text>
                                                                {group.accounts.length > 0 && (
                                                                    <View style={{ backgroundColor: color + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                                                        <Text style={{ fontSize: 10, color: color, fontWeight: '700' }}>
                                                                            {group.accounts.length} 筆資產
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                            {group.accounts.length > 0 && (
                                                                <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                                                                    {Array.from(new Set(group.accounts.map(a => a.originalCategory))).join('、')}
                                                                </Text>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Text style={{ ...typography.body, fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
                                                                {group.category}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                                                    <Text style={{ fontSize: 22, fontWeight: '800', color: group.isCollapsed ? colors.textPrimary : colors.textPrimary, letterSpacing: -0.5 }}>
                                                        {group.totalBalance >= 0 ? '' : '⊖ '}{Math.abs(group.totalBalance).toLocaleString()}
                                                    </Text>
                                                </View>
                                                </View>
                                            </Pressable>
                                        </View>

                                        {/* Middle Tier (Categories) List */}
                                        {!group.isCollapsed && group.subGroups.length > 0 && (
                                            <View style={{ paddingTop: 12, gap: 12 }}>
                                                {group.subGroups.map(sub => {
                                                    const subId = `${group.category}-${sub.name}`;
                                                    const isSubExpanded = expandedSubGroups[subId];

                                                    return (
                                                        <View key={subId} style={[{ borderRadius: 16, backgroundColor: colors.card, overflow: 'hidden' }, SHADOWS.sm]}>
                                                            {/* Internal color accent strip */}
                                                            <View style={{
                                                                position: 'absolute',
                                                                left: 0,
                                                                top: 0,
                                                                bottom: 0,
                                                                width: 6,
                                                                backgroundColor: color,
                                                                zIndex: 1,
                                                            }} />

                                                            <Pressable
                                                                onPress={() => {
                                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                    toggleSubGroup(subId);
                                                                }}
                                                                android_ripple={{ color: 'rgba(0,0,0,0.05)', borderless: false }}
                                                                style={({ pressed }) => [
                                                                    pressed && { backgroundColor: colors.bg }
                                                                ]}
                                                            >
                                                                <View style={{
                                                                    paddingLeft: 24,
                                                                    paddingRight: 20,
                                                                    paddingVertical: 16,
                                                                    flexDirection: 'row',
                                                                    justifyContent: 'space-between',
                                                                }}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                                                                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color + '15', justifyContent: 'center', alignItems: 'center' }}>
                                                                        <Ionicons name="wallet-outline" size={18} color={color} />
                                                                    </View>
                                                                    <View style={{ flex: 1, marginRight: 8 }}>
                                                                        <Text style={{ color: color, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                                                                            {sub.name}
                                                                        </Text>
                                                                        {!isSubExpanded && (
                                                                            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                                                                                {sub.accounts.length > 0 ? sub.accounts.map(a => a.name).join('、') : '無帳戶'}
                                                                            </Text>
                                                                        )}
                                                                    </View>
                                                                </View>
                                                                <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                                                                    <Text style={{ fontSize: 17, fontWeight: '800', color: color }}>
                                                                        {sub.totalBalance >= 0 ? '' : '⊖ '}{Math.abs(sub.totalBalance).toLocaleString()}
                                                                    </Text>
                                                                </View>
                                                                </View>
                                                            </Pressable>

                                                            {/* Bottom Tier (Accounts) List */}
                                                            {isSubExpanded && (
                                                                <View style={{ paddingLeft: 24, paddingRight: 20, paddingBottom: 20, paddingTop: 6, gap: 12 }}>
                                                                    <View style={{ height: 1, backgroundColor: colors.divider, marginBottom: 8 }} />
                                                                    {sub.accounts.map(acc => (
                                                                        <Pressable
                                                                            key={acc.name}
                                                                            onPress={() => handleAccountClick(acc.name)}
                                                                            style={({ pressed }) => [{
                                                                                flexDirection: 'row',
                                                                                justifyContent: 'space-between',
                                                                                alignItems: 'center',
                                                                                paddingVertical: 10,
                                                                                opacity: pressed ? 0.7 : 1
                                                                            }]}
                                                                        >
                                                                            <View style={{ flex: 1, marginRight: 12 }}>
                                                                                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                                                                                    {acc.name}
                                                                                </Text>
                                                                            </View>
                                                                            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                                                                                <Text style={{ fontSize: 16, fontWeight: '800', color: acc.balance >= 0 ? colors.green : colors.red }}>
                                                                                    {acc.balance < 0 ? '-' : ''}{Math.abs(acc.balance).toLocaleString()}
                                                                                </Text>
                                                                            </View>
                                                                        </Pressable>
                                                                    ))}
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </Animated.View>
                    )}
                </View>
            ) : (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted }}>沒有任何紀錄</Text>
                </View>
            )
            }

            {/* Detail Modal (shared component) */}
            <DetailModal
                visible={detailModal.visible}
                title={detailModal.title}
                records={detailModal.data}
                onClose={() => setDetailModal({ ...detailModal, visible: false })}
            />

            {/* Account Settings Modal */}
            <AccountSettingsModal
                visible={isAccountSettingsVisible}
                onClose={() => setIsAccountSettingsVisible(false)}
                excludedAccounts={excludedAccounts}
                onSave={handleSaveExcludedAccounts}
            />

            {/* Account Detail Modal */}
            <AccountDetailModal
                visible={accountDetailModal.visible}
                accountName={accountDetailModal.accountName}
                onClose={() => setAccountDetailModal({ ...accountDetailModal, visible: false })}
            />

            {/* Dedicated Balance Modal */}
            <Modal visible={balanceModalVisible} animationType="none" transparent presentationStyle="overFullScreen">
                <ModalBackdrop colors={colors}>
                    <TouchableWithoutFeedback onPress={() => setBalanceModalVisible(false)}>
                        <View style={{ flex: 1, width: '100%' }} />
                    </TouchableWithoutFeedback>
                    <BottomSheetGestureWrapper
                        swipe={balanceSwipe}
                        style={{
                            backgroundColor: colors.bg,
                            ...withContinuousRadius(RADIUS.xl),
                            borderBottomLeftRadius: 0,
                            borderBottomRightRadius: 0,
                            paddingBottom: 40,
                            height: '85%',
                            ...SHADOWS.lg,
                        }}
                        header={(
                            <>
                                <View style={{ width: 40, height: 5, backgroundColor: colors.border, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />
                                <SheetHeader title="資產趨勢與未來預估" onClose={() => setBalanceModalVisible(false)} style={{ backgroundColor: 'transparent' }} />
                            </>
                        )}
                    >
                        <GHScrollView
                            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                            onScroll={balanceSwipe.handleScroll}
                            scrollEventThrottle={balanceSwipe.scrollEventThrottle}
                        >

                            {/* Future Wealth Projection Card */}
                            {(() => {
                                const avgNetIncome = past12PeriodsData.reduce((sum, d) => sum + d.net, 0) / 12;
                                return (
                                    <View style={{ backgroundColor: colors.accentLight, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.accentBorder }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                            <Ionicons name="sparkles-outline" size={18} color={colors.accent} style={{ marginRight: 8 }} />
                                            <Text style={{ ...typography.body, fontWeight: '800', color: colors.accent }}>未來財富預估</Text>
                                        </View>
                                        <Text style={{ ...typography.bodySm, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
                                            根據過去 12 期平均淨存額 <Text style={{ fontWeight: '700', color: avgNetIncome >= 0 ? colors.green : colors.red }}>${Math.round(avgNetIncome).toLocaleString()}</Text> 推算：
                                        </Text>

                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 12, borderRadius: 12, ...SHADOWS.sm }}>
                                            <View style={{ alignItems: 'center', flex: 1, borderRightWidth: 1, borderRightColor: colors.divider }}>
                                                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>半年後</Text>
                                                <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 6).toLocaleString()}</Text>
                                            </View>
                                            <View style={{ alignItems: 'center', flex: 1, borderRightWidth: 1, borderRightColor: colors.divider }}>
                                                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>一年後</Text>
                                                <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 12).toLocaleString()}</Text>
                                            </View>
                                            <View style={{ alignItems: 'center', flex: 1 }}>
                                                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>五年後</Text>
                                                <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 60).toLocaleString()}</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })()}

                            {past12PeriodsData.length > 0 && (
                                <View style={{ backgroundColor: colors.card, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 10, marginBottom: 16, borderWidth: 1, borderColor: colors.divider, alignItems: 'center' }}>
                                    <Text style={{ ...typography.caption, color: colors.textMuted, alignSelf: 'flex-start', marginLeft: 16, marginBottom: 12 }}>過去 12 期資產與收支組合走勢</Text>

                                    <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, gap: 16 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>資產折線</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.green }} />
                                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>收入</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.red }} />
                                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>支出</Text>
                                        </View>
                                    </View>

                                    {(() => {
                                        const reversedPeriods = [...past12PeriodsData].reverse();
                                        const comboBarData: any[] = [];
                                        const comboLineData: any[] = [];
                                        reversedPeriods.forEach(d => {
                                            // 1. Income Bar (label under it, but we can center it subtly using spaces or just accept the left alignment)
                                            comboBarData.push({ value: d.income, label: d.shortLabel, spacing: 2, frontColor: colors.green });
                                            // 2. Expense Bar
                                            comboBarData.push({ value: d.expense, frontColor: colors.red });

                                            // Only ONE line data point per period!
                                            comboLineData.push({
                                                value: d.endBalance,
                                                dataPointText: Math.abs(d.endBalance) >= 1000 ? (d.endBalance / 1000).toFixed(0) + 'k' : Math.round(d.endBalance).toString(),
                                                textColor: colors.textPrimary,
                                                textShiftY: -10,
                                                textFontSize: 10,
                                            });
                                        });

                                        const maxColValue = Math.max(...reversedPeriods.flatMap(d => [d.income, d.expense, d.endBalance]));
                                        const chartMaxValue = Math.max(0, maxColValue * 1.15); // Add 15% headroom

                                        return (
                                            <BarChart
                                                data={comboBarData}
                                                showLine
                                                lineData={comboLineData}
                                                lineConfig={{
                                                    color: colors.accent,
                                                    thickness: 3,
                                                    dataPointsColor: colors.accent,
                                                    dataPointsRadius: 4,
                                                    shiftX: 5, // Slightly reduced to center perfectly against the visual weight of the double bars
                                                    spacing: 34, // 12(barWidth) + 34 = 46px (total group step: 12+2+12+20)
                                                }}
                                                maxValue={chartMaxValue}
                                                barWidth={12}
                                                spacing={20}
                                                scrollToEnd
                                                initialSpacing={20}
                                                endSpacing={30}
                                                barBorderRadius={3}
                                                rulesColor={colors.divider}
                                                yAxisThickness={0}
                                                xAxisThickness={0}
                                                width={SCREEN_WIDTH - 60}
                                                height={160}
                                                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                                                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                                            />
                                        );
                                    })()}
                                </View>
                            )}

                            {past12PeriodsData.map((data, index) => (
                                <View key={index} style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.cardBorder, ...SHADOWS.sm }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>{data.monthLabel}</Text>
                                        <Text style={{ ...typography.h3, color: colors.textPrimary }}>
                                            ${Math.round(data.endBalance).toLocaleString()}
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>總收入</Text>
                                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${Math.round(data.income).toLocaleString()}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>總支出</Text>
                                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${Math.round(data.expense).toLocaleString()}</Text>
                                    </View>
                                    <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 8 }} />
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>淨變化</Text>
                                        <Text style={{ color: data.net >= 0 ? colors.green : colors.red, fontWeight: '700' }}>
                                            {data.net >= 0 ? '+' : '-'}${Math.abs(Math.round(data.net)).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </GHScrollView>
                    </BottomSheetGestureWrapper>
                </ModalBackdrop>
            </Modal>

            {/* Dedicated Savings Rate Modal */}
            <Modal visible={savingsModalVisible} animationType="none" transparent presentationStyle="overFullScreen">
                <ModalBackdrop colors={colors}>
                    <TouchableWithoutFeedback onPress={() => setSavingsModalVisible(false)}>
                        <View style={{ flex: 1, width: '100%' }} />
                    </TouchableWithoutFeedback>
                    <BottomSheetGestureWrapper
                        swipe={savingsSwipe}
                        style={{
                            backgroundColor: colors.bg,
                            ...withContinuousRadius(RADIUS.xl),
                            borderBottomLeftRadius: 0,
                            borderBottomRightRadius: 0,
                            paddingBottom: 40,
                            height: '80%',
                            ...SHADOWS.lg,
                        }}
                        header={(
                            <>
                                <View style={{ width: 40, height: 5, backgroundColor: colors.border, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />
                                <SheetHeader title="儲蓄率趨勢 (過去 12 期)" onClose={() => setSavingsModalVisible(false)} style={{ backgroundColor: 'transparent' }} />
                            </>
                        )}
                    >
                        <GHScrollView
                            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                            onScroll={savingsSwipe.handleScroll}
                            scrollEventThrottle={savingsSwipe.scrollEventThrottle}
                        >
                            {/* Trend Chart (BarChart with dynamic red/green bars based on net amount) */}
                            {past12PeriodsData.length > 0 && (
                                <View style={{ backgroundColor: colors.card, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 10, marginBottom: 16, borderWidth: 1, borderColor: colors.divider, alignItems: 'center' }}>
                                    <Text style={{ ...typography.caption, color: colors.textMuted, alignSelf: 'flex-start', marginLeft: 16, marginBottom: 12 }}>過去 12 期淨存額與儲蓄率</Text>
                                    {(() => {
                                        const maxRate = Math.max(...past12PeriodsData.map(d => d.rate));
                                        const rateMaxValue = Math.max(0, maxRate + (maxRate * 0.15) + 15);
                                        return (
                                            <LineChartBicolor
                                                data={[...past12PeriodsData].reverse().map(d => ({
                                                    value: d.rate,
                                                    label: d.shortLabel,
                                                    dataPointText: Math.abs(d.net) >= 1000 ? (d.net > 0 ? '+' : '') + (d.net / 1000).toFixed(1) + 'k' : (d.net > 0 ? '+' : '') + Math.round(d.net).toString(),
                                                    textColor: d.net >= 0 ? colors.green : colors.red,
                                                    textShiftY: d.net >= 0 ? -12 : 12,
                                                    textFontSize: 10
                                                }))}
                                                maxValue={rateMaxValue}
                                                areaChart
                                                color={colors.green}
                                                colorNegative={colors.red}
                                                startFillColor={colors.green}
                                                endFillColor={colors.green}
                                                startFillColorNegative={colors.red}
                                                endFillColorNegative={colors.red}
                                                startOpacity={0.2}
                                                endOpacity={0.01}
                                                startOpacityNegative={0.2}
                                                endOpacityNegative={0.01}
                                                thickness={3}
                                                hideDataPoints={false}
                                                dataPointsRadius={3}
                                                scrollToEnd
                                                spacing={45}
                                                initialSpacing={20}
                                                endSpacing={50}
                                                rulesColor={colors.divider}
                                                yAxisThickness={0}
                                                xAxisThickness={0}
                                                width={SCREEN_WIDTH - 60}
                                                height={160}
                                                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                                            />
                                        );
                                    })()}
                                </View>
                            )}

                            {/* List items ordered with newest period on top */}
                            {past12PeriodsData.map((data, index) => (
                                <View key={index} style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.cardBorder, ...SHADOWS.sm }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>{data.monthLabel}</Text>
                                        <View style={{ backgroundColor: data.rate >= 0 ? colors.greenLight : colors.redLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                            <Text style={{ color: data.rate >= 0 ? colors.green : colors.red, fontWeight: '800', fontSize: 13 }}>
                                                {data.rate.toFixed(1)}%
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>總收入</Text>
                                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${Math.round(data.income).toLocaleString()}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>總支出</Text>
                                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${Math.round(data.expense).toLocaleString()}</Text>
                                    </View>
                                    <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 8 }} />
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>淨存額</Text>
                                        <Text style={{ color: data.net >= 0 ? colors.green : colors.red, fontWeight: '700' }}>
                                            {data.net >= 0 ? '+' : '-'}${Math.abs(Math.round(data.net)).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </GHScrollView>
                    </BottomSheetGestureWrapper>
                </ModalBackdrop>
            </Modal>
        </ScrollView>
    );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    // Empty
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, padding: 20 },
    filterSection: { paddingTop: 20, paddingBottom: 4, alignItems: 'center' },
    // Summary Grid
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, gap: 14 },
    summaryCardContainer: { marginBottom: 0 },
    summaryCardWrapper: { ...withContinuousRadius(RADIUS.lg), backgroundColor: colors.bg },
    summaryCardInner: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        ...withContinuousRadius(RADIUS.lg),
        borderWidth: 1,
        minHeight: 120,
        overflow: 'hidden',
    },
    summaryAccentStrip: { width: 4 },
    summaryCardBody: { flex: 1, padding: 16, justifyContent: 'space-between' },
    summaryCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    summaryCardTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
    summaryCardValue: { color: colors.textPrimary, fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
    summaryCardChange: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    summaryCardChangeText: { fontSize: 13, fontWeight: '700' },
    summaryCardChangeLabel: { color: colors.textMuted, fontSize: 11, marginLeft: 4 },
    tapHint: { fontSize: 11, color: colors.textMuted, marginTop: 8, textAlign: 'right', fontWeight: '500' },
    // Chart Cards
    chartCard: { backgroundColor: colors.card, marginHorizontal: 16, marginTop: 20, ...withContinuousRadius(RADIUS.xl), padding: 20, borderWidth: 1, borderColor: colors.cardBorder, ...SHADOWS.md },
    chartYLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '500' },
    chartXLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '500' },
    chartEmpty: { color: colors.textSecondary, textAlign: 'center', paddingVertical: 40 },
    // Legend
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 12, height: 12, borderRadius: 4, marginRight: 6 },
    legendText: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
    // Account
    accountGroup: { backgroundColor: 'transparent' },
    accountGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
    accountGroupTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
    accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: 'transparent' },
    accountName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    accountBalance: { fontSize: 14, fontWeight: '800', flexShrink: 0 },
    // Category
    distBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.bg, marginBottom: 16 },
    catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'transparent' },
    catRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    catDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
    catName: { color: colors.textPrimary, fontSize: 14, fontWeight: '500' },
    catRowRight: { flexDirection: 'row', alignItems: 'center' },
    catAmount: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginRight: 10 },
    catPct: { color: colors.textMuted, fontSize: 12, width: 45, textAlign: 'right', fontWeight: '500' },
});
