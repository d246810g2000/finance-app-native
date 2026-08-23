import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useIsFocused } from '@react-navigation/native';
import { useFinance } from '../../context/FinanceContext';
import {
    filterAndSortRecords,
    transformRecordsForExport,
    aggregateMerchants,
    aggregateInvoiceProducts,
    MerchantAggregate,
    ProductAggregate,
    extractMerchantName,
} from '../../services/financeService';
import { AppColors } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import DateRangeSelector from '../../components/DateRangeSelector';
import DetailModal from '../../components/DetailModal';
import EmptyState from '../../components/ui/EmptyState';
import SortChips from '../../components/ui/SortChips';
import AccentListCard from '../../components/ui/AccentListCard';
import CompactSummaryBar from '../../components/ui/CompactSummaryBar';
import SectionHeader from '../../components/ui/SectionHeader';
import PageChrome from '../../components/layout/PageChrome';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { TransformedRecord } from '../../types';

type TabKey = 'merchant' | 'product';
type SortKey = 'expense_desc' | 'expense_asc' | 'count_desc' | 'count_asc' | 'avg_desc' | 'avg_asc' | 'name_asc' | 'name_desc';

const MerchantRow = memo(function MerchantRow({
    item,
    onPress,
}: {
    item: MerchantAggregate;
    onPress: (m: MerchantAggregate) => void;
}) {
    return (
        <AccentListCard
            onPress={() => onPress(item)}
            title={item.shortName}
            amount={`$${item.total.toLocaleString()}`}
            meta={[
                { icon: 'documents-outline', text: `${item.count} 筆` },
                { icon: 'analytics-outline', text: `均 $${item.avg.toLocaleString()}` },
            ]}
            accessibilityLabel={`商家 ${item.shortName}，${item.total} 元`}
        />
    );
});

const ProductRow = memo(function ProductRow({
    item,
    onPress,
}: {
    item: ProductAggregate;
    onPress: (p: ProductAggregate) => void;
}) {
    return (
        <AccentListCard
            onPress={() => onPress(item)}
            title={item.name}
            amount={`$${item.total.toLocaleString()}`}
            meta={[
                { icon: 'documents-outline', text: `${item.count} 次` },
                { icon: 'analytics-outline', text: `均 $${item.avg.toLocaleString()}` },
            ]}
            accessibilityLabel={`品項 ${item.name}，${item.total} 元`}
        />
    );
});

export default function MerchantScreen() {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { records } = useFinance();
    const isFocused = useIsFocused();

    const [tab, setTab] = useState<TabKey>('merchant');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d;
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date(); d.setHours(23, 59, 59, 999); return d;
    });
    const [sortKey, setSortKey] = useState<SortKey>('expense_desc');
    const [detailModal, setDetailModal] = useState<{ visible: boolean; title: string; data: TransformedRecord[] }>({
        visible: false, title: '', data: [],
    });
    const listRef = useRef<any>(null);
    const lastMerchants = useRef<MerchantAggregate[] | null>(null);

    const handleDateChange = useCallback((start: Date, end: Date) => {
        setStartDate(start);
        setEndDate(end);
    }, []);

    const merchants = useMemo(() => {
        if (!isFocused && lastMerchants.current) return lastMerchants.current;
        const list = aggregateMerchants(records, startDate, endDate);
        const sorted = [...list].sort((a, b) => {
            switch (sortKey) {
                case 'expense_desc': return b.total - a.total;
                case 'expense_asc': return a.total - b.total;
                case 'count_desc': return b.count - a.count;
                case 'count_asc': return a.count - b.count;
                case 'avg_desc': return b.avg - a.avg;
                case 'avg_asc': return a.avg - b.avg;
                case 'name_asc': return a.shortName.localeCompare(b.shortName);
                case 'name_desc': return b.shortName.localeCompare(a.shortName);
                default: return b.total - a.total;
            }
        });
        lastMerchants.current = sorted;
        return sorted;
    }, [isFocused, records, startDate, endDate, sortKey]);

    const products = useMemo(() => {
        const list = aggregateInvoiceProducts(records, startDate, endDate);
        const sorted = [...list].sort((a, b) => {
            switch (sortKey) {
                case 'expense_desc': return b.total - a.total;
                case 'expense_asc': return a.total - b.total;
                case 'count_desc': return b.count - a.count;
                case 'count_asc': return a.count - b.count;
                case 'avg_desc': return b.avg - a.avg;
                case 'avg_asc': return a.avg - b.avg;
                case 'name_asc': return a.name.localeCompare(b.name);
                case 'name_desc': return b.name.localeCompare(a.name);
                default: return b.total - a.total;
            }
        });
        return sorted;
    }, [records, startDate, endDate, sortKey]);

    const totalExpense = useMemo(() => {
        if (tab === 'merchant') return merchants.reduce((s, m) => s + m.total, 0);
        return products.reduce((s, p) => s + p.total, 0);
    }, [tab, merchants, products]);

    useEffect(() => {
        setTimeout(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, 10);
    }, [sortKey, startDate, endDate, tab]);

    const openMerchantDetail = useCallback((m: MerchantAggregate) => {
        const filtered = filterAndSortRecords(records, startDate, endDate);
        const data = transformRecordsForExport(filtered).filter(
            (r) => r['記錄類型'] === '支出' && (r['商家'] === m.name || r['商家']?.startsWith(m.name.slice(0, 20)))
        );
        // 也比對 raw 抽取（因截斷）
        const rawMatched = filtered.filter((row) => {
            const pay = row['付款(轉出)'];
            const recv = row['收款(轉入)'];
            if (!pay || recv) return false;
            return extractMerchantName(row) === m.name;
        });
        const fromRaw = transformRecordsForExport(rawMatched).filter((r) => r['記錄類型'] === '支出');
        setDetailModal({
            visible: true,
            title: m.shortName,
            data: fromRaw.length > 0 ? fromRaw : data,
        });
    }, [records, startDate, endDate]);

    const openProductDetail = useCallback((p: ProductAggregate) => {
        const filtered = filterAndSortRecords(records, startDate, endDate);
        const matched = filtered.filter((row) => {
            const note = row['備註'] || '';
            return note.includes(p.name);
        });
        const data = transformRecordsForExport(matched).filter((r) => r['記錄類型'] === '支出');
        setDetailModal({ visible: true, title: p.name, data });
    }, [records, startDate, endDate]);

    const renderMerchant = useCallback(({ item }: { item: MerchantAggregate }) => (
        <MerchantRow item={item} onPress={openMerchantDetail} />
    ), [openMerchantDetail]);

    const renderProduct = useCallback(({ item }: { item: ProductAggregate }) => (
        <ProductRow item={item} onPress={openProductDetail} />
    ), [openProductDetail]);

    const listHeader = useMemo(() => (
        <View style={styles.listHeaderWrapper}>
            <View style={styles.segmentWrap}>
                <SegmentedControl
                    options={[
                        { value: 'merchant', label: '商家' },
                        { value: 'product', label: '品項' },
                    ]}
                    value={tab}
                    onChange={setTab}
                    fullWidth
                    colors={colors}
                />
            </View>
            <CompactSummaryBar
                items={[
                    { label: tab === 'merchant' ? '商家數' : '品項數', value: `${tab === 'merchant' ? merchants.length : products.length}` },
                    { label: '總額', value: `$${totalExpense.toLocaleString()}` },
                ]}
            />
            <SectionHeader title={tab === 'merchant' ? '消費商家' : '熱門品項'} style={styles.sectionHeader} />
            <View style={styles.sortContainer}>
                <SortChips
                    options={[
                        { key: 'expense', label: '總花費' },
                        { key: 'count', label: '次數' },
                        { key: 'avg', label: '平均' },
                        { key: 'name', label: '名稱' },
                    ]}
                    activeKey={sortKey.replace(/_(asc|desc)$/, '')}
                    direction={sortKey.endsWith('_asc') ? 'asc' : 'desc'}
                    onChange={(key, direction) => setSortKey(`${key}_${direction}` as SortKey)}
                />
            </View>
        </View>
    ), [tab, merchants.length, products.length, totalExpense, sortKey, styles]);

    return (
        <View style={styles.container}>
            <PageChrome>
                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    subLabel={tab === 'merchant' ? `${merchants.length} 家商家` : `${products.length} 項商品`}
                />
            </PageChrome>

            {tab === 'merchant' ? (
                <FlashList
                    ref={listRef}
                    data={merchants}
                    renderItem={renderMerchant}
                    keyExtractor={(item: MerchantAggregate) => item.name}
                    ListHeaderComponent={listHeader}
                    ListEmptyComponent={
                        <EmptyState icon="storefront-outline" title="該期間無商家資料" description="請確認已匯入含發票備註的紀錄" />
                    }
                    contentContainerStyle={styles.listContent}
                    // @ts-ignore
                    estimatedItemSize={80}
                />
            ) : (
                <FlashList
                    ref={listRef}
                    data={products}
                    renderItem={renderProduct}
                    keyExtractor={(item: ProductAggregate) => item.name}
                    ListHeaderComponent={listHeader}
                    ListEmptyComponent={
                        <EmptyState icon="cube-outline" title="該期間無品項資料" description="電子發票備註才會解析出品項" />
                    }
                    contentContainerStyle={styles.listContent}
                    // @ts-ignore
                    estimatedItemSize={80}
                />
            )}

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
    container: { flex: 1, backgroundColor: colors.surface },
    listContent: { paddingHorizontal: 16, paddingBottom: 20 },
    listHeaderWrapper: { marginHorizontal: -16 },
    segmentWrap: { paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
    sectionHeader: { marginHorizontal: 16, marginTop: 16, marginBottom: 2 },
    sortContainer: { marginTop: 12, marginBottom: 0 },
});
