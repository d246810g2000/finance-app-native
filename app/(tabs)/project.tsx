
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFinance } from '../../context/FinanceContext';
import { filterAndSortRecords, transformRecordsForExport } from '../../services/financeService';
import { AppColors } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import DateRangeSelector from '../../components/DateRangeSelector';
import DetailModal from '../../components/DetailModal';
import EmptyState from '../../components/ui/EmptyState';
import SortChips from '../../components/ui/SortChips';
import AccentListCard from '../../components/ui/AccentListCard';
import CompactSummaryBar from '../../components/ui/CompactSummaryBar';
import PageChrome from '../../components/layout/PageChrome';
import { TransformedRecord } from '../../types';
import { TRAVEL_PROJECT_REGEX, ProjectData } from '../../services/shared';

type SortKey = 'expense_desc' | 'expense_asc' | 'count_desc' | 'count_asc' | 'avg_desc' | 'avg_asc' | 'name_asc' | 'name_desc';

export default function ProjectScreen() {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
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
            <AccentListCard
                onPress={() => handleProjectClick(item.name)}
                title={item.name}
                amount={`$${item.totalExpense.toLocaleString()}`}
                meta={[
                    { icon: 'documents-outline', text: `${item.recordCount} 筆` },
                    { icon: 'analytics-outline', text: `平均 $${item.avgPerRecord.toLocaleString()}` },
                ]}
                accessibilityLabel={`專案 ${item.name}，總花費 ${item.totalExpense} 元`}
            />
        );
    }, [handleProjectClick]);

    // ── ListHeaderComponent: matches budget page's scrollContent structure ──
    const listHeader = useMemo(() => (
        <View style={styles.listHeaderWrapper}>
            <CompactSummaryBar
                items={[
                    { label: '總花費', value: `$${totalExpenseAll.toLocaleString()}` },
                    { label: '平均', value: `$${projectsData.length > 0 ? Math.round(totalExpenseAll / projectsData.length).toLocaleString() : '0'}` },
                ]}
            />

            {/* Sort Chips */}
            <View style={styles.sortContainer}>
                <SortChips
                    options={[
                        { key: 'expense', label: '總花費' },
                        { key: 'count', label: '記錄數' },
                        { key: 'avg', label: '單筆平均' },
                        { key: 'name', label: '名稱' },
                    ]}
                    activeKey={sortKey.replace(/_(asc|desc)$/, '')}
                    direction={sortKey.endsWith('_asc') ? 'asc' : 'desc'}
                    onChange={(key, direction) => setSortKey(`${key}_${direction}` as SortKey)}
                />
            </View>
        </View>
    ), [projectsData.length, totalExpenseAll, sortKey]);

    return (
        <View style={styles.container}>
            {/* Fixed header */}
            <PageChrome>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={`${projectsData.length} 個專案`}
                />
            </PageChrome>

            {/* FlashList with paddingHorizontal:16 — mirrors budget's scrollContent paddingHorizontal */}
            <FlashList
                ref={listRef}
                data={projectsData}
                renderItem={renderItem}
                keyExtractor={(item: ProjectData) => item.name}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={
                    <EmptyState
                        icon="folder-open-outline"
                        title="該期間無專案數據"
                        description="請試著切換頂部日期區間"
                    />
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

const createStyles = (colors: AppColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    // ListHeaderComponent wrapper — negative margin bleeds past FlashList paddingHorizontal:16
    listHeaderWrapper: { marginHorizontal: -16 },

    // Sort Chips
    sortContainer: { marginTop: 14, marginBottom: 0 },
});
