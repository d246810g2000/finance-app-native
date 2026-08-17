import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFinance } from '../../context/FinanceContext';
import { AppColors, CATEGORY_COLORS, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import EmptyState from '../../components/ui/EmptyState';
import SortChips from '../../components/ui/SortChips';
import AccentListCard from '../../components/ui/AccentListCard';
import CompactSummaryBar from '../../components/ui/CompactSummaryBar';
import SectionHeader from '../../components/ui/SectionHeader';
import PageChrome from '../../components/layout/PageChrome';
import { aggregateTravelProjects, rankTravelSpendByYear, TravelProject } from '../../services/shared';
import DateRangeSelector from '../../components/DateRangeSelector';
import { parseFormattedDate } from '../../utils/dateUtils';

type SortKey = 'date_desc' | 'date_asc' | 'expense_desc' | 'expense_asc' | 'duration_desc' | 'duration_asc' | 'dailyAvg_desc' | 'dailyAvg_asc';
type TravelStyles = ReturnType<typeof createStyles>;

const TravelProjectCard = memo(function TravelProjectCard({
    item,
    styles,
    onPress,
}: {
    item: TravelProject;
    styles: TravelStyles;
    onPress: (project: TravelProject) => void;
}) {
    const displayName = item.name.replace(/^\d{6}-/, '');
    const totalCatExpense = item.categoryBreakdown.reduce((s, c) => s + c.amount, 0);
    return (
        <AccentListCard
            onPress={() => onPress(item)}
            title={displayName}
            amount={`$${item.totalExpense.toLocaleString()}`}
            meta={[
                { icon: 'calendar-outline', text: `${item.durationDays} 天` },
                { icon: 'cafe-outline', text: `日均 $${item.dailyAvg.toLocaleString()}` },
                { icon: 'documents-outline', text: `${item.records.length} 筆` },
            ]}
            accessibilityLabel={`旅遊 ${displayName}，總花費 ${item.totalExpense} 元`}
        >
            <Text style={styles.dateRange}>{item.startDate} → {item.endDate}</Text>
            <View style={styles.distBar}>
                {item.categoryBreakdown.map((cat, idx) => (
                    <View
                        key={cat.category}
                        style={[
                            styles.distSeg,
                            {
                                width: `${totalCatExpense > 0 ? (cat.amount / totalCatExpense) * 100 : 0}%` as `${number}%`,
                                backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                            },
                        ]}
                    />
                ))}
            </View>
            <View style={styles.topCatRow}>
                {item.categoryBreakdown.slice(0, 3).map((cat, idx) => (
                    <View key={cat.category} style={styles.topCatItem}>
                        <View style={[styles.topCatDot, { backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }]} />
                        <Text style={styles.topCatName}>{cat.category}</Text>
                        <Text style={styles.topCatAmount} selectable>${cat.amount.toLocaleString()}</Text>
                    </View>
                ))}
            </View>
        </AccentListCard>
    );
});

export default function TravelScreen() {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { records } = useFinance();
    const router = useRouter();
    const [sortKey, setSortKey] = useState<SortKey>('date_desc');
    const [yearFilter, setYearFilter] = useState<number | null>(null);

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
        setYearFilter(null);
    }, []);

    const allProjects = useMemo(() => aggregateTravelProjects(records), [records]);
    const yearRanks = useMemo(() => rankTravelSpendByYear(allProjects), [allProjects]);

    const travelProjects = useMemo(() => {
        let filtered = allProjects.filter(p => {
            const pStart = parseFormattedDate(p.startDate);
            const pEnd = parseFormattedDate(p.endDate);
            return pStart <= endDate && pEnd >= startDate;
        });

        if (yearFilter != null) {
            filtered = filtered.filter((p) => {
                const m = p.name.match(/^(\d{2})/);
                if (m) return 2000 + parseInt(m[1], 10) === yearFilter;
                const d = parseFormattedDate(p.startDate);
                return !isNaN(d.getTime()) && d.getFullYear() === yearFilter;
            });
        }

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
    }, [allProjects, sortKey, startDate, endDate, yearFilter]);

    const totalTravelExpense = useMemo(() => travelProjects.reduce((sum, p) => sum + p.totalExpense, 0), [travelProjects]);

    const handleProjectClick = useCallback((project: TravelProject) => {
        router.push({ pathname: '/travel/[name]', params: { name: project.name } });
    }, [router]);

    useEffect(() => {
        if (travelProjects.length > 0) {
            setTimeout(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, 10);
        }
    }, [sortKey, startDate, endDate, yearFilter]);

    const renderProjectCard = useCallback(({ item }: { item: TravelProject }) => (
        <TravelProjectCard item={item} styles={styles} onPress={handleProjectClick} />
    ), [handleProjectClick, styles]);

    const listHeader = useMemo(() => (
        <View style={styles.listHeaderWrapper}>
            <CompactSummaryBar
                items={[
                    { label: '總旅費', value: `$${totalTravelExpense.toLocaleString()}` },
                    { label: '平均', value: `$${travelProjects.length > 0 ? Math.round(totalTravelExpense / travelProjects.length).toLocaleString() : '0'}` },
                ]}
            />

            {yearRanks.length > 0 ? (
                <View style={styles.yearSection}>
                    <SectionHeader title="年度出國成本" accent={colors.blue} style={styles.sectionHeader} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearScroll}>
                        <Pressable
                            style={[styles.yearCard, yearFilter === null && styles.yearCardActive]}
                            onPress={() => setYearFilter(null)}
                        >
                            <Text style={styles.yearLabel}>全部</Text>
                            <Text style={styles.yearAmount}>
                                ${yearRanks.reduce((s, y) => s + y.totalExpense, 0).toLocaleString()}
                            </Text>
                            <Text style={styles.yearMeta}>{allProjects.length} 趟</Text>
                        </Pressable>
                        {yearRanks.map((y) => (
                            <Pressable
                                key={y.year}
                                style={[styles.yearCard, yearFilter === y.year && styles.yearCardActive]}
                                onPress={() => setYearFilter(y.year === yearFilter ? null : y.year)}
                            >
                                <Text style={styles.yearLabel}>{y.year}</Text>
                                <Text style={styles.yearAmount}>${y.totalExpense.toLocaleString()}</Text>
                                <Text style={styles.yearMeta}>{y.tripCount} 趟</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            ) : null}

            <SectionHeader title="旅程總覽" accent={colors.blue} style={styles.sectionHeader} />
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
    ), [travelProjects.length, totalTravelExpense, sortKey, yearRanks, yearFilter, allProjects.length, colors.blue, styles]);

    return (
        <View style={styles.container}>
            <PageChrome>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={`${travelProjects.length} 次旅行${yearFilter ? ` · ${yearFilter}` : ''}`}
                />
            </PageChrome>

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
        </View>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    listHeaderWrapper: { marginHorizontal: -16 },
    sectionHeader: { marginHorizontal: 16, marginTop: 22, marginBottom: 2 },
    sortContainer: { marginTop: 12, marginBottom: 0 },
    yearSection: { marginTop: 4 },
    yearScroll: { paddingHorizontal: 16, gap: 10, paddingTop: 10, paddingBottom: 4 },
    yearCard: {
        minWidth: 112,
        backgroundColor: colors.surfaceContainer,
        borderRadius: RADIUS.md,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
        minHeight: 88,
    },
    yearCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
    yearLabel: { fontSize: 13, fontWeight: '700', color: colors.onSurfaceVariant, marginBottom: 4 },
    yearAmount: { fontSize: 16, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
    yearMeta: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 4 },
    dateRange: { ...typography.caption, marginTop: 8, marginBottom: 10 },
    distBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfaceVariant, marginBottom: 10 },
    distSeg: { height: '100%' },
    topCatRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', rowGap: 6, marginBottom: 10 },
    topCatItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    topCatDot: { width: 8, height: 8, borderRadius: 4 },
    topCatName: { ...typography.bodySm },
    topCatAmount: { ...typography.bodySm, fontWeight: '700', color: colors.onSurface, fontVariant: ['tabular-nums'] },
});
