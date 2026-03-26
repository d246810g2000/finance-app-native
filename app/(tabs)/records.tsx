import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import { View, Text, TextInput, Modal, Pressable, StyleSheet, SectionList, RefreshControl, Platform, LayoutAnimation, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from 'expo-router';
import { useFinance } from '../../context/FinanceContext';
import { transformRecordsForExport } from '../../services/financeService';
import { TransformedRecord } from '../../types';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../../theme';
import { zeroPadDate, parseFormattedDate, getStartOfWeek, getEndOfWeek, addDays, addWeeks, addMonths, addYears } from '../../utils/dateUtils';
import MonthlyCalendar from '../../components/MonthlyCalendar';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import UnifiedDateNavigator from '../../components/layout/UnifiedDateNavigator';

type SortKey = '日期' | '主類別' | '金額';
type SortDirection = 'asc' | 'desc';

const TYPE_COLORS: Record<string, string> = {
    '支出': COLORS.red, '收入': COLORS.green, '轉帳': COLORS.blue,
    '轉出': COLORS.red, '轉入': COLORS.green,
};

export default function CalendarScreen() {
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
                >
                    <Text style={styles.headerTitleText}>{searchFilters ? '搜尋結果' : '記錄'}</Text>
                    {!searchFilters && (
                        <View style={styles.modeBadge}>
                            <Text style={styles.modeBadgeText}>
                                {viewMode === 'day' ? '日' : viewMode === 'week' ? '週' : viewMode === 'month' ? '月' : '年'}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color={COLORS.textSecondary} style={{ marginLeft: 2 }} />
                        </View>
                    )}
                </Pressable>
            ),
            headerLeft: () => (
                <TouchableOpacity
                    onPress={() => {
                        if (searchFilters) {
                            // 當從搜尋結果返回時，清除背景搜尋過濾並開啟視窗
                            setSearchFilters(null);
                            setSearchModalVisible(true);
                        } else {
                            setMenuVisible(true);
                        }
                    }}
                    style={{ marginLeft: 16 }}
                >
                    <Ionicons name={searchFilters ? "chevron-back" : "menu-outline"} size={28} color={COLORS.textPrimary} />
                </TouchableOpacity>
            ),
        });
    }, [navigation, viewMode, showModePicker, searchFilters]);

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

        const groups: { [key: string]: TransformedRecord[] } = {};
        mergedData.forEach(item => {
            const dateStr = item['日期'] || '未知';
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(item);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

        return sortedKeys.map(key => ({
            title: key,
            data: groups[key]
        }));
    }, [filteredData]);

    const renderItem = useCallback(({ item }: { item: TransformedRecord }) => {
        const isTransfer = item['記錄類型'] === '轉帳';
        const typeColor = isTransfer ? COLORS.blue : (TYPE_COLORS[item['記錄類型']] || COLORS.textMuted);

        if (isTransfer) {
            // Transfer card — matches AccountDetailModal's transfer style
            const fromAccount = item['帳戶'];
            const toAccount = item['描述']; // stored in merged step
            return (
                <Pressable
                    onPress={() => setSelectedRecord(item)}
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                >
                    <View style={[styles.accentStrip, { backgroundColor: COLORS.blue }]} />
                    <View style={styles.cardContent}>
                        <View style={styles.topRow}>
                            <Text style={styles.cardTitle} numberOfLines={1}>
                                {fromAccount} » {toAccount}
                            </Text>
                            <View style={[styles.categoryBadge, { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.2)' }]}>
                                <Text style={[styles.categoryBadgeText, { color: COLORS.blue }]}>轉帳</Text>
                            </View>
                            <Text style={[styles.cardAmount, { color: COLORS.blue }]}>
                                ${item['金額'].toLocaleString()}
                            </Text>
                        </View>
                        <View style={styles.bottomRow}>
                            {item['時間'] !== '09:00' && <Text style={styles.metaText}>🕒 {item['時間']}</Text>}
                            {item['專案'] ? <Text style={styles.metaText}>📁 {item['專案']}</Text> : null}
                        </View>
                    </View>
                </Pressable>
            );
        }

        // Normal record card (支出/收入)
        return (
            <Pressable
                onPress={() => setSelectedRecord(item)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
                <View style={[styles.accentStrip, { backgroundColor: typeColor }]} />
                <View style={styles.cardContent}>
                    <View style={styles.topRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item['商家'] || item['名稱'] || '未命名'}</Text>
                        <View style={styles.categoryBadge}>
                            <Text style={styles.categoryBadgeText}>{item['主類別']}</Text>
                        </View>
                        <Text style={[styles.cardAmount, { color: item['金額'] >= 0 ? COLORS.green : COLORS.red }]}>
                            {item['金額'].toLocaleString()}
                        </Text>
                    </View>
                    <View style={styles.bottomRow}>
                        {item['時間'] !== '09:00' && <Text style={styles.metaText}>🕒 {item['時間']}</Text>}
                        {item['帳戶'] ? <Text style={styles.metaText}>💳 {item['帳戶']}</Text> : null}
                        {item['專案'] ? <Text style={styles.metaText}>📁 {item['專案']}</Text> : null}
                        {item['描述'] ? <Text style={styles.metaDesc} numberOfLines={1}>{item['描述']}</Text> : null}
                    </View>
                </View>
            </Pressable>
        );
    }, []);

    const renderSectionHeader = useCallback(({ section: { title } }: { section: { title: string } }) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
        </View>
    ), []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (refreshRecords) await refreshRecords();
        setRefreshing(false);
    }, [refreshRecords]);

    return (
        <View style={styles.container}>
            {/* Header Nav + Mode Picker Dropdown */}
            <View style={styles.headerNavContainer}>
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
                        <TouchableOpacity style={styles.searchClearBtn} onPress={() => setSearchFilters(null)}>
                            <Text style={styles.searchClearText}>清除</Text>
                            <Ionicons name="close-circle" size={16} color={COLORS.accent} />
                        </TouchableOpacity>
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
                                        {viewMode === m && <Ionicons name="checkmark" size={18} color="#fff" />}
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                    </>
                )}
            </View>

            <SectionList
                sections={sections}
                ListHeaderComponent={null}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                keyExtractor={(item, index) => item.id || `${item['日期']}-${index}`}
                stickySectionHeadersEnabled={true}
                ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
            />

            {/* Calendar Modal */}
            <Modal visible={showCalendarModal} transparent animationType="fade" onRequestClose={() => setShowCalendarModal(false)}>
                <BlurView intensity={20} tint="dark" style={styles.modalOverlay}>
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
                </BlurView>
            </Modal>

            {/* Detail Modal */}
            <Modal visible={!!selectedRecord} transparent animationType="slide" onRequestClose={() => setSelectedRecord(null)}>
                <BlurView intensity={30} tint="dark" style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedRecord(null)} />
                    <View style={styles.detailModal}>
                        <View style={styles.detailHeader}>
                            <View style={[styles.typeTag, { backgroundColor: TYPE_COLORS[selectedRecord?.['記錄類型'] || ''] }]}>
                                <Text style={styles.typeTagText}>{selectedRecord?.['記錄類型']}</Text>
                            </View>
                            <Text style={styles.detailTitle}>{selectedRecord?.['商家'] || selectedRecord?.['名稱'] || '未命名'}</Text>
                            <Text style={[styles.detailAmount, selectedRecord && selectedRecord['金額'] >= 0 ? { color: COLORS.green } : { color: COLORS.red }]}>
                                {selectedRecord?.['金額'].toLocaleString()}
                            </Text>
                        </View>
                        <ScrollView style={styles.detailBody}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>日期時間</Text>
                                <Text style={styles.detailValue}>{selectedRecord?.['日期']} {selectedRecord?.['時間']}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>分類</Text>
                                <Text style={styles.detailValue}>{selectedRecord?.['主類別']} - {selectedRecord?.['子類別']}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>帳戶</Text>
                                <Text style={styles.detailValue}>{selectedRecord?.['帳戶']}</Text>
                            </View>
                            {selectedRecord?.['專案'] && (
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>專案</Text>
                                    <Text style={styles.detailValue}>{selectedRecord?.['專案']}</Text>
                                </View>
                            )}
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>備註/描述</Text>
                                <Text style={styles.detailValue}>{selectedRecord?.['描述'] || '無'}</Text>
                            </View>
                        </ScrollView>
                    </View>
                </BlurView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    // Header Nav
    headerNavContainer: { backgroundColor: COLORS.headerBg, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.divider, zIndex: 100, ...SHADOWS.sm },
    headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
    headerTitleText: { ...TYPOGRAPHY.h3, fontSize: 17, marginRight: 6 },
    modeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.divider,
    },
    modeBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },

    // Dropdown
    dropdownBackdrop: {
        position: 'absolute',
        top: 0,
        left: -100,
        right: -100,
        height: 2000,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 90,
    },
    dropdownMenu: {
        position: 'absolute',
        top: 10,
        alignSelf: 'center',
        backgroundColor: COLORS.card,
        width: 180,
        borderRadius: 20,
        padding: 8,
        ...SHADOWS.lg,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        zIndex: 100,
    },
    dropdownItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 2,
    },
    dropdownItemActive: { backgroundColor: COLORS.accent },
    dropdownItemContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dropdownItemText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
    dropdownItemTextActive: { color: '#fff' },
    // Calendar Modal
    calendarModalContent: { backgroundColor: COLORS.card, margin: 20, borderRadius: 24, padding: 12, paddingBottom: 20, ...SHADOWS.lg },
    // Record Card — matches travel/project card design system
    card: { flexDirection: 'row', borderRadius: 14, marginHorizontal: 16, marginBottom: 10, marginTop: 2, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden', backgroundColor: COLORS.card, ...SHADOWS.sm },
    cardPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
    accentStrip: { width: 4 },
    cardContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, paddingLeft: 12 },
    topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3, flex: 1 },
    categoryBadge: { backgroundColor: COLORS.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: COLORS.cardBorder, marginHorizontal: 8 },
    categoryBadgeText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
    cardAmount: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
    bottomRow: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    metaText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
    metaDesc: { fontSize: 12, fontWeight: '400', color: COLORS.textMuted, flex: 1 },
    itemSeparator: { height: 1, backgroundColor: COLORS.divider, marginHorizontal: 24 },
    sectionHeader: { backgroundColor: COLORS.bg, paddingHorizontal: 16, paddingVertical: 8, marginTop: 6 },
    sectionHeaderText: { color: COLORS.textSecondary, fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    searchContainer: { padding: 16, backgroundColor: COLORS.card, ...SHADOWS.sm, zIndex: 5 },
    searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.cardBorder },
    searchInput: { flex: 1, paddingVertical: 12, ...TYPOGRAPHY.body },

    // Search Result Indicator
    searchActiveBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 16,
    },
    searchActiveTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
    searchActiveSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    searchClearBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.bg,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.divider,
        gap: 4
    },
    searchClearText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },

    // Filter
    typeFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    typeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.cardBorder },
    typeChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent, ...SHADOWS.sm },
    typeChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
    typeChipTextActive: { color: '#fff' },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'center' },
    // Detail Modal Styles
    detailModalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    detailModal: {
        maxHeight: '80%',
        backgroundColor: COLORS.card,
        margin: 24,
        borderRadius: 24, padding: 24, ...SHADOWS.lg
    },
    detailHeader: { alignItems: 'center', marginBottom: 20 },
    typeTag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginBottom: 16 },
    typeTagText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
    detailTitle: { ...TYPOGRAPHY.h2, textAlign: 'center', marginBottom: 8 },
    detailAmount: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
    detailBody: {},
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
    detailLabel: { ...TYPOGRAPHY.bodySm, color: COLORS.textMuted, flex: 1 },
    detailValue: { ...TYPOGRAPHY.body, fontWeight: '600', flex: 2, textAlign: 'right' },
});
