
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFinance } from '../../context/FinanceContext';
import { filterAndSortRecords, transformRecordsForExport } from '../../services/financeService';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../../theme';
import DateRangeSelector from '../../components/DateRangeSelector';
import DetailModal from '../../components/DetailModal';
import { TransformedRecord } from '../../types';
import { TRAVEL_PROJECT_REGEX, ProjectData } from '../../services/shared';

type SortKey = 'expense_desc' | 'expense_asc' | 'count_desc' | 'count_asc' | 'avg_desc' | 'avg_asc' | 'name_asc' | 'name_desc';

export default function ProjectScreen() {
    const { records, globalExcludeTravel } = useFinance();

    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d;
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date(); d.setHours(23, 59, 59, 999); return d;
    });
    const [detailModal, setDetailModal] = useState<{ visible: boolean; title: string; data: TransformedRecord[] }>({ visible: false, title: '', data: [] });
    const [sortKey, setSortKey] = useState<SortKey>('expense_desc');
    const listRef = useRef<any>(null);

    const handleDateChange = useCallback((start: Date, end: Date) => {
        setStartDate(start);
        setEndDate(end);
    }, []);

    const projectsData = useMemo(() => {
        const filtered = filterAndSortRecords(records, startDate, endDate);
        const transformed = transformRecordsForExport(filtered);
        const projectStats: { [key: string]: { count: number, expense: number } } = {};

        transformed.forEach(r => {
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
            avgPerRecord: Math.round(stats.expense / stats.count)
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

    const totalExpenseAll = useMemo(() => projectsData.reduce((sum, p) => sum + p.totalExpense, 0), [projectsData]);

    useEffect(() => {
        if (projectsData.length > 0) {
            setTimeout(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, 10);
        }
    }, [sortKey, startDate, endDate]);

    const handleProjectClick = useCallback((projectName: string) => {
        const filtered = filterAndSortRecords(records, startDate, endDate);
        const transformed = transformRecordsForExport(filtered).filter(r => r['專案'] === projectName && r['記錄類型'] === '支出');
        setDetailModal({ visible: true, title: `專案明細: ${projectName}`, data: transformed });
    }, [records, startDate, endDate]);

    const renderItem = useCallback(({ item }: { item: ProjectData }) => {
        return (
            <Pressable
                onPress={() => handleProjectClick(item.name)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
                {/* Left accent strip — same as travel cards */}
                <View style={styles.accentStrip} />
                <View style={styles.cardContent}>
                    {/* Top row: name + total — same as travel */}
                    <View style={styles.topRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.totalAmount}>${item.totalExpense.toLocaleString()}</Text>
                    </View>
                    {/* Bottom row: meta info — same pattern as travel */}
                    <View style={styles.bottomRow}>
                        <Text style={styles.metaText}>📋 {item.recordCount} 筆</Text>
                        <Text style={styles.metaText}>📊 平均 ${item.avgPerRecord.toLocaleString()}</Text>
                    </View>
                </View>
            </Pressable>
        );
    }, [handleProjectClick]);

    // ── ListHeaderComponent: matches budget page's scrollContent structure ──
    const listHeader = useMemo(() => (
        <View style={styles.listHeaderWrapper}>
            {/* Compact Summary Row — uses negative margins to bleed full-width, identical to budget page */}
            <View style={styles.compactSummaryRow}>
                <Text style={styles.compactSummaryText}>
                    總花費 <Text style={styles.compactSummaryValue}>${totalExpenseAll.toLocaleString()}</Text>
                </Text>
                <Text style={styles.compactSummaryDivider}>|</Text>
                <Text style={styles.compactSummaryText}>
                    平均 <Text style={styles.compactSummaryValue}>${projectsData.length > 0 ? Math.round(totalExpenseAll / projectsData.length).toLocaleString() : '0'}</Text>
                </Text>
            </View>

            {/* Sort Chips — uses negative horizontal margin to bleed then re-pad, identical to budget page */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow} style={styles.sortContainer}>
                {([
                    { baseKey: 'expense', label: '總花費' },
                    { baseKey: 'count', label: '記錄數' },
                    { baseKey: 'avg', label: '單筆平均' },
                    { baseKey: 'name', label: '名稱' },
                ] as { baseKey: string; label: string }[]).map(opt => {
                    const isActive = sortKey.startsWith(opt.baseKey);
                    const isAsc = sortKey === `${opt.baseKey}_asc`;
                    return (
                        <Pressable
                            key={opt.baseKey}
                            onPress={() => {
                                if (isActive) {
                                    setSortKey(`${opt.baseKey}_${isAsc ? 'desc' : 'asc'}` as SortKey);
                                } else {
                                    setSortKey(`${opt.baseKey}_desc` as SortKey);
                                }
                            }}
                            style={[styles.sortChip, isActive ? styles.sortChipActive : null]}
                        >
                            <Text style={[styles.sortChipText, isActive ? styles.sortChipTextActive : null]}>
                                {opt.label}{isActive && (isAsc ? ' ▴' : ' ▾')}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    ), [projectsData.length, totalExpenseAll, sortKey]);

    return (
        <View style={styles.container}>
            {/* Fixed header — mirrors budget's <View style={styles.header}> */}
            <View style={styles.dateHeader}>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={`${projectsData.length} 個專案`}
                />
            </View>

            {/* FlashList with paddingHorizontal:16 — mirrors budget's scrollContent paddingHorizontal */}
            <FlashList
                ref={listRef}
                data={projectsData}
                renderItem={renderItem}
                keyExtractor={(item: ProjectData) => item.name}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={
                    <View style={styles.emptyView}>
                        <Text style={{ fontSize: 40, marginBottom: 8 }}>📁</Text>
                        <Text style={styles.emptyText}>該期間無專案數據</Text>
                        <Text style={styles.emptySubtext}>請試著切換右上角日期區間</Text>
                    </View>
                }
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
                // @ts-ignore
                estimatedItemSize={70}
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    // Fixed date header — mirrors budget's styles.header
    dateHeader: { backgroundColor: COLORS.headerBg, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.divider, ...SHADOWS.sm, zIndex: 10 },

    // ListHeaderComponent wrapper — uses negative margins to bleed past paddingHorizontal:16 (mirrors budget compactSummaryRow: marginHorizontal:-16)
    listHeaderWrapper: { marginHorizontal: -16 },

    // Compact Summary Row — identical to budget page styles
    compactSummaryRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.headerBg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
    compactSummaryText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
    compactSummaryValue: { color: COLORS.textPrimary, fontWeight: '800', fontSize: 15 },
    compactSummaryDivider: { color: COLORS.divider, marginHorizontal: 14, fontSize: 12 },

    // Sort Chips — sortRow uses paddingHorizontal:16 to re-indent after negative margin
    sortContainer: { marginTop: 14, marginBottom: 0 },
    sortRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 4, alignItems: 'center' },
    sortChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder, ...SHADOWS.sm },
    sortChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
    sortChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
    sortChipTextActive: { color: '#fff' },

    // Cards — identical to travel page style
    card: { flexDirection: 'row', borderRadius: 14, marginBottom: 10, marginTop: 10, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden', backgroundColor: COLORS.card, ...SHADOWS.sm },
    cardPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
    accentStrip: { width: 4, backgroundColor: COLORS.accent },
    cardContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, paddingLeft: 12 },
    topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3, flex: 1 },
    totalAmount: { fontSize: 15, fontWeight: '800', color: COLORS.accent, letterSpacing: -0.3 },
    bottomRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    metaText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },

    emptyView: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    emptyText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 4 },
    emptySubtext: { color: COLORS.textMuted, fontSize: 13 },
});
