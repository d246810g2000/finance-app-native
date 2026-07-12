import React, { useState, useMemo, useCallback, useLayoutEffect, memo } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, RefreshControl, LayoutAnimation } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from 'expo-router';
import { useFinance } from '../../context/FinanceContext';
import { transformRecordsForExport } from '../../services/financeService';
import { TransformedRecord } from '../../types';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { zeroPadDate, parseFormattedDate, getStartOfWeek, getEndOfWeek } from '../../utils/dateUtils';
import MonthlyCalendar from '../../components/MonthlyCalendar';
import DetailModal from '../../components/DetailModal';
import EmptyState from '../../components/ui/EmptyState';
import SortChips from '../../components/ui/SortChips';
import AccentListCard, { MetaEntry } from '../../components/ui/AccentListCard';
import PageChrome from '../../components/layout/PageChrome';
import HeaderMenuButton from '../../components/layout/HeaderMenuButton';
import { Ionicons } from '@expo/vector-icons';
import UnifiedDateNavigator from '../../components/layout/UnifiedDateNavigator';
import ModalBackdrop from '../../components/ui/ModalBackdrop';

type SortKey = '日期' | '主類別' | '金額';
type SortDirection = 'asc' | 'desc';

type ListRow =
    | { kind: 'header'; key: string; title: string }
    | { kind: 'record'; key: string; item: TransformedRecord };

type RecordStyles = ReturnType<typeof createStyles>;

const getTypeColors = (colors: AppColors): Record<string, string> => ({
    '支出': colors.red, '收入': colors.green, '轉帳': colors.blue,
    '轉出': colors.red, '轉入': colors.green,
});

const RecordListItem = memo(({ item, colors, typeColors, styles, onPress }: {
    item: TransformedRecord;
    colors: AppColors;
    typeColors: Record<string, string>;
    styles: RecordStyles;
    onPress: (item: TransformedRecord) => void;
}) => {
    const isTransfer = item['記錄類型'] === '轉帳';
    const typeColor = isTransfer ? colors.blue : (typeColors[item['記錄類型']] || colors.textMuted);

    if (isTransfer) {
        const fromAccount = item['帳戶'];
        const toAccount = item['描述'];
        const meta: MetaEntry[] = [];
        if (item['時間'] !== '09:00') meta.push({ icon: 'time-outline', text: item['時間'] });
        if (item['專案']) meta.push({ icon: 'folder-outline', text: item['專案'] });
        return (
            <AccentListCard
                onPress={() => onPress(item)}
                accentColor={colors.blue}
                title={`${fromAccount} » ${toAccount}`}
                titleBadge={(
                    <View style={[styles.categoryBadge, { backgroundColor: colors.blueLight, borderColor: colors.accentBorder }]}>
                        <Text style={[styles.categoryBadgeText, { color: colors.blue }]}>轉帳</Text>
                    </View>
                )}
                amount={`$${item['金額'].toLocaleString()}`}
                amountColor={colors.blue}
                meta={meta}
            />
        );
    }

    const meta: MetaEntry[] = [];
    if (item['時間'] !== '09:00') meta.push({ icon: 'time-outline', text: item['時間'] });
    if (item['帳戶']) meta.push({ icon: 'card-outline', text: item['帳戶'] });
    if (item['專案']) meta.push({ icon: 'folder-outline', text: item['專案'] });

    return (
        <AccentListCard
            onPress={() => onPress(item)}
            accentColor={typeColor}
            title={item['商家'] || item['名稱'] || '未命名'}
            titleBadge={(
                <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{item['主類別']}</Text>
                </View>
            )}
            amount={item['金額'].toLocaleString()}
            amountColor={item['金額'] >= 0 ? colors.green : colors.red}
            meta={meta}
            metaTrailing={item['描述'] ? <Text style={styles.metaDesc} numberOfLines={1}>{item['描述']}</Text> : undefined}
        />
    );
});

export default function CalendarScreen() {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const typeColors = useMemo(() => getTypeColors(colors), [colors]);
    const { records, deleteRecord, refreshRecords, searchFilters, setSearchFilters, searchModalVisible, setSearchModalVisible, setMenuVisible } = useFinance();
    const [refreshing, setRefreshing] = useState(false);

    // View Mode & Date State
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'year'>('day');
    const [currentDate, setCurrentDate] = useState(new Date()); // The reference date for the view
    const [showModePicker, setShowModePicker] = useState(false);
    const [showCalendarModal, setShowCalendarModal] = useState(false);

    // Filters & Sort
    // Sorting
    // Default sort by date desc
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: '日期', direction: 'desc' });
    const [selectedRecord, setSelectedRecord] = useState<TransformedRecord | null>(null);
    const [detailTitle, setDetailTitle] = useState('記錄詳情');
    const navigation = useNavigation();

    useLayoutEffect(() => {
        navigation.setOptions({
            headerTitle: () => (
                <Pressable
                    onPress={() => {
                        if (searchFilters) return; // Disable picker during search
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setShowModePicker(!showModePicker);
                    }}
                    style={styles.headerTitleContainer}
                    accessibilityRole="button"
                    accessibilityLabel="切換檢視模式"
                >
                    <Text style={styles.headerTitleText}>{searchFilters ? '搜尋結果' : '記錄'}</Text>
                    {!searchFilters && (
                        <View style={styles.modeBadge}>
                            <Text style={styles.modeBadgeText}>
                                {viewMode === 'day' ? '日' : viewMode === 'week' ? '週' : viewMode === 'month' ? '月' : '年'}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color={colors.textSecondary} style={{ marginLeft: 2 }} />
                        </View>
                    )}
                </Pressable>
            ),
            headerLeft: () => (
                <HeaderMenuButton
                    icon={searchFilters ? 'back' : 'menu'}
                    onPress={() => {
                        if (searchFilters) {
                            setSearchFilters(null);
                            setSearchModalVisible(true);
                        } else {
                            setMenuVisible(true);
                        }
                    }}
                    accessibilityLabel={searchFilters ? '返回搜尋' : '開啟選單'}
                />
            ),
        });
    }, [navigation, viewMode, showModePicker, searchFilters, colors.textPrimary, setSearchFilters, setSearchModalVisible, setMenuVisible]);

    const allData = useMemo(() => transformRecordsForExport(records), [records]);

    const uniqueAccounts = useMemo(() => {
        const accounts = new Set<string>();
        allData.forEach(r => { if (r['帳戶']) accounts.add(r['帳戶']); });
        return Array.from(accounts).sort();
    }, [allData]);

    // Calculate Date Range & Label
    const { rangeStart, rangeEnd, dateLabel } = useMemo(() => {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        const d = currentDate.getDate();
        let start: Date, end: Date, label = '';

        switch (viewMode) {
            case 'day':
                start = new Date(y, m, d);
                end = new Date(y, m, d);
                // e.g., 2026-02-19 (四)
                const weekDay = ['日', '一', '二', '三', '四', '五', '六'][currentDate.getDay()];
                label = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')} (${weekDay})`;
                break;
            case 'week':
                start = getStartOfWeek(currentDate);
                start.setHours(0, 0, 0, 0);

                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);

                label = `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
                break;
            case 'month':
                start = new Date(y, m, 1);
                end = new Date(y, m + 1, 0); // Last day of month
                label = `${y}年 ${m + 1}月`;
                break;
            case 'year':
                start = new Date(y, 0, 1);
                end = new Date(y, 11, 31);
                label = `${y}年`;
                break;
        }
        return { rangeStart: start, rangeEnd: end, dateLabel: label };
    }, [viewMode, currentDate]);

    // Navigation Handler
    const handleNav = useCallback((direction: -1 | 1) => {
        const d = new Date(currentDate);
        switch (viewMode) {
            case 'day': d.setDate(d.getDate() + direction); break;
            case 'week': d.setDate(d.getDate() + (direction * 7)); break;
            case 'month': d.setMonth(d.getMonth() + direction); break;
            case 'year': d.setFullYear(d.getFullYear() + direction); break;
        }
        setCurrentDate(d);
    }, [viewMode, currentDate]);

    // Handle Date Pick from Calendar Modal
    const handleCalendarDateClick = useCallback((date: Date, _records: TransformedRecord[]) => {
        setCurrentDate(date);
        setViewMode('day'); // Switch to day view when picking a specific date
        setShowCalendarModal(false);
    }, []);

    const filteredData = useMemo(() => {
        let data = [...allData];

        // 1. Global Search Filters (Higher Priority)
        if (searchFilters) {
            if (searchFilters.keyword) {
                const k = searchFilters.keyword.toLowerCase();
                data = data.filter(item =>
                    (item['商家'] && item['商家'].toLowerCase().includes(k)) ||
                    (item['描述'] && item['描述'].toLowerCase().includes(k)) ||
                    (item['主類別'] && item['主類別'].toLowerCase().includes(k)) ||
                    (item['子類別'] && item['子類別'].toLowerCase().includes(k))
                );
            }
            if (searchFilters.category) data = data.filter(item => item['主類別'] === searchFilters.category);
            if (searchFilters.account) data = data.filter(item => item['帳戶'] === searchFilters.account);
            if (searchFilters.project) data = data.filter(item => item['專案'] === searchFilters.project);
            if (searchFilters.startDate) {
                const s = new Date(searchFilters.startDate); s.setHours(0, 0, 0, 0);
                data = data.filter(item => parseFormattedDate(item['日期']).getTime() >= s.getTime());
            }
            if (searchFilters.endDate) {
                const e = new Date(searchFilters.endDate); e.setHours(23, 59, 59, 999);
                data = data.filter(item => parseFormattedDate(item['日期']).getTime() <= e.getTime());
            }
            if (searchFilters.minAmount !== null) {
                data = data.filter(item => Math.abs(item['金額']) >= searchFilters.minAmount!);
            }
            if (searchFilters.maxAmount !== null) {
                data = data.filter(item => Math.abs(item['金額']) <= searchFilters.maxAmount!);
            }
        } else {
            // 2. Date Range Filter (Default)
            const s = new Date(rangeStart); s.setHours(0, 0, 0, 0);
            const e = new Date(rangeEnd); e.setHours(23, 59, 59, 999);

            data = data.filter(item => {
                const d = parseFormattedDate(item['日期']);
                if (isNaN(d.getTime())) return false;
                const ts = d.getTime();
                return ts >= s.getTime() && ts <= e.getTime();
            });
        }

        // 3. Sort
        data.sort((a, b) => {
            let aValue: any = a[sortConfig.key]; let bValue: any = b[sortConfig.key];
            if (sortConfig.key === '金額') { aValue = Number(aValue); bValue = Number(bValue); }
            else if (sortConfig.key === '日期') {
                aValue = zeroPadDate(aValue);
                bValue = zeroPadDate(bValue);
            }
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return data;
    }, [allData, searchFilters, rangeStart, rangeEnd, sortConfig]);

    // Calculate Stats for Current View
    const stats = useMemo(() => {
        let income = 0;
        let expense = 0;
        filteredData.forEach(r => {
            const amt = Math.abs(r['金額']);
            if (r['記錄類型'] === '收入') income += amt;
            if (r['記錄類型'] === '支出') expense += amt;
        });
        return { income, expense, balance: income - expense };
    }, [filteredData]);

    const sections = useMemo(() => {
        // Merge transfer pairs: 轉出(*-out) + 轉入(*-in) → single transfer item
        const mergedData: TransformedRecord[] = [];
        const transferOutMap = new Map<string, TransformedRecord>();
        const transferInMap = new Map<string, TransformedRecord>();
        const processedTransferBaseIds = new Set<string>();

        filteredData.forEach(item => {
            const id = item.id || '';
            if (id.endsWith('-out') && item['記錄類型'] === '轉出') {
                transferOutMap.set(id.replace(/-out$/, ''), item);
            } else if (id.endsWith('-in') && item['記錄類型'] === '轉入') {
                transferInMap.set(id.replace(/-in$/, ''), item);
            } else {
                mergedData.push(item);
            }
        });

        // Merge matched pairs into a single synthetic transfer record
        transferOutMap.forEach((outRecord, baseId) => {
            const inRecord = transferInMap.get(baseId);
            if (inRecord) {
                // Create merged transfer record
                const merged: TransformedRecord = {
                    ...outRecord,
                    id: baseId,
                    '記錄類型': '轉帳' as any,
                    '主類別': '轉帳',
                    '金額': Math.abs(outRecord['金額']),
                    // Store both accounts for display (use 帳戶 for the "from" account)
                    '帳戶': outRecord['帳戶'],
                    '描述': inRecord['帳戶'], // Reuse 描述 field temporarily to store target account
                };
                mergedData.push(merged);
                processedTransferBaseIds.add(baseId);
            } else {
                mergedData.push(outRecord); // No matching in, keep as-is
            }
        });

        // Add unmatched 轉入 records
        transferInMap.forEach((inRecord, baseId) => {
            if (!processedTransferBaseIds.has(baseId)) {
                mergedData.push(inRecord);
            }
        });

        // 非日期排序：扁平列表，不再依日期分組（否則排序看起來沒作用）
        if (sortConfig.key !== '日期') {
            return [{ title: '', data: mergedData }];
        }

        const groups: { [key: string]: TransformedRecord[] } = {};
        mergedData.forEach(item => {
            const dateStr = item['日期'] || '未知';
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(item);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) =>
            sortConfig.direction === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
        );

        return sortedKeys.map(key => ({
            title: key,
            data: groups[key]
        }));
    }, [filteredData, sortConfig.key, sortConfig.direction]);

    const listData = useMemo(() => {
        const rows: ListRow[] = [];
        sections.forEach(section => {
            if (section.title) {
                rows.push({ kind: 'header', key: `h-${section.title}`, title: section.title });
            }
            section.data.forEach((item, i) => {
                rows.push({ kind: 'record', key: item.id || `r-${section.title}-${i}`, item });
            });
        });
        return rows;
    }, [sections]);

    const handleRecordPress = useCallback((item: TransformedRecord) => {
        setDetailTitle(item['商家'] || item['名稱'] || '記錄詳情');
        setSelectedRecord(item);
    }, []);

    const renderFlashItem = useCallback(({ item: row }: { item: ListRow }) => {
        if (row.kind === 'header') {
            return (
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{row.title}</Text>
                </View>
            );
        }
        return (
            <RecordListItem
                item={row.item}
                colors={colors}
                typeColors={typeColors}
                styles={styles}
                onPress={handleRecordPress}
            />
        );
    }, [colors, typeColors, styles, handleRecordPress]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (refreshRecords) await refreshRecords();
        setRefreshing(false);
    }, [refreshRecords]);

    return (
        <View style={styles.container}>
            {/* Header Nav + Mode Picker Dropdown */}
            <PageChrome zIndex={100}>
                {!searchFilters ? (
                    <UnifiedDateNavigator
                        dateLabel={dateLabel}
                        subLabel={`TW$ ${stats.balance.toLocaleString()}`}
                        onPrev={() => handleNav(-1)}
                        onNext={() => handleNav(1)}
                        onCenterPress={() => setShowCalendarModal(true)}
                    />
                ) : (
                    <View style={styles.searchActiveBanner}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.searchActiveTitle}>搜尋結果 (共 {filteredData.length} 筆)</Text>
                            <Text style={styles.searchActiveSub} numberOfLines={1}>
                                {searchFilters.keyword ? `關鍵字: ${searchFilters.keyword} ` : ''}
                                {searchFilters.category ? `類別: ${searchFilters.category} ` : ''}
                                {searchFilters.account ? `帳戶: ${searchFilters.account} ` : ''}
                                {searchFilters.project ? `專案: ${searchFilters.project} ` : ''}
                                {(searchFilters.minAmount !== null || searchFilters.maxAmount !== null) ? `金額: ${searchFilters.minAmount || 0}~${searchFilters.maxAmount || '∞'} ` : ''}
                                {searchFilters.startDate ? '日期區間 ' : ''}
                            </Text>
                        </View>
                        <Pressable style={({ pressed }) => [styles.searchClearBtn, pressed && { opacity: 0.7 }]} onPress={() => setSearchFilters(null)}>
                            <Text style={styles.searchClearText}>清除</Text>
                            <Ionicons name="close-circle" size={16} color={colors.accent} />
                        </Pressable>
                    </View>
                )}

                {showModePicker && (
                    <>
                        <Pressable
                            style={styles.dropdownBackdrop}
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setShowModePicker(false);
                            }}
                        />
                        <View style={styles.dropdownMenu}>
                            {(['day', 'week', 'month', 'year'] as const).map(m => (
                                <Pressable key={m} style={[styles.dropdownItem, viewMode === m && styles.dropdownItemActive]}
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setViewMode(m);
                                        setShowModePicker(false);
                                    }}>
                                    <View style={styles.dropdownItemContent}>
                                        <Text style={[styles.dropdownItemText, viewMode === m && styles.dropdownItemTextActive]}>
                                            {m === 'day' ? '按日檢視' : m === 'week' ? '按週檢視' : m === 'month' ? '按月檢視' : '按年檢視'}
                                        </Text>
                                        {viewMode === m && <Ionicons name="checkmark" size={18} color={colors.textWhite} />}
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                    </>
                )}
            </PageChrome>

            {!searchFilters && (
                <SortChips
                    variant="bar"
                    options={[
                        { key: '日期', label: '日期' },
                        { key: '主類別', label: '類別' },
                        { key: '金額', label: '金額' },
                    ]}
                    activeKey={sortConfig.key}
                    direction={sortConfig.direction}
                    onChange={(key, direction) => setSortConfig({ key, direction })}
                />
            )}

            <FlashList
                style={styles.list}
                data={listData}
                renderItem={renderFlashItem}
                keyExtractor={(row) => row.key}
                getItemType={(row) => row.kind}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                // @ts-ignore FlashList v2 estimatedItemSize
                estimatedItemSize={88}
                ListEmptyComponent={
                    <EmptyState
                        icon="receipt-outline"
                        title="尚無記錄"
                        description={searchFilters ? '試著調整搜尋條件' : '切換日期範圍或從選單匯入資料'}
                    />
                }
            />

            {/* Calendar Modal */}
            <Modal visible={showCalendarModal} transparent animationType="fade" onRequestClose={() => setShowCalendarModal(false)}>
                <ModalBackdrop colors={colors} style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCalendarModal(false)} />
                    <View style={styles.calendarModalContent}>
                        <MonthlyCalendar
                            records={records}
                            accountFilter={null}
                            currentMonthStr={`${currentDate.getFullYear()}/${String(currentDate.getMonth() + 1).padStart(2, '0')}`}
                            onDateClick={handleCalendarDateClick}
                            selectedDate={null}
                        />
                    </View>
                </ModalBackdrop>
            </Modal>

            <DetailModal
                visible={!!selectedRecord}
                title={detailTitle}
                records={selectedRecord ? [selectedRecord] : []}
                onClose={() => setSelectedRecord(null)}
            />
        </View>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    // Header Nav
    headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
    headerTitleText: { ...typography.h3, fontSize: 17, marginRight: 6 },
    modeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    modeBadgeText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

    // Dropdown
    dropdownBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.blackOverlay,
        zIndex: 90,
    },
    dropdownMenu: {
        position: 'absolute',
        top: 10,
        alignSelf: 'center',
        backgroundColor: colors.card,
        width: 180,
        borderRadius: 20,
        padding: 8,
        ...SHADOWS.lg,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        zIndex: 100,
    },
    dropdownItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 2,
    },
    dropdownItemActive: { backgroundColor: colors.accent },
    dropdownItemContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dropdownItemText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    dropdownItemTextActive: { color: colors.textWhite },
    // Calendar Modal
    modalOverlay: { flex: 1, justifyContent: 'center' },
    calendarModalContent: { backgroundColor: colors.card, margin: 20, ...withContinuousRadius(RADIUS.xl), padding: 12, paddingBottom: 20, ...SHADOWS.lg },
    // Record Card badge + description (card shell provided by AccentListCard)
    categoryBadge: { backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder, marginHorizontal: 8 },
    categoryBadgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
    metaDesc: { fontSize: 12, fontWeight: '400', color: colors.textMuted, flex: 1 },
    sectionHeader: { backgroundColor: colors.bg, paddingHorizontal: 16, marginHorizontal: -16, paddingVertical: 8, marginTop: 6 },
    sectionHeaderText: { color: colors.textSecondary, fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    searchContainer: { padding: 16, backgroundColor: colors.card, ...SHADOWS.sm, zIndex: 5 },
    searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.cardBorder },
    searchInput: { flex: 1, paddingVertical: 12, ...typography.body },

    // Search Result Indicator
    searchActiveBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 16,
    },
    searchActiveTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
    searchActiveSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    searchClearBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.divider,
        gap: 4
    },
    searchClearText: { fontSize: 13, fontWeight: '700', color: colors.accent },

    list: { flex: 1 },
});
