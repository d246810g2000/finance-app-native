
import React, { useMemo, useState, useCallback, useRef, memo } from 'react';
import { View, Text, ScrollView, Dimensions, Pressable, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { BarChart, LineChartBicolor } from 'react-native-gifted-charts';
import Animated, { FadeInDown, FadeInLeft } from 'react-native-reanimated';
import { useFinance } from '../../context/FinanceContext';
import { processAndAggregateRecords, transformRecordsForExport, filterAndSortRecords } from '../../services/financeService';
import { PERSONAL_ACCOUNTS, SHARED_ACCOUNTS, ASSET_CLASSES, getAssetClass } from '../../constants';
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
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { loadExcludedAccounts, saveExcludedAccounts } from '../../services/accountConfigService';
import AccountSettingsModal from '../../components/account/AccountSettingsModal';
import { useBottomSheetSwipe } from '../../components/ui/useBottomSheetSwipe';
import BottomSheetGestureWrapper from '../../components/ui/BottomSheetGestureWrapper';

const SCREEN_WIDTH = Dimensions.get('window').width;

type AccountViewType = 'all' | 'personal' | 'shared';

// ─── Summary Card ───
const SummaryCard = memo(function SummaryCard({ title, value, previousValue, isPercentage, invertColor, onPress, index, fullWidth, colors, styles }: {
    title: string; value: number; previousValue: number;
    isPercentage?: boolean; invertColor?: boolean; onPress?: () => void; index?: number; fullWidth?: boolean;
    colors: AppColors; styles: DashboardStyles;
}) {
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
        '資產': 'wallet-outline', '收入': 'arrow-up-circle-outline', '支出': 'arrow-down-circle-outline',
        '儲蓄率': 'pie-chart-outline', '日均消費': 'cafe-outline',
    };
    const accentMap: Record<string, string> = {
        '資產': colors.primary, '收入': colors.green, '支出': colors.red,
        '儲蓄率': colors.blue, '日均消費': colors.yellow,
    };

    return (
        <Animated.View entering={FadeInDown.delay((index || 0) * 80).springify()} style={[styles.summaryCardContainer, fullWidth ? { width: '100%' } : { width: '48%' }]}>
            <Pressable
                disabled={!onPress}
                onPress={onPress}
                accessibilityRole={onPress ? 'button' : 'text'}
                accessibilityLabel={`${title} ${displayValue}，${arrow}${Math.abs(diff).toFixed(1)}%，點擊查看詳細`}
                style={({ pressed }) => [
                    styles.summaryCardWrapper,
                    pressed && onPress ? { opacity: 0.88, transform: [{ scale: 0.97 }] } : null,
                ]}
            >
                <View style={[styles.summaryCardInner, { borderColor: colors.outlineVariant }]}>
                    <View style={[styles.summaryAccentStrip, { backgroundColor: accentMap[title] || colors.primary }]} />
                    <View style={styles.summaryCardBody}>
                        <View style={styles.summaryCardHeader}>
                            <IconCircle
                                name={iconMap[title] || 'stats-chart-outline'}
                                color={accentMap[title] || colors.primary}
                                size={34}
                                iconSize={18}
                            />
                            <Text style={styles.summaryCardTitle}>{title}</Text>
                        </View>
                        <Text style={styles.summaryCardValue} numberOfLines={1} adjustsFontSizeToFit selectable>
                            {displayValue}
                        </Text>
                        {!isNaN(previousValue) ? (
                            <View style={styles.summaryCardChange}>
                                <View style={[
                                    styles.summaryCardBadge,
                                    { backgroundColor: isPositive ? (invertColor ? colors.redLight : colors.greenLight) : (invertColor ? colors.greenLight : colors.redLight) }
                                ]}>
                                    <Text style={[styles.summaryCardChangeText, { color: changeColor }]}>
                                        {arrow} {isPercentage ? `${Math.abs(diff).toFixed(1)}%` : `${pctChange}%`}
                                    </Text>
                                </View>
                                <Text style={styles.summaryCardChangeLabel}>vs 上期</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </Pressable>
        </Animated.View>
    );
});

type AccountGroupForRatio = {
    category: string;
    totalBalance: number;
};

const AccountRatioPanel = memo(function AccountRatioPanel({
    groups,
    colors,
    assetClassColors,
}: {
    groups: AccountGroupForRatio[];
    colors: AppColors;
    assetClassColors: Record<string, string>;
}) {
    const assetGroups = useMemo(
        () => groups.filter(g => g.category !== '負債' && Math.abs(g.totalBalance) > 0),
        [groups]
    );
    const totalAssets = useMemo(
        () => assetGroups.reduce((sum, g) => sum + Math.abs(g.totalBalance), 0),
        [assetGroups]
    );
    const liabilityGroup = useMemo(
        () => groups.find(g => g.category === '負債'),
        [groups]
    );
    const totalLiabilities = liabilityGroup ? Math.abs(liabilityGroup.totalBalance) : 0;
    const hasLiabilities = totalLiabilities > 0;
    const liabilityPercentage = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
    const liabilityDisplayHeight = Math.min(Math.max(liabilityPercentage, 15), 90);

    return (
        <Animated.View entering={FadeInLeft.duration(300).springify().damping(15)} style={{ paddingHorizontal: 20, height: 420, flexDirection: 'row', width: '100%' }}>
            {hasLiabilities ? (
                <View style={{ flex: 0.8, justifyContent: 'flex-end', marginRight: 0 }}>
                    <View style={{
                        height: `${liabilityDisplayHeight}%`,
                        minHeight: 100,
                        backgroundColor: assetClassColors['負債'],
                        borderTopLeftRadius: RADIUS.sheet,
                        borderBottomLeftRadius: RADIUS.sheet,
                        padding: 16,
                        paddingTop: 24,
                        justifyContent: 'flex-start',
                    }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '800', opacity: 0.8, letterSpacing: -1, fontVariant: ['tabular-nums'] }} selectable>
                            {Math.round(liabilityPercentage)}%
                        </Text>
                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', opacity: 0.6, marginTop: 4 }}>
                            負債
                        </Text>
                    </View>
                </View>
            ) : null}

            <View style={{
                flex: 2,
                borderTopLeftRadius: RADIUS.sheet,
                borderTopRightRadius: RADIUS.sheet,
                borderBottomRightRadius: RADIUS.sheet,
                borderBottomLeftRadius: hasLiabilities ? 0 : RADIUS.sheet,
                overflow: 'hidden',
                flexDirection: 'column',
            }}>
                {assetGroups.map(group => {
                    const percentage = totalAssets > 0 ? (Math.abs(group.totalBalance) / totalAssets) * 100 : 0;
                    if (percentage === 0) return null;
                    return (
                        <View key={`ratio-${group.category}`} style={{
                            height: `${percentage}%`,
                            backgroundColor: assetClassColors[group.category],
                            justifyContent: 'flex-start',
                            padding: 16,
                            paddingTop: 24,
                        }}>
                            {percentage > 12 ? (
                                <View>
                                    <Text style={{ color: colors.textPrimary, fontSize: 36, fontWeight: '800', opacity: 0.8, letterSpacing: -1, lineHeight: 38, fontVariant: ['tabular-nums'] }} selectable>
                                        {Math.round(percentage)}%
                                    </Text>
                                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: 2 }}>
                                        {group.category}
                                    </Text>
                                </View>
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', opacity: 0.8, fontVariant: ['tabular-nums'] }} selectable>
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
        </Animated.View>
    );
});

// ─── Account Tree Sub-components (memoized for smooth expand/collapse) ───

interface AccountInfo {
    name: string;
    balance: number;
    originalCategory: string;
}

interface AccountSubGroupData {
    name: string;
    accounts: AccountInfo[];
    totalBalance: number;
}

interface AccountGroupData {
    category: string;
    accounts: AccountInfo[];
    subGroups: AccountSubGroupData[];
    isCollapsed: boolean;
    totalBalance: number;
    percentage: number;
}

type DashboardStyles = ReturnType<typeof createStyles>;

const AccountRow = memo(function AccountRow({
    account,
    colors,
    styles,
    onPress,
}: {
    account: AccountInfo;
    colors: AppColors;
    styles: DashboardStyles;
    onPress: (name: string) => void;
}) {
    return (
        <Pressable
            onPress={() => onPress(account.name)}
            style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${account.name}，餘額 ${Math.abs(account.balance).toLocaleString()} 元`}
        >
            <View style={styles.accountNameWrap}>
                <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
            </View>
            <View style={styles.accountAmountWrap}>
                <Text style={[styles.accountAmount, { color: account.balance >= 0 ? colors.green : colors.red }]}>
                    {account.balance < 0 ? '-' : ''}{Math.abs(account.balance).toLocaleString()}
                </Text>
            </View>
        </Pressable>
    );
});

const AccountSubGroupCard = memo(function AccountSubGroupCard({
    sub,
    accentColor,
    isExpanded,
    colors,
    styles,
    onToggle,
    onAccountPress,
}: {
    sub: AccountSubGroupData;
    accentColor: string;
    isExpanded: boolean;
    colors: AppColors;
    styles: DashboardStyles;
    onToggle: (subId: string) => void;
    onAccountPress: (name: string) => void;
}) {
    const subId = sub.name;
    return (
        <View style={[styles.subGroupCard, SHADOWS.sm]}>
            <View style={[styles.accentStrip, { backgroundColor: accentColor }]} />
            <Pressable
                onPress={() => onToggle(subId)}
                android_ripple={{ color: colors.statePressed, borderless: false }}
                style={({ pressed }) => [pressed && styles.subGroupHeaderPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${sub.name}，合計 ${Math.abs(sub.totalBalance).toLocaleString()} 元，${isExpanded ? '收起' : '展開'}帳戶`}
                accessibilityState={{ expanded: isExpanded }}
            >
                <View style={styles.subGroupHeader}>
                    <View style={styles.subGroupHeaderLeft}>
                        <View style={styles.subGroupIconCircle}>
                            <Ionicons name="wallet-outline" size={18} color={accentColor} />
                        </View>
                        <View style={styles.subGroupNameWrap}>
                            <Text style={[styles.subGroupName, { color: accentColor }]} numberOfLines={1}>
                                {sub.name}
                            </Text>
                            {!isExpanded && (
                                <Text style={styles.subGroupPreview} numberOfLines={1}>
                                    {sub.accounts.length > 0 ? sub.accounts.map(a => a.name).join('、') : '無帳戶'}
                                </Text>
                            )}
                        </View>
                    </View>
                    <View style={styles.amountAlignRight}>
                        <Text style={[styles.subGroupAmount, { color: accentColor }]}>
                            {sub.totalBalance >= 0 ? '' : '⊖ '}{Math.abs(sub.totalBalance).toLocaleString()}
                        </Text>
                    </View>
                </View>
            </Pressable>

            {isExpanded && (
                <View style={styles.accountListWrap}>
                    <View style={styles.accountDivider} />
                    {sub.accounts.map(acc => (
                        <AccountRow
                            key={acc.name}
                            account={acc}
                            colors={colors}
                            styles={styles}
                            onPress={onAccountPress}
                        />
                    ))}
                </View>
            )}
        </View>
    );
});

const AccountGroupCard = memo(function AccountGroupCard({
    group,
    accentColor,
    expandedSubGroups,
    colors,
    typography: typo,
    styles,
    onToggleGroup,
    onToggleSubGroup,
    onAccountPress,
}: {
    group: AccountGroupData;
    accentColor: string;
    expandedSubGroups: Record<string, boolean>;
    colors: AppColors;
    typography: ReturnType<typeof useAppTheme>['typography'];
    styles: DashboardStyles;
    onToggleGroup: (category: string) => void;
    onToggleSubGroup: (subId: string) => void;
    onAccountPress: (name: string) => void;
}) {
    const uniqueCategories = useMemo(
        () => Array.from(new Set(group.accounts.map(a => a.originalCategory))).join('、'),
        [group.accounts]
    );

    return (
        <View>
            <View style={[
                styles.groupCard,
                { backgroundColor: group.isCollapsed ? colors.surfaceContainer : accentColor },
                group.isCollapsed && SHADOWS.sm,
            ]}>
                <Pressable
                    onPress={() => onToggleGroup(group.category)}
                    android_ripple={{ color: colors.statePressed, borderless: false, radius: 200 }}
                    style={({ pressed }) => [pressed && styles.groupCardPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`${group.category}，合計 ${Math.abs(group.totalBalance).toLocaleString()} 元，${group.isCollapsed ? '展開' : '收起'}分類`}
                    accessibilityState={{ expanded: !group.isCollapsed }}
                >
                    <View style={styles.groupCardInner}>
                        <View style={styles.groupCardLeft}>
                            {group.isCollapsed ? (
                                <>
                                    <View style={styles.groupTitleRow}>
                                        <Text style={[typo.body, styles.groupTitle, { color: colors.textPrimary }]}>
                                            {group.category}
                                        </Text>
                                        {group.accounts.length > 0 && (
                                            <View style={styles.groupCountBadge}>
                                                <Text style={[styles.groupCountText, { color: accentColor }]}>
                                                    {group.accounts.length} 筆資產
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    {group.accounts.length > 0 && (
                                        <Text style={styles.groupSubtitle} numberOfLines={1}>{uniqueCategories}</Text>
                                    )}
                                </>
                            ) : (
                                <View style={styles.groupTitleRow}>
                                    <Text style={[typo.body, styles.groupTitle, { color: colors.textPrimary }]}>
                                        {group.category}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <View style={styles.amountAlignRight}>
                            <Text style={styles.groupAmount}>
                                {group.totalBalance >= 0 ? '' : '⊖ '}{Math.abs(group.totalBalance).toLocaleString()}
                            </Text>
                        </View>
                    </View>
                </Pressable>
            </View>

            {!group.isCollapsed && group.subGroups.length > 0 && (
                <View style={styles.subGroupList}>
                    {group.subGroups.map(sub => {
                        const subId = `${group.category}-${sub.name}`;
                        const isSubExpanded = !!expandedSubGroups[subId];
                        return (
                            <AccountSubGroupCard
                                key={subId}
                                sub={{ ...sub, name: subId }}
                                accentColor={accentColor}
                                isExpanded={isSubExpanded}
                                colors={colors}
                                styles={styles}
                                onToggle={onToggleSubGroup}
                                onAccountPress={onAccountPress}
                            />
                        );
                    })}
                </View>
            )}
        </View>
    );
});

export default function DashboardScreen() {
    const { records, budgetConfig } = useFinance();
    const { colors, typography, assetClassColors } = useAppTheme();
    const isFocused = useIsFocused();
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

    const lastAggregation = useRef<{
        aggregatedSummary: AccountsSummaryMap;
        dailyTrend: TrendDataPoint[];
        periodSummary: { totalBalance: number; totalIncome: number; totalExpense: number };
        previousPeriodSummary: { totalBalance: number; totalIncome: number; totalExpense: number };
    } | null>(null);

    const { aggregatedSummary, dailyTrend, periodSummary, previousPeriodSummary } = useMemo(() => {
        if (!isFocused && lastAggregation.current) return lastAggregation.current;
        if (records.length === 0) return {
            aggregatedSummary: {} as AccountsSummaryMap,
            dailyTrend: [] as TrendDataPoint[],
            periodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 },
            previousPeriodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 },
        };
        const next = processAndAggregateRecords(
            records,
            startDate,
            endDate,
            accountFilter,
            excludedAccounts,
            !!budgetConfig.isSplitEnabled,
        );
        lastAggregation.current = next;
        return next;
    }, [isFocused, records, startDate, endDate, accountFilter, excludedAccounts, budgetConfig.isSplitEnabled]);

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
                <Text style={styles.controlLabel}>帳戶範圍</Text>
                <SegmentedControl
                    options={[
                        { value: 'all', label: '全部', icon: 'apps-outline' },
                        { value: 'personal', label: '個人', icon: 'person-outline' },
                        { value: 'shared', label: '共享', icon: 'people-outline' },
                    ]}
                    value={accountViewType}
                    onChange={setAccountViewType}
                    colors={colors}
                    variant="filter"
                    accessibilityLabel="帳戶範圍篩選"
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
                    <View style={styles.accountViewToolbar}>
                        <View style={styles.accountViewCopy}>
                            <Text style={styles.accountViewTitle}>{showRatioView ? '資產分配' : '帳戶明細'}</Text>
                            <Text style={styles.accountViewSubtitle}>{showRatioView ? '依資產類別檢視佔比' : '點擊類別展開帳戶'}</Text>
                        </View>
                        <SegmentedControl
                            options={[
                                { value: 'list', label: '列表', icon: 'list-outline' },
                                { value: 'ratio', label: '比例', icon: 'pie-chart-outline' },
                            ]}
                            value={showRatioView ? 'ratio' : 'list'}
                            onChange={(v) => setShowRatioView(v === 'ratio')}
                            variant="view"
                            accessibilityLabel="帳戶檢視模式"
                        />
                    </View>

                    {showRatioView ? (
                        <AccountRatioPanel
                            groups={accountTableData.groups}
                            colors={colors}
                            assetClassColors={assetClassColors}
                        />
                    ) : (
                        <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.accountListContainer}>
                            {accountTableData.groups.filter(g => g.accounts.length > 0).map(group => (
                                <AccountGroupCard
                                    key={`list-${group.category}`}
                                    group={group}
                                    accentColor={assetClassColors[group.category]}
                                    expandedSubGroups={expandedSubGroups}
                                    colors={colors}
                                    typography={typography}
                                    styles={styles}
                                    onToggleGroup={toggleGroup}
                                    onToggleSubGroup={toggleSubGroup}
                                    onAccountPress={handleAccountClick}
                                />
                            ))}
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
                        style={[styles.modalSheet, { height: '85%' }, withContinuousRadius(RADIUS.xl)]}
                        header={(
                            <>
                                <View style={styles.modalHandleBar} />
                                <SheetHeader title="資產趨勢與未來預估" onClose={() => setBalanceModalVisible(false)} style={{ backgroundColor: 'transparent' }} />
                            </>
                        )}
                    >
                        <GHScrollView
                            contentContainerStyle={styles.modalScrollContent}
                            onScroll={balanceSwipe.handleScroll}
                            scrollEventThrottle={balanceSwipe.scrollEventThrottle}
                        >

                            {/* Future Wealth Projection Card */}
                            {(() => {
                                const avgNetIncome = past12PeriodsData.reduce((sum, d) => sum + d.net, 0) / 12;
                                return (
                                    <View style={styles.projectionCard}>
                                        <View style={styles.projectionHeader}>
                                            <Ionicons name="sparkles-outline" size={18} color={colors.primary} style={styles.projectionIcon} />
                                            <Text style={{ ...typography.body, fontWeight: '800', color: colors.primary }}>未來財富預估</Text>
                                        </View>
                                        <Text style={[typography.bodySm, styles.projectionDesc, { color: colors.textSecondary }]}>
                                            根據過去 12 期平均淨存額 <Text style={{ fontWeight: '700', color: avgNetIncome >= 0 ? colors.green : colors.red }}>${Math.round(avgNetIncome).toLocaleString()}</Text> 推算：
                                        </Text>

                                        <View style={[styles.projectionGrid, SHADOWS.sm]}>
                                            <View style={styles.projectionCol}>
                                                <Text style={styles.projectionLabel}>半年後</Text>
                                                <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 6).toLocaleString()}</Text>
                                            </View>
                                            <View style={styles.projectionCol}>
                                                <Text style={styles.projectionLabel}>一年後</Text>
                                                <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 12).toLocaleString()}</Text>
                                            </View>
                                            <View style={styles.projectionColLast}>
                                                <Text style={styles.projectionLabel}>五年後</Text>
                                                <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>${Math.round(periodSummary.totalBalance + avgNetIncome * 60).toLocaleString()}</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })()}

                            {past12PeriodsData.length > 0 && (
                                <View style={styles.chartCard}>
                                    <Text style={[typography.caption, styles.chartCardTitle, { color: colors.textMuted }]}>過去 12 期資產與收支組合走勢</Text>

                                    <View style={styles.modalLegendRow}>
                                        <View style={styles.modalLegendEntry}>
                                            <View style={[styles.legendDotRound, { backgroundColor: colors.primary }]} />
                                            <Text style={styles.modalLegendText}>資產折線</Text>
                                        </View>
                                        <View style={styles.modalLegendEntry}>
                                            <View style={[styles.legendDotSquare, { backgroundColor: colors.green }]} />
                                            <Text style={styles.modalLegendText}>收入</Text>
                                        </View>
                                        <View style={styles.modalLegendEntry}>
                                            <View style={[styles.legendDotSquare, { backgroundColor: colors.red }]} />
                                            <Text style={styles.modalLegendText}>支出</Text>
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
                                                    color: colors.primary,
                                                    thickness: 3,
                                                    dataPointsColor: colors.primary,
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
                                <View key={index} style={[styles.periodCard, SHADOWS.sm]}>
                                    <View style={styles.periodCardHeader}>
                                        <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>{data.monthLabel}</Text>
                                        <Text style={{ ...typography.h3, color: colors.textPrimary }}>
                                            ${Math.round(data.endBalance).toLocaleString()}
                                        </Text>
                                    </View>

                                    <View style={styles.statRow}>
                                        <Text style={styles.statLabel}>總收入</Text>
                                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${Math.round(data.income).toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <Text style={styles.statLabel}>總支出</Text>
                                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${Math.round(data.expense).toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={[styles.statRow, { marginBottom: 0 }]}>
                                        <Text style={styles.statLabel}>淨變化</Text>
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
                        style={[styles.modalSheet, { height: '80%' }, withContinuousRadius(RADIUS.xl)]}
                        header={(
                            <>
                                <View style={styles.modalHandleBar} />
                                <SheetHeader title="儲蓄率趨勢 (過去 12 期)" onClose={() => setSavingsModalVisible(false)} style={{ backgroundColor: 'transparent' }} />
                            </>
                        )}
                    >
                        <GHScrollView
                            contentContainerStyle={styles.modalScrollContent}
                            onScroll={savingsSwipe.handleScroll}
                            scrollEventThrottle={savingsSwipe.scrollEventThrottle}
                        >
                            {/* Trend Chart (BarChart with dynamic red/green bars based on net amount) */}
                            {past12PeriodsData.length > 0 && (
                                <View style={styles.chartCard}>
                                    <Text style={[typography.caption, styles.chartCardTitle, { color: colors.textMuted }]}>過去 12 期淨存額與儲蓄率</Text>
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
                                <View key={index} style={[styles.periodCard, SHADOWS.sm]}>
                                    <View style={styles.periodCardHeader}>
                                        <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary }}>{data.monthLabel}</Text>
                                        <View style={[styles.rateBadge, { backgroundColor: data.rate >= 0 ? colors.greenLight : colors.redLight }]}>
                                            <Text style={{ color: data.rate >= 0 ? colors.green : colors.red, fontWeight: '800', fontSize: 13 }}>
                                                {data.rate.toFixed(1)}%
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.statRow}>
                                        <Text style={styles.statLabel}>總收入</Text>
                                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${Math.round(data.income).toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <Text style={styles.statLabel}>總支出</Text>
                                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${Math.round(data.expense).toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={[styles.statRow, { marginBottom: 0 }]}>
                                        <Text style={styles.statLabel}>淨存額</Text>
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
    container: { flex: 1, backgroundColor: colors.surface },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, padding: 20 },
    filterSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 0,
        gap: 8,
    },
    controlLabel: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
    accountViewToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14, gap: 12 },
    accountViewCopy: { flex: 1 },
    accountViewTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    accountViewSubtitle: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600', marginTop: 3 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, gap: 14 },
    summaryCardContainer: { marginBottom: 0 },
    summaryCardWrapper: { ...withContinuousRadius(RADIUS.md), backgroundColor: colors.surface },
    summaryCardInner: {
        flexDirection: 'row',
        backgroundColor: colors.surfaceContainer,
        ...withContinuousRadius(RADIUS.md),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
        minHeight: 124,
        overflow: 'hidden',
    },
    summaryAccentStrip: { width: 3 },
    summaryCardBody: { flex: 1, padding: 14, justifyContent: 'space-between', gap: 4 },
    summaryCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    summaryCardTitle: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
    summaryCardValue: { color: colors.onSurface, fontSize: 24, fontWeight: '800', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
    summaryCardChange: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
    summaryCardBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs },
    summaryCardChangeText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
    summaryCardChangeLabel: { color: colors.onSurfaceVariant, fontSize: 11, fontWeight: '500' },
    tapHint: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'right', fontWeight: '500' },
    modalChartCard: {
        backgroundColor: colors.surfaceContainer,
        marginHorizontal: 16,
        marginTop: 20,
        ...withContinuousRadius(RADIUS.md),
        padding: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
    },
    chartYLabel: { color: colors.onSurfaceVariant, fontSize: 10, fontWeight: '500' },
    chartXLabel: { color: colors.onSurfaceVariant, fontSize: 10, fontWeight: '500' },
    chartEmpty: { color: colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 40 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 12, height: 12, borderRadius: 4, marginRight: 6 },
    legendText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '500' },
    accountGroup: { backgroundColor: 'transparent' },
    accountGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant, minHeight: 48 },
    accountGroupTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '800' },
    accountBalance: { fontSize: 14, fontWeight: '800', flexShrink: 0, fontVariant: ['tabular-nums'] },
    distBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surfaceVariant, marginBottom: 16 },
    catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'transparent', minHeight: 40 },
    catRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    catDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
    catName: { color: colors.onSurface, fontSize: 14, fontWeight: '500' },
    catRowRight: { flexDirection: 'row', alignItems: 'center' },
    catAmount: { color: colors.onSurface, fontSize: 14, fontWeight: '700', marginRight: 10, fontVariant: ['tabular-nums'] },
    catPct: { color: colors.onSurfaceVariant, fontSize: 12, width: 45, textAlign: 'right', fontWeight: '500' },
    accountListContainer: { marginHorizontal: 20, gap: 12 },
    groupCard: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    groupCardPressed: { opacity: 0.8 },
    groupCardInner: {
        paddingLeft: 28,
        paddingRight: 20,
        paddingVertical: 18,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    groupCardLeft: { flex: 1, marginRight: 12 },
    groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    groupTitle: { fontSize: 18, fontWeight: '700' },
    groupCountBadge: {
        backgroundColor: colors.primaryContainer,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    groupCountText: { fontSize: 10, fontWeight: '700' },
    groupSubtitle: { color: colors.textMuted, fontSize: 12 },
    groupAmount: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    amountAlignRight: { alignItems: 'flex-end', flexShrink: 0 },
    subGroupList: { paddingTop: 12, gap: 12 },
    subGroupCard: {
        borderRadius: 16,
        backgroundColor: colors.surfaceContainer,
        overflow: 'hidden',
    },
    accentStrip: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 6,
        zIndex: 1,
    },
    subGroupHeaderPressed: { backgroundColor: colors.surfaceVariant },
    subGroupHeader: {
        paddingLeft: 24,
        paddingRight: 20,
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    subGroupHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    subGroupIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.primaryContainer,
        justifyContent: 'center',
        alignItems: 'center',
    },
    subGroupNameWrap: { flex: 1, marginRight: 8 },
    subGroupName: { fontSize: 16, fontWeight: '700' },
    subGroupPreview: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
    subGroupAmount: { fontSize: 17, fontWeight: '800' },
    accountListWrap: {
        paddingLeft: 24,
        paddingRight: 20,
        paddingBottom: 20,
        paddingTop: 6,
        gap: 12,
    },
    accountDivider: { height: 1, backgroundColor: colors.divider, marginBottom: 8 },
    accountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
    },
    accountRowPressed: { opacity: 0.7 },
    accountNameWrap: { flex: 1, marginRight: 12 },
    accountName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
    accountAmountWrap: { alignItems: 'flex-end', flexShrink: 0 },
    accountAmount: { fontSize: 16, fontWeight: '800' },
    // Bottom-sheet modal shared styles
    modalSheet: {
        backgroundColor: colors.surface,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        paddingBottom: 40,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
        borderBottomWidth: 0,
    },
    modalHandleBar: {
        width: 40,
        height: 5,
        backgroundColor: colors.border,
        borderRadius: 3,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    modalScrollContent: { padding: 16, paddingBottom: 40 },
    projectionCard: {
        backgroundColor: colors.primaryContainer,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
    },
    projectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    projectionIcon: { marginRight: 8 },
    projectionDesc: { marginBottom: 16, lineHeight: 20 },
    projectionGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceContainer,
        padding: 12,
        borderRadius: 12,
    },
    projectionCol: { alignItems: 'center', flex: 1, borderRightWidth: 1, borderRightColor: colors.divider },
    projectionColLast: { alignItems: 'center', flex: 1 },
    projectionLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
    chartCard: {
        backgroundColor: colors.surfaceContainer,
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 10,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.divider,
        alignItems: 'center',
    },
    chartCardTitle: { alignSelf: 'flex-start', marginLeft: 16, marginBottom: 12 },
    modalLegendRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16, gap: 16 },
    modalLegendEntry: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDotRound: { width: 8, height: 8, borderRadius: 4 },
    legendDotSquare: { width: 8, height: 8, borderRadius: 2 },
    modalLegendText: { color: colors.textMuted, fontSize: 11 },
    periodCard: {
        backgroundColor: colors.surfaceContainer,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
    },
    periodCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    statDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 8 },
    statLabel: { color: colors.textMuted, fontSize: 13 },
    statValue: { color: colors.textPrimary, fontWeight: '600' },
    rateBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    rateText: { fontWeight: '800', fontSize: 13 },
});
