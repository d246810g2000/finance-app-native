
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFinance } from '../../context/FinanceContext';
import { TransformedRecord } from '../../types';
import { AppColors, CATEGORY_COLORS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import DetailModal from '../../components/DetailModal';
import EmptyState from '../../components/ui/EmptyState';
import SortChips from '../../components/ui/SortChips';
import AccentListCard from '../../components/ui/AccentListCard';
import CompactSummaryBar from '../../components/ui/CompactSummaryBar';
import PageChrome from '../../components/layout/PageChrome';
import { aggregateTravelProjects, TravelProject } from '../../services/shared';
import DateRangeSelector from '../../components/DateRangeSelector';
import { parseFormattedDate } from '../../utils/dateUtils';

type SortKey = 'date_desc' | 'date_asc' | 'expense_desc' | 'expense_asc' | 'duration_desc' | 'duration_asc' | 'dailyAvg_desc' | 'dailyAvg_asc';

export default function TravelScreen() {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { records } = useFinance();
    const [sortKey, setSortKey] = useState<SortKey>('date_desc');
    const [detailModal, setDetailModal] = useState<{ visible: boolean; title: string; data: TransformedRecord[] }>({ visible: false, title: '', data: [] });

    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return d;
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date(); d.setMonth(11, 31); d.setHours(23, 59, 59, 999); return d;
    });

    const listRef = useRef<any>(null);

    const handleDateChange = useCallback((start: Date, end: Date) => {
        setStartDate(start);
        setEndDate(end);
    }, []);

    const travelProjects = useMemo(() => {
        const projects = aggregateTravelProjects(records);
        const filtered = projects.filter(p => {
            const pStart = parseFormattedDate(p.startDate);
            const pEnd = parseFormattedDate(p.endDate);
            return pStart <= endDate && pEnd >= startDate;
        });

        return filtered.sort((a, b) => {
            switch (sortKey) {
                case 'expense_desc': return b.totalExpense - a.totalExpense;
                case 'expense_asc': return a.totalExpense - b.totalExpense;
                case 'duration_desc': return b.durationDays - a.durationDays;
                case 'duration_asc': return a.durationDays - b.durationDays;
                case 'dailyAvg_desc': return b.dailyAvg - a.dailyAvg;
                case 'dailyAvg_asc': return a.dailyAvg - b.dailyAvg;
                case 'date_asc': {
                    const dateA = a.name.match(/^(\d{6})/)?.[1] || '';
                    const dateB = b.name.match(/^(\d{6})/)?.[1] || '';
                    return dateA.localeCompare(dateB);
                }
                case 'date_desc':
                default: {
                    const dateA = a.name.match(/^(\d{6})/)?.[1] || '';
                    const dateB = b.name.match(/^(\d{6})/)?.[1] || '';
                    return dateB.localeCompare(dateA);
                }
            }
        });
    }, [records, sortKey, startDate, endDate]);

    const totalTravelExpense = useMemo(() => travelProjects.reduce((sum, p) => sum + p.totalExpense, 0), [travelProjects]);

    const handleProjectClick = useCallback((project: TravelProject) => {
        setDetailModal({ visible: true, title: `旅遊明細: ${project.name.replace(/^\d{6}-/, '')}`, data: project.records });
    }, []);

    useEffect(() => {
        if (travelProjects.length > 0) {
            setTimeout(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, 10);
        }
    }, [sortKey, startDate, endDate]);

    const renderProjectCard = useCallback(({ item }: { item: TravelProject }) => {
        const totalCatExpense = item.categoryBreakdown.reduce((s, c) => s + c.amount, 0);
        return (
            <AccentListCard
                onPress={() => handleProjectClick(item)}
                title={item.name.replace(/^\d{6}-/, '')}
                amount={`$${item.totalExpense.toLocaleString()}`}
                meta={[
                    { icon: 'calendar-outline', text: `${item.durationDays} 天` },
                    { icon: 'cafe-outline', text: `日均 $${item.dailyAvg.toLocaleString()}` },
                    { icon: 'documents-outline', text: `${item.records.length} 筆` },
                ]}
                accessibilityLabel={`旅遊 ${item.name.replace(/^\d{6}-/, '')}，總花費 ${item.totalExpense} 元`}
            >
                {/* Date range */}
                <Text style={styles.dateRange}>{item.startDate} → {item.endDate}</Text>

                {/* Category distribution bar */}
                <View style={styles.distBar}>
                    {item.categoryBreakdown.map((cat, idx) => (
                        <View key={cat.category} style={{
                            width: `${totalCatExpense > 0 ? (cat.amount / totalCatExpense) * 100 : 0}%` as any,
                            backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length], height: '100%',
                        }} />
                    ))}
                </View>

                {/* Top categories */}
                <View style={styles.topCatRow}>
                    {item.categoryBreakdown.slice(0, 3).map((cat, idx) => (
                        <View key={cat.category} style={styles.topCatItem}>
                            <View style={[styles.topCatDot, { backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }]} />
                            <Text style={styles.topCatName}>{cat.category}</Text>
                            <Text style={styles.topCatAmount}>${cat.amount.toLocaleString()}</Text>
                        </View>
                    ))}
                </View>
            </AccentListCard>
        );
    }, [handleProjectClick, styles]);

    // ── ListHeaderComponent: identical architecture to budget/project pages ──
    const listHeader = useMemo(() => (
        <View style={styles.listHeaderWrapper}>
            <CompactSummaryBar
                items={[
                    { label: '總旅費', value: `$${totalTravelExpense.toLocaleString()}` },
                    { label: '平均', value: `$${travelProjects.length > 0 ? Math.round(totalTravelExpense / travelProjects.length).toLocaleString() : '0'}` },
                ]}
            />

            {/* Sort Chips */}
            <View style={styles.sortContainer}>
                <SortChips
                    options={[
                        { key: 'date', label: '日期' },
                        { key: 'expense', label: '總花費' },
                        { key: 'duration', label: '天數' },
                        { key: 'dailyAvg', label: '日均消費' },
                    ]}
                    activeKey={sortKey.replace(/_(asc|desc)$/, '')}
                    direction={sortKey.endsWith('_asc') ? 'asc' : 'desc'}
                    onChange={(key, direction) => setSortKey(`${key}_${direction}` as SortKey)}
                />
            </View>
        </View>
    ), [travelProjects.length, totalTravelExpense, sortKey]);

    return (
        <View style={styles.container}>
            {/* Fixed date header — mirrors budget's <View style={styles.header}> */}
            <PageChrome>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={`${travelProjects.length} 次旅行`}
                />
            </PageChrome>

            {/* FlashList with paddingHorizontal:16 — mirrors budget's scrollContent paddingHorizontal */}
            <FlashList
                ref={listRef}
                data={travelProjects}
                renderItem={renderProjectCard}
                keyExtractor={(item: TravelProject) => item.name}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={
                    <EmptyState
                        icon="airplane-outline"
                        title="尚無旅遊專案資料"
                        description="旅遊專案格式: YYMMDD-名稱"
                    />
                }
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                // @ts-ignore
                estimatedItemSize={210}
            />

            <DetailModal
                visible={detailModal.visible}
                title={detailModal.title}
                records={detailModal.data}
                onClose={() => setDetailModal({ ...detailModal, visible: false })}
            />
        </View>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },

    // ListHeaderComponent wrapper — negative margin to bleed past paddingHorizontal:16
    listHeaderWrapper: { marginHorizontal: -16 },

    // Sort Chips — identical to budget/project page
    sortContainer: { marginTop: 14, marginBottom: 0 },

    // Travel card extra content (below AccentListCard meta row)
    dateRange: { ...typography.caption, marginTop: 8, marginBottom: 10 },

    // Distribution bar
    distBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.divider, marginBottom: 10 },

    // Top categories
    topCatRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', rowGap: 6, marginBottom: 10 },
    topCatItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    topCatDot: { width: 8, height: 8, borderRadius: 4 },
    topCatName: { ...typography.bodySm },
    topCatAmount: { ...typography.bodySm, fontWeight: '700', color: colors.textPrimary },

});
