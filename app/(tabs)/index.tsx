
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Dimensions, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager, Modal } from 'react-native';
import { LineChart, PieChart, BarChart, LineChartBicolor } from 'react-native-gifted-charts';
import Animated, { FadeInDown, FadeInLeft } from 'react-native-reanimated';
import { useFinance } from '../../context/FinanceContext';
import { processAndAggregateRecords, transformRecordsForExport, filterAndSortRecords } from '../../services/financeService';
import { PERSONAL_ACCOUNTS, SHARED_ACCOUNTS, ASSET_CLASSES, ASSET_CLASS_COLORS, getAssetClass } from '../../constants';
import { TrendDataPoint, AccountsSummaryMap, TransformedRecord } from '../../types';
import { COLORS, SHADOWS, CATEGORY_COLORS, TYPOGRAPHY } from '../../theme';
import DateRangeSelector from '../../components/DateRangeSelector';
import DetailModal from '../../components/DetailModal';
import CategoryPieChart from '../../components/CategoryPieChart';
import AccountDetailModal from '../../components/AccountDetailModal';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { loadExcludedAccounts, saveExcludedAccounts } from '../../services/accountConfigService';
import AccountSettingsModal from '../../components/account/AccountSettingsModal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;

type AccountViewType = 'all' | 'personal' | 'shared';

// ─── Summary Card ───
const SummaryCard = ({ title, value, previousValue, isPercentage, invertColor, onPress, index, fullWidth }: {
    title: string; value: number; previousValue: number;
    isPercentage?: boolean; invertColor?: boolean; onPress?: () => void; index?: number; fullWidth?: boolean;
}) => {
    const diff = value - previousValue;
    const pctChange = previousValue !== 0
        ? ((diff / Math.abs(previousValue)) * 100).toFixed(1)
        : (diff > 0 ? '∞' : (diff < 0 ? '-∞' : '0'));
    const isPositive = diff > 0;
    const isNegative = diff < 0;
    let changeColor: string = COLORS.textMuted;
    if (invertColor) {
        if (isPositive) changeColor = COLORS.red;
        else if (isNegative) changeColor = COLORS.green;
    } else {
        if (isPositive) changeColor = COLORS.green;
        else if (isNegative) changeColor = COLORS.red;
    }
    const displayValue = isPercentage ? `${value.toFixed(1)}%` : `$${Math.round(value).toLocaleString()}`;
    const arrow = isPositive ? '↑' : isNegative ? '↓' : '−';
    const iconMap: Record<string, string> = { '資產': '💎', '收入': '📈', '支出': '📉', '儲蓄率': '🎯', '日均消費': '☕' };
    const accentMap: Record<string, string> = { '資產': '#4F46E5', '收入': '#10B981', '支出': '#EF4444', '儲蓄率': '#8B5CF6', '日均消費': '#F97316' };

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
                <View style={[styles.summaryCardInner, { borderTopColor: accentMap[title] || COLORS.accent }]}>
                    <View style={styles.summaryCardHeader}>
                        <Text style={{ fontSize: 16 }}>{iconMap[title] || '📊'}</Text>
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
            </Pressable>
        </Animated.View>
    );
};

// ─── Section Header ───
const SectionHeader = ({ title, accent }: { title: string; accent?: string }) => (
    <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: accent || COLORS.accent }]} />
        <Text style={styles.sectionTitle}>{title}</Text>
    </View>
);

export default function DashboardScreen() {
    const { records } = useFinance();
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
            headerRightContainerStyle: { paddingRight: 16 },
            headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable
                        onPress={() => {
                            console.log('Dashboard Settings Button Clicked!');
                            setIsAccountSettingsVisible(true);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => [pressed && { opacity: 0.5 }]}
                    >
                        <Ionicons name="settings-outline" size={22} color={COLORS.textSecondary} />
                    </Pressable>
                </View>
            ),
        });
    }, [navigation]);

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
    const currentDailyAvg = durationInDays > 0 ? periodSummary.totalExpense / durationInDays : 0;
    const prevDailyAvg = durationInDays > 0 ? previousPeriodSummary.totalExpense / durationInDays : 0;

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

    // Chart data
    const trendChartData = useMemo(() => {
        return dailyTrend.map((pt: TrendDataPoint) => ({
            value: pt.balance,
            label: durationInDays < 90
                ? `${pt.date.getMonth() + 1}/${pt.date.getDate()}`
                : `${pt.date.getMonth() + 1}月`,
        }));
    }, [dailyTrend, durationInDays]);



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

    const categoryData = useMemo(() => {
        const catMap: { [key: string]: number } = {};
        const recordsInRange = filterAndSortRecords(records, startDate, endDate);
        recordsInRange.forEach(row => {
            const m = Math.abs(parseFloat((row['金額'] || '').replace(/[,￥$€£]/g, '')) || 0);

            // Skip if it's not an expense or if it's an income transaction
            if (!row['付款(轉出)'] || row['收款(轉入)']) return;

            // Skip specific categories that are not considered regular expenses
            if (row['分類'] === 'SYSTEM' || row['分類'] === '轉帳') return;

            // Handle '代付' (payment on behalf of others)
            // If it's a '代付' transaction, it's not a personal expense, so skip it.
            if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) return;

            // Apply account filter for expenses
            if (accountFilter && !accountFilter.includes(row['付款(轉出)'])) return;

            const amount = m; // Use the already parsed amount
            const cat = row['分類'] || '未分類';
            catMap[cat] = (catMap[cat] || 0) + amount;
        });
        return Object.entries(catMap)
            .map(([name, value]) => ({ name, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [records, startDate, endDate, accountFilter]);

    const totalCategoryExpense = categoryData.reduce((s, c) => s + c.value, 0);

    const accountCategoryIcons: Record<string, string> = {
        '現金': '💵', '銀行': '🏦', '信用卡': '💳', '儲值卡': '🪪', '證券戶': '📈', '其他': '📦',
    };

    if (records.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>📊</Text>
                <Text style={styles.emptyTitle}>尚無數據</Text>
                <Text style={styles.emptySubtitle}>請先至「匯入」頁面載入 CSV 檔案</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* Date Range Selector */}
            <View style={styles.dateHeader}>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={`淨存額 $${(periodSummary.totalIncome - periodSummary.totalExpense).toLocaleString()}`}
                />
            </View>

            {/* Account Filter Text Links */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 20, paddingBottom: 4, gap: 16 }}>
                <Pressable hitSlop={10} onPress={() => setAccountViewType('all')}>
                    <Text style={{
                        fontSize: 15,
                        fontWeight: accountViewType === 'all' ? '800' : '500',
                        color: accountViewType === 'all' ? COLORS.textPrimary : COLORS.textMuted,
                        letterSpacing: 1
                    }}>全部</Text>
                </Pressable>

                <Text style={{ color: COLORS.divider, fontSize: 12, fontWeight: '300' }}>|</Text>

                <Pressable hitSlop={10} onPress={() => setAccountViewType('personal')}>
                    <Text style={{
                        fontSize: 15,
                        fontWeight: accountViewType === 'personal' ? '800' : '500',
                        color: accountViewType === 'personal' ? COLORS.textPrimary : COLORS.textMuted,
                        letterSpacing: 1
                    }}>個人</Text>
                </Pressable>

                <Text style={{ color: COLORS.divider, fontSize: 12, fontWeight: '300' }}>|</Text>

                <Pressable hitSlop={10} onPress={() => setAccountViewType('shared')}>
                    <Text style={{
                        fontSize: 15,
                        fontWeight: accountViewType === 'shared' ? '800' : '500',
                        color: accountViewType === 'shared' ? COLORS.textPrimary : COLORS.textMuted,
                        letterSpacing: 1
                    }}>共享</Text>
                </Pressable>
            </View>

            {/* Summary Cards Grid */}
            <View style={styles.summaryGrid}>
                <SummaryCard index={0} title="資產" value={periodSummary.totalBalance} previousValue={previousPeriodSummary.totalBalance}
                    onPress={() => setBalanceModalVisible(true)} />
                <SummaryCard index={1} title="收入" value={periodSummary.totalIncome} previousValue={previousPeriodSummary.totalIncome}
                    onPress={() => handleSummaryCardClick('income')} />
                <SummaryCard index={2} title="支出" value={periodSummary.totalExpense} previousValue={previousPeriodSummary.totalExpense}
                    invertColor onPress={() => handleSummaryCardClick('expense')} />
                <SummaryCard index={3} title="儲蓄率" value={currentSavingsRate} previousValue={prevSavingsRate} isPercentage
                    onPress={() => setSavingsModalVisible(true)} />
            </View>



            {/* Account List and Ratio Visualization Area */}
            {accountTableData.hasAnyAccounts ? (
                <View style={{ marginTop: 20 }}>
                    {showRatioView && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>資產分配比</Text>
                            <Pressable
                                onPress={() => setShowRatioView(false)}
                                style={({ pressed }) => [{
                                    padding: 8,
                                    marginRight: -8, // better hit area
                                }, pressed && { opacity: 0.5 }]}
                            >
                                <Ionicons name="chevron-forward" size={24} color={COLORS.textPrimary} />
                            </Pressable>
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
                                                    <Text style={{ color: '#000', fontSize: 28, fontWeight: '800', opacity: 0.8, letterSpacing: -1 }}>
                                                        {Math.round(liabilityPercentage)}%
                                                    </Text>
                                                    <Text style={{ color: '#000', fontSize: 13, fontWeight: '600', opacity: 0.6, marginTop: 4 }}>
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
                                                                <Text style={{ color: '#000', fontSize: 36, fontWeight: '800', opacity: 0.8, letterSpacing: -1, lineHeight: 38 }}>
                                                                    {Math.round(percentage)}%
                                                                </Text>
                                                                <Text style={{ color: '#000', fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: 2 }}>
                                                                    {group.category}
                                                                </Text>
                                                            </View>
                                                        ) : (
                                                            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                                                                <Text style={{ color: '#000', fontSize: 18, fontWeight: '800', opacity: 0.8 }}>
                                                                    {Math.round(percentage)}%
                                                                </Text>
                                                                <Text style={{ color: '#000', fontSize: 12, fontWeight: '600', opacity: 0.7, paddingBottom: 1 }}>
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
                        <Animated.View entering={FadeInDown.duration(400).springify()} style={{ paddingHorizontal: 20, width: '100%' }}>
                            {accountTableData.groups.filter(g => g.accounts.length > 0).map((group, index, activeGroups) => {
                                // Provide slightly visually distinct but interconnected blocks
                                // In the requested picture, the colorful vertical bar is on the left
                                const color = ASSET_CLASS_COLORS[group.category];
                                const isFirst = index === 0;
                                const isLast = index === activeGroups.length - 1;

                                return (
                                    <View key={`list-${group.category}`} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                                        {/* Colorful vertical bar matching Percento style */}
                                        <Pressable
                                            onPress={() => setShowRatioView(true)}
                                            style={{
                                                width: 24,
                                                flexShrink: 0,
                                                backgroundColor: color,
                                                borderTopLeftRadius: isFirst ? 16 : 0,
                                                borderTopRightRadius: isFirst ? 16 : 0,
                                                borderBottomLeftRadius: isLast ? 16 : 0,
                                                borderBottomRightRadius: isLast ? 16 : 0,
                                            }}
                                        />

                                        <View style={{ flex: 1, paddingLeft: 12, paddingBottom: isLast ? 0 : 16 }}>
                                            {/* Top Level (Asset Class) Header */}
                                            {!group.isCollapsed ? (
                                                <View style={{ borderRadius: 20, backgroundColor: color, overflow: 'hidden' }}>
                                                    <Pressable
                                                        onPress={() => {
                                                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                            toggleGroup(group.category);
                                                        }}
                                                        android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: false, radius: 200 }}
                                                        style={({ pressed }) => [
                                                            {
                                                                paddingHorizontal: 20,
                                                                paddingVertical: 18,
                                                                flexDirection: 'row',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                borderRadius: 20,
                                                            },
                                                            pressed && { opacity: 0.8 }
                                                        ]}
                                                    >
                                                        <View style={{ flex: 1, marginRight: 12 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                <Text style={{ ...TYPOGRAPHY.body, fontSize: 18, fontWeight: '700', color: '#000' }}>
                                                                    {group.category}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                                                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#000' }}>
                                                                {group.totalBalance >= 0 ? '' : '⊖ '}{Math.abs(group.totalBalance).toLocaleString()}
                                                            </Text>
                                                        </View>
                                                    </Pressable>
                                                </View>
                                            ) : (
                                                <View style={[{ borderRadius: 20, backgroundColor: COLORS.card }, SHADOWS.sm]}>
                                                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                                                        <Pressable
                                                            onPress={() => {
                                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                toggleGroup(group.category);
                                                            }}
                                                            android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: false, radius: 200 }}
                                                            style={({ pressed }) => [
                                                                {
                                                                    paddingHorizontal: 20,
                                                                    paddingVertical: 18,
                                                                    flexDirection: 'row',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    borderRadius: 20,
                                                                },
                                                                pressed && { opacity: 0.8 }
                                                            ]}
                                                        >
                                                            <View style={{ flex: 1, marginRight: 12 }}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                                    <Text style={{ ...TYPOGRAPHY.body, fontSize: 18, fontWeight: '700', color: COLORS.textPrimary }}>
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
                                                                    <Text style={{ color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>
                                                                        {Array.from(new Set(group.accounts.map(a => a.originalCategory))).join('、')}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                            <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                                                                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
                                                                    {group.totalBalance >= 0 ? '' : '⊖ '}{Math.abs(group.totalBalance).toLocaleString()}
                                                                </Text>
                                                            </View>
                                                        </Pressable>
                                                    </View>
                                                </View>
                                            )}

                                            {/* Middle Tier (Categories) List */}
                                            {!group.isCollapsed && group.subGroups.length > 0 && (
                                                <View style={{ paddingTop: 16, gap: 14 }}>
                                                    {group.subGroups.map(sub => {
                                                        const subId = `${group.category}-${sub.name}`;
                                                        const isSubExpanded = expandedSubGroups[subId];

                                                        return (
                                                            <View key={subId} style={[{ borderRadius: 16, backgroundColor: COLORS.card }, SHADOWS.sm]}>
                                                                <Pressable
                                                                    onPress={() => {
                                                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                        toggleSubGroup(subId);
                                                                    }}
                                                                    android_ripple={{ color: 'rgba(0,0,0,0.05)', borderless: false }}
                                                                    style={({ pressed }) => [
                                                                        {
                                                                            paddingHorizontal: 20,
                                                                            paddingVertical: 18,
                                                                            flexDirection: 'row',
                                                                            justifyContent: 'space-between',
                                                                        },
                                                                        pressed && { backgroundColor: COLORS.bg }
                                                                    ]}
                                                                >
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                                                                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color + '15', justifyContent: 'center', alignItems: 'center' }}>
                                                                            <Ionicons name="wallet-outline" size={18} color={color} />
                                                                        </View>
                                                                        <View style={{ flex: 1, marginRight: 8 }}>
                                                                            <Text style={{ color: color, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                                                                                {sub.name}
                                                                            </Text>
                                                                            {!isSubExpanded && (
                                                                                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
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
                                                                </Pressable>

                                                                {/* Bottom Tier (Accounts) List */}
                                                                {
                                                                    isSubExpanded && (
                                                                        <View style={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 6, gap: 12 }}>
                                                                            <View style={{ height: 1, backgroundColor: COLORS.divider, marginBottom: 8 }} />
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
                                                                                        <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                                                                                            {acc.name}
                                                                                        </Text>
                                                                                    </View>
                                                                                    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                                                                                        <Text style={{ fontSize: 16, fontWeight: '800', color: acc.balance >= 0 ? COLORS.green : COLORS.red }}>
                                                                                            {acc.balance < 0 ? '-' : ''}{Math.abs(acc.balance).toLocaleString()}
                                                                                        </Text>
                                                                                    </View>
                                                                                </Pressable>
                                                                            ))}
                                                                        </View>
                                                                    )
                                                                }
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </Animated.View>
                    )}
                </View>
            ) : (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.textMuted }}>沒有任何紀錄</Text>
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
            <Modal visible={balanceModalVisible} animationType="slide" transparent presentationStyle="overFullScreen">
                <BlurView intensity={30} tint="dark" style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setBalanceModalVisible(false)} />
                    <Animated.View entering={FadeInDown.springify()} style={{ backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '85%', ...SHADOWS.lg }}>
                        <View style={{ width: 40, height: 5, backgroundColor: COLORS.border, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.divider }}>
                            <Text style={{ ...TYPOGRAPHY.h3, letterSpacing: -0.3 }}>資產趨勢與未來預估</Text>
                            <Pressable onPress={() => setBalanceModalVisible(false)} style={({ pressed }) => [{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.accentLight, borderRadius: 16 }, pressed && { opacity: 0.8 }]}>
                                <Text style={{ color: COLORS.accent, fontWeight: '700', fontSize: 13 }}>關閉</Text>
                            </Pressable>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

                            {/* Future Wealth Projection Card */}
                            {(() => {
                                const avgNetIncome = past12PeriodsData.reduce((sum, d) => sum + d.net, 0) / 12;
                                return (
                                    <View style={{ backgroundColor: COLORS.accentLight, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.accentBorder }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                            <Text style={{ fontSize: 18, marginRight: 8 }}>🔮</Text>
                                            <Text style={{ ...TYPOGRAPHY.body, fontWeight: '800', color: COLORS.accent }}>未來財富預估</Text>
                                        </View>
                                        <Text style={{ ...TYPOGRAPHY.bodySm, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 20 }}>
                                            根據過去 12 期平均淨存額 <Text style={{ fontWeight: '700', color: avgNetIncome >= 0 ? COLORS.green : COLORS.red }}>${Math.round(avgNetIncome).toLocaleString()}</Text> 推算：
                                        </Text>

                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.card, padding: 12, borderRadius: 12, ...SHADOWS.sm }}>
                                            <View style={{ alignItems: 'center', flex: 1, borderRightWidth: 1, borderRightColor: COLORS.divider }}>
                                                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>半年後</Text>
                                                <Text style={{ ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 6).toLocaleString()}</Text>
                                            </View>
                                            <View style={{ alignItems: 'center', flex: 1, borderRightWidth: 1, borderRightColor: COLORS.divider }}>
                                                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>一年後</Text>
                                                <Text style={{ ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 12).toLocaleString()}</Text>
                                            </View>
                                            <View style={{ alignItems: 'center', flex: 1 }}>
                                                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>五年後</Text>
                                                <Text style={{ ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 60).toLocaleString()}</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })()}

                            {past12PeriodsData.length > 0 && (
                                <View style={{ backgroundColor: COLORS.card, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 10, marginBottom: 16, borderWidth: 1, borderColor: COLORS.divider, alignItems: 'center' }}>
                                    <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, alignSelf: 'flex-start', marginLeft: 16, marginBottom: 12 }}>過去 12 期資產與收支組合走勢</Text>

                                    <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, gap: 16 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent }} />
                                            <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>資產折線</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.green }} />
                                            <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>收入</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.red }} />
                                            <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>支出</Text>
                                        </View>
                                    </View>

                                    {(() => {
                                        const reversedPeriods = [...past12PeriodsData].reverse();
                                        const comboBarData: any[] = [];
                                        const comboLineData: any[] = [];
                                        reversedPeriods.forEach(d => {
                                            // 1. Income Bar (label under it, but we can center it subtly using spaces or just accept the left alignment)
                                            comboBarData.push({ value: d.income, label: d.shortLabel, spacing: 2, frontColor: COLORS.green });
                                            // 2. Expense Bar
                                            comboBarData.push({ value: d.expense, frontColor: COLORS.red });

                                            // Only ONE line data point per period!
                                            comboLineData.push({
                                                value: d.endBalance,
                                                dataPointText: Math.abs(d.endBalance) >= 1000 ? (d.endBalance / 1000).toFixed(0) + 'k' : Math.round(d.endBalance).toString(),
                                                textColor: COLORS.textPrimary,
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
                                                    color: COLORS.accent,
                                                    thickness: 3,
                                                    dataPointsColor: COLORS.accent,
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
                                                rulesColor={COLORS.divider}
                                                yAxisThickness={0}
                                                xAxisThickness={0}
                                                width={SCREEN_WIDTH - 60}
                                                height={160}
                                                yAxisTextStyle={{ color: COLORS.textMuted, fontSize: 10 }}
                                                xAxisLabelTextStyle={{ color: COLORS.textMuted, fontSize: 10 }}
                                            />
                                        );
                                    })()}
                                </View>
                            )}

                            {past12PeriodsData.map((data, index) => (
                                <View key={index} style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder, ...SHADOWS.sm }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <Text style={{ ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.textPrimary }}>{data.monthLabel}</Text>
                                        <Text style={{ ...TYPOGRAPHY.h3, color: COLORS.textPrimary }}>
                                            ${Math.round(data.endBalance).toLocaleString()}
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>總收入</Text>
                                        <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>${Math.round(data.income).toLocaleString()}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>總支出</Text>
                                        <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>${Math.round(data.expense).toLocaleString()}</Text>
                                    </View>
                                    <View style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: 8 }} />
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>淨變化</Text>
                                        <Text style={{ color: data.net >= 0 ? COLORS.green : COLORS.red, fontWeight: '700' }}>
                                            {data.net >= 0 ? '+' : '-'}${Math.abs(Math.round(data.net)).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </Animated.View>
                </BlurView>
            </Modal>

            {/* Dedicated Savings Rate Modal */}
            <Modal visible={savingsModalVisible} animationType="slide" transparent presentationStyle="overFullScreen">
                <BlurView intensity={30} tint="dark" style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setSavingsModalVisible(false)} />
                    <Animated.View entering={FadeInDown.springify()} style={{ backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '80%', ...SHADOWS.lg }}>
                        <View style={{ width: 40, height: 5, backgroundColor: COLORS.border, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.divider }}>
                            <Text style={{ ...TYPOGRAPHY.h3, letterSpacing: -0.3 }}>儲蓄率趨勢 (過去 12 期)</Text>
                            <Pressable onPress={() => setSavingsModalVisible(false)} style={({ pressed }) => [{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.accentLight, borderRadius: 16 }, pressed && { opacity: 0.8 }]}>
                                <Text style={{ color: COLORS.accent, fontWeight: '700', fontSize: 13 }}>關閉</Text>
                            </Pressable>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                            {/* Trend Chart (BarChart with dynamic red/green bars based on net amount) */}
                            {past12PeriodsData.length > 0 && (
                                <View style={{ backgroundColor: COLORS.card, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 10, marginBottom: 16, borderWidth: 1, borderColor: COLORS.divider, alignItems: 'center' }}>
                                    <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, alignSelf: 'flex-start', marginLeft: 16, marginBottom: 12 }}>過去 12 期淨存額與儲蓄率</Text>
                                    {(() => {
                                        const maxRate = Math.max(...past12PeriodsData.map(d => d.rate));
                                        const rateMaxValue = Math.max(0, maxRate + (maxRate * 0.15) + 15);
                                        return (
                                            <LineChartBicolor
                                                data={[...past12PeriodsData].reverse().map(d => ({
                                                    value: d.rate,
                                                    label: d.shortLabel,
                                                    dataPointText: Math.abs(d.net) >= 1000 ? (d.net > 0 ? '+' : '') + (d.net / 1000).toFixed(1) + 'k' : (d.net > 0 ? '+' : '') + Math.round(d.net).toString(),
                                                    textColor: d.net >= 0 ? COLORS.green : COLORS.red,
                                                    textShiftY: d.net >= 0 ? -12 : 12,
                                                    textFontSize: 10
                                                }))}
                                                maxValue={rateMaxValue}
                                                areaChart
                                                color={COLORS.green}
                                                colorNegative={COLORS.red}
                                                startFillColor={COLORS.green}
                                                endFillColor={COLORS.green}
                                                startFillColorNegative={COLORS.red}
                                                endFillColorNegative={COLORS.red}
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
                                                rulesColor={COLORS.divider}
                                                yAxisThickness={0}
                                                xAxisThickness={0}
                                                width={SCREEN_WIDTH - 60}
                                                height={160}
                                                yAxisTextStyle={{ color: COLORS.textMuted, fontSize: 10 }}
                                            />
                                        );
                                    })()}
                                </View>
                            )}

                            {/* List items ordered with newest period on top */}
                            {past12PeriodsData.map((data, index) => (
                                <View key={index} style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder, ...SHADOWS.sm }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <Text style={{ ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.textPrimary }}>{data.monthLabel}</Text>
                                        <View style={{ backgroundColor: data.rate >= 0 ? COLORS.greenLight : COLORS.redLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                            <Text style={{ color: data.rate >= 0 ? COLORS.green : COLORS.red, fontWeight: '800', fontSize: 13 }}>
                                                {data.rate.toFixed(1)}%
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>總收入</Text>
                                        <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>${Math.round(data.income).toLocaleString()}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>總支出</Text>
                                        <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>${Math.round(data.expense).toLocaleString()}</Text>
                                    </View>
                                    <View style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: 8 }} />
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>淨存額</Text>
                                        <Text style={{ color: data.net >= 0 ? COLORS.green : COLORS.red, fontWeight: '700' }}>
                                            {data.net >= 0 ? '+' : '-'}${Math.abs(Math.round(data.net)).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </Animated.View>
                </BlurView>
            </Modal>
        </ScrollView >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    // Empty
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg, padding: 20 },
    emptyTitle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 8, letterSpacing: -0.5 },
    emptySubtitle: { color: COLORS.textSecondary, fontSize: 15 },
    dateHeader: { backgroundColor: COLORS.headerBg, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.divider, ...SHADOWS.sm },
    // Filter (Segmented Control Style) // Removed in favor of inline text style
    // Summary Grid
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, gap: 14 },
    summaryCardContainer: { marginBottom: 0 },
    summaryCardWrapper: { borderRadius: 20, backgroundColor: COLORS.bg },
    summaryCardInner: { backgroundColor: COLORS.card, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: COLORS.cardBorder, borderTopWidth: 4, minHeight: 120, justifyContent: 'space-between', overflow: 'hidden' },
    summaryCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    summaryCardTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
    summaryCardValue: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
    summaryCardChange: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    summaryCardChangeText: { fontSize: 13, fontWeight: '700' },
    summaryCardChangeLabel: { color: COLORS.textMuted, fontSize: 11, marginLeft: 4 },
    tapHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 8, textAlign: 'right', fontWeight: '500' },
    // Chart Cards
    chartCard: { backgroundColor: COLORS.card, marginHorizontal: 16, marginTop: 20, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: COLORS.divider, ...SHADOWS.sm },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    sectionDot: { width: 4, height: 18, borderRadius: 2, marginRight: 10 },
    sectionTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    chartYLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '500' },
    chartXLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '500' },
    chartEmpty: { color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 40 },
    // Legend
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 12, height: 12, borderRadius: 4, marginRight: 6 },
    legendText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500' },
    // Account
    accountGroup: { backgroundColor: 'transparent' },
    accountGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
    accountGroupTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
    accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: 'transparent' },
    accountName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    accountBalance: { fontSize: 14, fontWeight: '800', flexShrink: 0 },
    // Category
    distBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: COLORS.bg, marginBottom: 16 },
    catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'transparent' },
    catRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    catDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
    catName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '500' },
    catRowRight: { flexDirection: 'row', alignItems: 'center' },
    catAmount: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', marginRight: 10 },
    catPct: { color: COLORS.textMuted, fontSize: 12, width: 45, textAlign: 'right', fontWeight: '500' },
});
