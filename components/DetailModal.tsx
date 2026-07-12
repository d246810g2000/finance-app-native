import React, { useMemo, useCallback, useState } from 'react';
import {
    View, Text, Pressable, Modal, StyleSheet,
    TouchableWithoutFeedback,
} from 'react-native';
import { FlatList, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, SHADOWS, CATEGORY_COLORS, RADIUS, withContinuousRadius } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import ModalBackdrop from './ui/ModalBackdrop';
import SegmentedControl from './ui/SegmentedControl';
import SortChips from './ui/SortChips';
import SheetHeader from './ui/SheetHeader';
import { useBottomSheetSwipe } from './ui/useBottomSheetSwipe';
import BottomSheetGestureWrapper from './ui/BottomSheetGestureWrapper';
import { TransformedRecord } from '../types';

type SortKey = '日期' | '金額' | '主類別' | '商家';
type SortDir = 'asc' | 'desc';
type ViewMode = 'list' | 'stats';

interface DetailModalProps {
    visible: boolean;
    title: string;
    records: TransformedRecord[];
    onClose: () => void;
}

const getRecordName = (r: TransformedRecord): string => {
    const parts = [r['主類別']];
    if (r['子類別']) parts.push(r['子類別']);
    if (r['商家']) parts.push(`(${r['商家']})`);
    return parts.join(' · ');
};

// ─── Stats View ───
function StatsView({ records, onScroll, colors, statsStyles }: { records: TransformedRecord[], onScroll: (e: any) => void, colors: AppColors, statsStyles: ReturnType<typeof createStatsStyles> }) {
    const expenses = useMemo(() => records.filter(r => r['金額'] < 0), [records]);
    const incomes = useMemo(() => records.filter(r => r['金額'] > 0), [records]);

    const stats = useMemo(() => {
        const totalExp = expenses.reduce((s, r) => s + Math.abs(r['金額']), 0);
        const totalInc = incomes.reduce((s, r) => s + r['金額'], 0);
        const avgExp = expenses.length > 0 ? totalExp / expenses.length : 0;
        const maxExp = expenses.length > 0 ? Math.max(...expenses.map(r => Math.abs(r['金額']))) : 0;
        const maxExpRecord = expenses.find(r => Math.abs(r['金額']) === maxExp);
        return { totalExp, totalInc, avgExp, maxExp, maxExpRecord, expCount: expenses.length, incCount: incomes.length };
    }, [expenses, incomes]);

    // Category breakdown
    const categoryData = useMemo(() => {
        const catMap: { [key: string]: number } = {};
        expenses.forEach(r => {
            const cat = r['主類別'] || '未分類';
            catMap[cat] = (catMap[cat] || 0) + Math.abs(r['金額']);
        });
        return Object.entries(catMap)
            .map(([name, value]) => ({ name, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [expenses]);

    const totalCategoryExpense = categoryData.reduce((s, c) => s + c.value, 0);

    // Merchant top 5
    const merchantData = useMemo(() => {
        const mMap: { [key: string]: number } = {};
        expenses.forEach(r => {
            const m = r['商家'] || '(無商家)';
            mMap[m] = (mMap[m] || 0) + Math.abs(r['金額']);
        });
        return Object.entries(mMap)
            .map(([name, value]) => ({ name, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [expenses]);

    const maxMerchantValue = merchantData.length > 0 ? merchantData[0].value : 1;

    if (records.length === 0) {
        return (
            <View style={statsStyles.emptyView}>
                <Text style={statsStyles.emptyText}>無數據可分析</Text>
            </View>
        );
    }

    return (
        <ScrollView
            contentContainerStyle={{ paddingBottom: 60 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
        >
            {/* Summary Stats Cards */}
            <View style={statsStyles.cardsRow}>
                <View style={[statsStyles.statCard, { backgroundColor: colors.accentLight }]}>
                    <Text style={statsStyles.statLabel}>筆數</Text>
                    <Text style={[statsStyles.statValue, { color: colors.accent }]}>{records.length}</Text>
                    <Text style={statsStyles.statSub}>{stats.expCount} 支出 · {stats.incCount} 收入</Text>
                </View>
                <View style={[statsStyles.statCard, { backgroundColor: colors.redLight }]}>
                    <Text style={statsStyles.statLabel}>平均支出</Text>
                    <Text style={[statsStyles.statValue, { color: colors.red }]}>${Math.round(stats.avgExp).toLocaleString()}</Text>
                    <Text style={statsStyles.statSub}>每筆</Text>
                </View>
            </View>

            {/* Max single expense */}
            {stats.maxExpRecord ? (
                <View style={statsStyles.maxCard}>
                    <View style={statsStyles.maxHeader}>
                        <Text style={statsStyles.maxIcon}>💸</Text>
                        <Text style={statsStyles.maxTitle}>最大單筆支出</Text>
                    </View>
                    <View style={statsStyles.maxBody}>
                        <Text style={statsStyles.maxName} numberOfLines={1}>{getRecordName(stats.maxExpRecord)}</Text>
                        <Text style={statsStyles.maxAmount}>${stats.maxExp.toLocaleString()}</Text>
                    </View>
                    <Text style={statsStyles.maxDate}>{stats.maxExpRecord['日期']}</Text>
                </View>
            ) : null}

            {/* Category Breakdown */}
            {categoryData.length > 0 ? (
                <View style={statsStyles.section}>
                    <Text style={statsStyles.sectionTitle}>支出類別分佈</Text>
                    {/* Distribution bar */}
                    <View style={statsStyles.distBar}>
                        {categoryData.map((cat, idx) => (
                            <View key={cat.name} style={{
                                width: `${totalCategoryExpense > 0 ? (cat.value / totalCategoryExpense) * 100 : 0}%` as any,
                                backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] as string,
                                height: '100%',
                            }} />
                        ))}
                    </View>
                    {categoryData.map((cat, idx) => {
                        const pct = totalCategoryExpense > 0 ? (cat.value / totalCategoryExpense) * 100 : 0;
                        return (
                            <View key={cat.name} style={statsStyles.catRow}>
                                <View style={statsStyles.catLeft}>
                                    <View style={[statsStyles.catDot, { backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] as string }]} />
                                    <Text style={statsStyles.catName}>{cat.name}</Text>
                                </View>
                                <View style={statsStyles.catRight}>
                                    <Text style={statsStyles.catAmount}>${cat.value.toLocaleString()}</Text>
                                    <Text style={statsStyles.catPct}>{pct.toFixed(1)}%</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ) : null}

            {/* Merchant Top 5 */}
            {merchantData.length > 0 ? (
                <View style={statsStyles.section}>
                    <Text style={statsStyles.sectionTitle}>商家排行 Top 5</Text>
                    {merchantData.map((m, idx) => {
                        const barWidth = (m.value / maxMerchantValue) * 100;
                        return (
                            <View key={m.name} style={statsStyles.merchantRow}>
                                <View style={statsStyles.merchantLeft}>
                                    <Text style={statsStyles.merchantRank}>{idx + 1}</Text>
                                    <Text style={statsStyles.merchantName} numberOfLines={1}>{m.name}</Text>
                                </View>
                                <View style={statsStyles.merchantBarContainer}>
                                    <View style={[statsStyles.merchantBar, { width: `${barWidth}%` as any }]} />
                                </View>
                                <Text style={statsStyles.merchantAmount}>${m.value.toLocaleString()}</Text>
                            </View>
                        );
                    })}
                </View>
            ) : null}
        </ScrollView>
    );
}

// ─── Main Component ───
export default function DetailModal({ visible, title, records, onClose }: DetailModalProps) {
    const { colors, typography, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const statsStyles = useMemo(() => createStatsStyles(colors, typography), [colors, typography]);
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [sortKey, setSortKey] = useState<SortKey>('日期');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const swipe = useBottomSheetSwipe(onClose, visible, { enableHorizontalDismiss: true });

    const sorted = useMemo(() => {
        const data = [...records];
        data.sort((a, b) => {
            let va: string | number;
            let vb: string | number;
            switch (sortKey) {
                case '日期': va = a['日期'] || ''; vb = b['日期'] || ''; break;
                case '金額': va = a['金額']; vb = b['金額']; break;
                case '主類別': va = a['主類別'] || ''; vb = b['主類別'] || ''; break;
                case '商家': va = a['商家'] || ''; vb = b['商家'] || ''; break;
                default: va = ''; vb = '';
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return data;
    }, [records, sortKey, sortDir]);

    const totalIncome = useMemo(() => sorted.filter(r => r['金額'] > 0).reduce((s, r) => s + r['金額'], 0), [sorted]);
    const totalExpense = useMemo(() => sorted.filter(r => r['金額'] < 0).reduce((s, r) => s + Math.abs(r['金額']), 0), [sorted]);

    const renderItem = useCallback(({ item }: { item: TransformedRecord }) => (
        <View style={styles.row}>
            <View style={styles.rowLeft}>
                <Text style={styles.rowName} numberOfLines={1}>{getRecordName(item)}</Text>
                <Text style={styles.rowMeta}>{item['日期']}{item['專案'] ? ` · ${item['專案']}` : ''}</Text>
                {item['描述'] ? <Text style={styles.rowDesc} numberOfLines={1}>{item['描述']}</Text> : null}
            </View>
            <Text style={[styles.rowAmount, item['金額'] >= 0 ? styles.amountGreen : styles.amountRed]}>
                {item['金額'] >= 0 ? '+' : '-'}${Math.abs(item['金額']).toLocaleString()}
            </Text>
        </View>
    ), [styles]);

    return (
        <Modal visible={visible} animationType="none" transparent presentationStyle="overFullScreen">
            <ModalBackdrop colors={colors} isDark={isDark}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.dismissArea} />
                </TouchableWithoutFeedback>
                <BottomSheetGestureWrapper
                    swipe={swipe}
                    style={[styles.container, { paddingBottom: insets.bottom + 16 }]}
                    header={(
                        <>
                            <View style={styles.handleBar} />
                            <SheetHeader title={title} subtitle={`${sorted.length} 筆記錄`} onClose={onClose} />
                        </>
                    )}
                >

                    {/* Summary */}
                    <View style={styles.summaryRow}>
                        <View style={[styles.summaryItem, { backgroundColor: colors.greenLight }]}>
                            <Text style={[styles.summaryLabel, { color: colors.green }]}>收入</Text>
                            <Text style={[styles.summaryValue, { color: colors.green }]}>${totalIncome.toLocaleString()}</Text>
                        </View>
                        <View style={[styles.summaryItem, { backgroundColor: colors.redLight }]}>
                            <Text style={[styles.summaryLabel, { color: colors.red }]}>支出</Text>
                            <Text style={[styles.summaryValue, { color: colors.red }]}>${totalExpense.toLocaleString()}</Text>
                        </View>
                    </View>

                    {/* View Mode Toggle */}
                    <View style={styles.modeRow}>
                        <SegmentedControl
                            options={[
                                { value: 'list', label: '列表' },
                                { value: 'stats', label: '統計' },
                            ]}
                            value={viewMode}
                            onChange={setViewMode}
                            accessibilityLabel="檢視模式"
                        />
                    </View>

                    {/* Content */}
                    {viewMode === 'list' ? (
                        <>
                            {/* Sort Chips */}
                            <View style={styles.sortRowWrapper}>
                                <SortChips
                                    options={[
                                        { key: '日期', label: '日期' },
                                        { key: '金額', label: '金額' },
                                        { key: '主類別', label: '類別' },
                                        { key: '商家', label: '商家' },
                                    ]}
                                    activeKey={sortKey}
                                    direction={sortDir}
                                    onChange={(key, direction) => { setSortKey(key); setSortDir(direction); }}
                                />
                            </View>

                            {/* Records List */}
                            <FlatList
                                data={sorted}
                                renderItem={renderItem}
                                keyExtractor={(_, i) => i.toString()}
                                contentContainerStyle={{ paddingBottom: 40 }}
                                initialNumToRender={15}
                                onScroll={swipe.handleScroll}
                                scrollEventThrottle={swipe.scrollEventThrottle}
                                maxToRenderPerBatch={10}
                                ListEmptyComponent={
                                    <View style={styles.emptyView}>
                                        <Text style={styles.emptyText}>無交易記錄</Text>
                                    </View>
                                }
                            />
                        </>
                    ) : (
                        <StatsView
                            records={records}
                            colors={colors}
                            statsStyles={statsStyles}
                            onScroll={swipe.handleScroll}
                        />
                    )}
                </BottomSheetGestureWrapper>
            </ModalBackdrop>
        </Modal>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    blurOverlay: { flex: 1, justifyContent: 'flex-end' },
    dismissArea: { flex: 1, width: '100%' },
    container: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '90%', ...SHADOWS.lg },
    handleBar: { width: 40, height: 5, backgroundColor: colors.border, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
    // Summary
    summaryRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    summaryItem: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', ...SHADOWS.sm },
    summaryLabel: { ...typography.caption },
    summaryValue: { fontSize: 18, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
    // Mode Toggle
    modeRow: { paddingHorizontal: 16, paddingBottom: 12 },
    modeToggle: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.divider, ...SHADOWS.sm },
    modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    modeBtnActive: { backgroundColor: colors.accentLight, ...SHADOWS.sm },
    modeBtnText: { ...typography.subtitle, color: colors.textMuted },
    modeBtnTextActive: { color: colors.accent, fontWeight: '700' },
    // Sort
    sortRowWrapper: { paddingBottom: 12 },
    // Rows
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.divider },
    rowLeft: { flex: 1, marginRight: 16 },
    rowName: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    rowMeta: { ...typography.caption, marginTop: 4 },
    rowDesc: { ...typography.bodySm, marginTop: 4 },
    rowAmount: { fontSize: 16, fontWeight: '700', letterSpacing: -0.5 },
    amountGreen: { color: colors.green },
    amountRed: { color: colors.red },
    // Empty
    emptyView: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { ...typography.bodySm },
});

const createStatsStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    // Stats cards
    cardsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
    statCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', ...SHADOWS.sm },
    statLabel: { ...typography.caption, color: colors.textSecondary },
    statValue: { fontSize: 24, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
    statSub: { ...typography.caption, marginTop: 4 },
    // Max
    maxCard: { marginHorizontal: 16, padding: 16, backgroundColor: colors.yellowLight, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.yellow, ...SHADOWS.sm },
    maxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    maxIcon: { fontSize: 18 },
    maxTitle: { ...typography.subtitle, fontWeight: '700', color: colors.yellow },
    maxBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    maxName: { ...typography.body, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    maxAmount: { fontSize: 18, fontWeight: '800', color: colors.red, letterSpacing: -0.5 },
    maxDate: { ...typography.caption, color: colors.textSecondary, marginTop: 6 },
    // Category
    section: { marginHorizontal: 16, marginBottom: 20, backgroundColor: colors.card, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.cardBorder, ...SHADOWS.sm },
    sectionTitle: { ...typography.h3, marginBottom: 16 },
    distBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.bg, marginBottom: 16 },
    catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    catLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    catDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
    catName: { ...typography.body, fontWeight: '500' },
    catRight: { flexDirection: 'row', alignItems: 'center' },
    catAmount: { ...typography.body, fontWeight: '700', marginRight: 10 },
    catPct: { ...typography.caption, width: 44, textAlign: 'right' },
    // Merchant
    merchantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    merchantLeft: { flexDirection: 'row', alignItems: 'center', width: 110 },
    merchantRank: { width: 20, ...typography.caption, fontWeight: '700', textAlign: 'center' },
    merchantName: { ...typography.body, fontWeight: '500', flex: 1 },
    merchantBarContainer: { flex: 1, height: 12, backgroundColor: colors.bg, borderRadius: 6, overflow: 'hidden', marginHorizontal: 10 },
    merchantBar: { height: '100%', backgroundColor: colors.accent, borderRadius: 6 },
    merchantAmount: { ...typography.body, fontWeight: '700', width: 75, textAlign: 'right' },
    // Empty
    emptyView: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { ...typography.bodySm },
});
