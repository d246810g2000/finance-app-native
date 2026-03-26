
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFinance } from '../../context/FinanceContext';
import { TransformedRecord } from '../../types';
import { COLORS, SHADOWS, CATEGORY_COLORS, TYPOGRAPHY } from '../../theme';
import DetailModal from '../../components/DetailModal';
import { aggregateTravelProjects, TravelProject } from '../../services/shared';
import DateRangeSelector from '../../components/DateRangeSelector';
import { parseFormattedDate } from '../../utils/dateUtils';

type SortKey = 'date_desc' | 'date_asc' | 'expense_desc' | 'expense_asc' | 'duration_desc' | 'duration_asc' | 'dailyAvg_desc' | 'dailyAvg_asc';

export default function TravelScreen() {
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
            <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => handleProjectClick(item)}
            >
                {/* Left accent strip — same as budget/project cards */}
                <View style={styles.accentStrip} />
                <View style={styles.cardContent}>
                    {/* Top row: name + total — same pattern as budget/project */}
                    <View style={styles.topRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.name.replace(/^\d{6}-/, '')}</Text>
                        <Text style={styles.totalAmount}>${item.totalExpense.toLocaleString()}</Text>
                    </View>

                    {/* Bottom row: meta info */}
                    <View style={styles.bottomRow}>
                        <Text style={styles.metaText}>📅 {item.durationDays} 天</Text>
                        <Text style={styles.metaText}>☕ 日均 ${item.dailyAvg.toLocaleString()}</Text>
                        <Text style={styles.metaText}>📋 {item.records.length} 筆</Text>
                    </View>

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


                </View>
            </Pressable>
        );
    }, [handleProjectClick]);

    // ── ListHeaderComponent: identical architecture to budget/project pages ──
    const listHeader = useMemo(() => (
        <View style={styles.listHeaderWrapper}>
            {/* Compact Summary Row */}
            <View style={styles.compactSummaryRow}>
                <Text style={styles.compactSummaryText}>
                    總旅費 <Text style={styles.compactSummaryValue}>${totalTravelExpense.toLocaleString()}</Text>
                </Text>
                <Text style={styles.compactSummaryDivider}>|</Text>
                <Text style={styles.compactSummaryText}>
                    平均 <Text style={styles.compactSummaryValue}>${travelProjects.length > 0 ? Math.round(totalTravelExpense / travelProjects.length).toLocaleString() : '0'}</Text>
                </Text>
            </View>

            {/* Sort Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow} style={styles.sortContainer}>
                {([
                    { baseKey: 'date', label: '日期' },
                    { baseKey: 'expense', label: '總花費' },
                    { baseKey: 'duration', label: '天數' },
                    { baseKey: 'dailyAvg', label: '日均消費' },
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
    ), [travelProjects.length, totalTravelExpense, sortKey]);

    return (
        <View style={styles.container}>
            {/* Fixed date header — mirrors budget's <View style={styles.header}> */}
            <View style={styles.dateHeader}>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={`${travelProjects.length} 次旅行`}
                />
            </View>

            {/* FlashList with paddingHorizontal:16 — mirrors budget's scrollContent paddingHorizontal */}
            <FlashList
                ref={listRef}
                data={travelProjects}
                renderItem={renderProjectCard}
                keyExtractor={(item: TravelProject) => item.name}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={
                    <View style={styles.emptyView}>
                        <Text style={{ fontSize: 40, marginBottom: 8 }}>✈️</Text>
                        <Text style={styles.emptyText}>尚無旅遊專案資料</Text>
                        <Text style={styles.emptySubtext}>旅遊專案格式: YYMMDD-名稱</Text>
                    </View>
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    // Fixed date header — mirrors budget's styles.header
    dateHeader: { backgroundColor: COLORS.headerBg, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.divider, ...SHADOWS.sm, zIndex: 10 },

    // ListHeaderComponent wrapper — negative margin to bleed past paddingHorizontal:16
    listHeaderWrapper: { marginHorizontal: -16 },

    // Compact Summary Row — identical to budget/project page
    compactSummaryRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.headerBg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
    compactSummaryText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
    compactSummaryValue: { color: COLORS.textPrimary, fontWeight: '800', fontSize: 15 },
    compactSummaryDivider: { color: COLORS.divider, marginHorizontal: 14, fontSize: 12 },

    // Sort Chips — identical to budget/project page
    sortContainer: { marginTop: 14, marginBottom: 0 },
    sortRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 4, alignItems: 'center' },
    sortChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder, ...SHADOWS.sm },
    sortChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
    sortChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
    sortChipTextActive: { color: '#fff' },

    // Cards — same structure as budget/project (left accent strip, no marginHorizontal, relies on container padding)
    card: { flexDirection: 'row', borderRadius: 14, marginBottom: 10, marginTop: 10, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden', backgroundColor: COLORS.card, ...SHADOWS.sm },
    cardPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
    accentStrip: { width: 4, backgroundColor: COLORS.accent },
    cardContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, paddingLeft: 12 },

    // Top row — same as budget/project
    topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3, flex: 1 },
    totalAmount: { fontSize: 15, fontWeight: '800', color: COLORS.accent, letterSpacing: -0.3 },

    // Bottom meta row
    bottomRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
    metaText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
    dateRange: { ...TYPOGRAPHY.caption, marginBottom: 10 },

    // Distribution bar
    distBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.divider, marginBottom: 10 },

    // Top categories
    topCatRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', rowGap: 6, marginBottom: 10 },
    topCatItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    topCatDot: { width: 8, height: 8, borderRadius: 4 },
    topCatName: { ...TYPOGRAPHY.bodySm },
    topCatAmount: { ...TYPOGRAPHY.bodySm, fontWeight: '700', color: COLORS.textPrimary },

    // Footer: currency badges + max expense
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    badgeRow: { flexDirection: 'row', gap: 6 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: COLORS.yellowLight, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A' },
    badgeText: { fontSize: 11, fontWeight: '800', color: '#92400E', letterSpacing: 0.5 },
    maxExpense: { fontSize: 12, fontWeight: '700', color: COLORS.red, flex: 1, textAlign: 'right' },

    // Empty
    emptyView: { alignItems: 'center', paddingVertical: 80 },
    emptyText: { ...TYPOGRAPHY.body, fontWeight: '700' },
    emptySubtext: { ...TYPOGRAPHY.bodySm, marginTop: 8 },
});
