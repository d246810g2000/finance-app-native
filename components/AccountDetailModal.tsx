import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
    View, Text, Pressable, Modal, StyleSheet,
    TouchableWithoutFeedback, ScrollView,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, SHADOWS } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import ModalBackdrop from './ui/ModalBackdrop';
import SegmentedControl from './ui/SegmentedControl';
import { useBottomSheetSwipe } from './ui/useBottomSheetSwipe';
import BottomSheetGestureWrapper from './ui/BottomSheetGestureWrapper';
import { RawRecord } from '../types';
import { transformRecord, initializeAccountData, filterAndSortRecords, updateAccountBalancesAndSnapshots } from '../services/financeService';
import { Ionicons } from '@expo/vector-icons';
import { useFinance } from '../context/FinanceContext';
import { parseFormattedDate, zeroPadDate } from '../utils/dateUtils';
import { EXCHANGE_RATES } from '../constants';

interface AccountDetailModalProps {
    visible: boolean;
    accountName: string;
    onClose: () => void;
}

export default function AccountDetailModal({ visible, accountName, onClose }: AccountDetailModalProps) {
    const { colors, typography } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { records: rawRecords } = useFinance();
    const [viewMode, setViewMode] = useState<'year' | 'month'>('month');
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [selectedRecord, setSelectedRecord] = useState<any>(null);
    const swipe = useBottomSheetSwipe(onClose, visible, { enableHorizontalDismiss: true });

    useEffect(() => {
        if (visible) {
            setCurrentDate(new Date());
        }
    }, [visible]);

    const shiftDate = useCallback((direction: -1 | 1) => {
        setCurrentDate(prev => {
            const next = new Date(prev);
            if (viewMode === 'year') {
                next.setFullYear(next.getFullYear() + direction);
            } else {
                next.setMonth(next.getMonth() + direction);
            }
            return next;
        });
    }, [viewMode]);

    const { periodStart, periodEnd } = useMemo(() => {
        const y = currentDate.getFullYear();
        const m = viewMode === 'year' ? 0 : currentDate.getMonth();
        const start = new Date(y, m, 1);
        const end = new Date(y, viewMode === 'year' ? 12 : m + 1, 0, 23, 59, 59, 999);
        return { periodStart: start, periodEnd: end };
    }, [currentDate, viewMode]);

    const dateDisplay = viewMode === 'year'
        ? `${currentDate.getFullYear()}-01-01 ~${currentDate.getFullYear()} -12 - 31`
        : `${currentDate.getFullYear()} -${String(currentDate.getMonth() + 1).padStart(2, '0')}-01 ~${currentDate.getFullYear()} -${String(currentDate.getMonth() + 1).padStart(2, '0')} -${String(periodEnd.getDate()).padStart(2, '0')} `;

    // Calculate balance using the SAME logic as the dashboard (processAndAggregateRecords)
    const { displayRecords, totalBalance } = useMemo(() => {
        // 1. Get the authoritative account balance (same as dashboard)
        //    ALWAYS use TODAY as the end date, so "當前餘額" reflects the real current balance
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const { accountRunningBalances } = initializeAccountData(rawRecords);
        const balanceCopy = { ...accountRunningBalances };
        const recordsUpToToday = filterAndSortRecords(rawRecords, null, today);
        updateAccountBalancesAndSnapshots(recordsUpToToday, balanceCopy);
        const authoritativeBalance = Math.round(balanceCopy[accountName] || 0);

        // 2. Build the display list with per-record running balances
        //    Process ALL records for this account chronologically to compute running balances
        const accountRecords = filterAndSortRecords(rawRecords).filter(r =>
            r['收款(轉入)'] === accountName || r['付款(轉出)'] === accountName
        );

        let runBal = 0;
        const processedRecords = accountRecords.map((r, index) => {
            const cleanedAmountStr = (r['金額'] || '').toString().replace(/[,￥$€£]/g, '').trim();
            let amount = parseFloat(cleanedAmountStr) || 0;
            const currency = r['幣別'];
            if (currency && currency !== 'TWD' && EXCHANGE_RATES[currency]) {
                amount *= EXCHANGE_RATES[currency];
            }
            amount = Math.round(amount);

            let isIncome = false;
            let displayAmount = 0;

            if (r['收款(轉入)'] === accountName) {
                runBal += amount;
                displayAmount = amount;
                isIncome = true;
            } else if (r['付款(轉出)'] === accountName) {
                runBal -= amount;
                displayAmount = amount;
                isIncome = false;
            }

            return {
                ...r,
                isIncome,
                displayAmount,
                runningBalance: runBal,
                index,
            };
        });

        // 3. Filter for the selected period
        const displayRecords = processedRecords.filter(r => {
            if (!r.parsedDate) return false;
            return r.parsedDate >= periodStart && r.parsedDate <= periodEnd;
        }).sort((a, b) => b.index - a.index);

        return { displayRecords, totalBalance: authoritativeBalance };
    }, [rawRecords, accountName, periodStart, periodEnd]);

    const renderItem = useCallback(({ item }: { item: any }) => {
        const isIncome = item.isIncome;
        const amount = item.displayAmount;

        let targetAccountText = '';
        const rawCategory = item['分類'] || item['主類別'];
        if (rawCategory === '轉帳') {
            if (isIncome) {
                targetAccountText = `${item['付款(轉出)']} >> ${accountName} `;
            } else {
                targetAccountText = `${accountName} >> ${item['收款(轉入)']} `;
            }
        } else {
            targetAccountText = accountName;
        }

        const category = item['分類'] || item['主類別'] || '';
        const subCategory = item['子分類'] || item['子類別'] ? ` - ${item['子分類'] || item['子類別']} ` : '';
        const categoryDisplay = `${category}${subCategory} `;
        const note = item['商家'] || item['備註'] ? ` ${item['商家'] || item['備註']} ` : '';
        const dateStr = item['日期'] ? zeroPadDate(item['日期'].toString()) : '';
        // Date formatting output: YYYY-MM-DD
        const formattedDateObj = parseFormattedDate(item['日期']?.toString() || '');
        const outDateStr = formattedDateObj ? `${formattedDateObj.getFullYear()} -${String(formattedDateObj.getMonth() + 1).padStart(2, '0')} -${String(formattedDateObj.getDate()).padStart(2, '0')} ` : dateStr;

        const projectStr = item['專案'] ? ` "${item['專案']}"` : '';

        return (
            <Pressable onPress={() => setSelectedRecord(item)}>
                <View style={styles.recordRow}>
                    <View style={[styles.iconContainer, { backgroundColor: isIncome ? colors.greenLight : colors.yellowLight }]}>
                        <Ionicons name={isIncome ? 'arrow-down' : 'arrow-up'} size={18} color={isIncome ? colors.green : colors.red} />
                    </View>
                    <View style={styles.recordMain}>
                        <Text style={styles.recordTitle} numberOfLines={1}>{categoryDisplay}</Text>
                        <Text style={styles.recordDate} numberOfLines={1}>{outDateStr}{projectStr}{note}</Text>
                    </View>
                    <View style={styles.recordRight}>
                        <View style={styles.amountBalanceRow}>
                            <Text style={[styles.recordAmount, { color: isIncome ? colors.green : colors.red }]}>
                                {isIncome ? 'TW$ ' : 'TW$ -'}{amount.toLocaleString()}
                            </Text>
                            <Text style={styles.recordBalance}> » {item.runningBalance.toLocaleString()}</Text>
                        </View>
                        {targetAccountText ? (
                            <Text style={[styles.recordTarget, { color: colors.textSecondary }]} numberOfLines={1}>
                                {targetAccountText}
                            </Text>
                        ) : null}
                    </View>
                </View>
            </Pressable>
        );
    }, [accountName, colors, styles]);

    return (
        <Modal visible={visible} animationType="none" transparent presentationStyle="overFullScreen">
            <ModalBackdrop colors={colors}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.dismissArea} />
                </TouchableWithoutFeedback>
                <BottomSheetGestureWrapper
                    swipe={swipe}
                    style={[styles.container, { paddingBottom: insets.bottom + 16 }]}
                    header={(
                        <>
                            <View style={styles.handleBar} />
                            <View style={styles.header}>
                            <View style={styles.headerTop}>
                                <Ionicons name="card" size={28} color={colors.accent} style={{ marginRight: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.title} numberOfLines={1}>{accountName}</Text>
                                </View>
                                <Pressable style={styles.closeBtn} onPress={onClose}>
                                    <Text style={styles.closeBtnText}>關閉</Text>
                                </Pressable>
                            </View>

                            <View style={styles.headerRow}>
                                <View style={styles.headerStatBox}>
                                    <Text style={styles.statLabel}>當前餘額</Text>
                                    <Text style={[styles.statValue, { color: colors.green }]}>TW$ {totalBalance.toLocaleString()}</Text>
                                </View>
                            </View>

                            {/* View Mode Toggle */}
                            <View style={styles.modeRow}>
                                <SegmentedControl
                                    options={[
                                        { value: 'year', label: '年' },
                                        { value: 'month', label: '月' },
                                    ]}
                                    value={viewMode}
                                    onChange={setViewMode}
                                    accessibilityLabel="檢視週期"
                                />
                            </View>
                        </View>
                        </>
                    )}
                >
                    {/* Date Navigator */}
                    <View style={styles.navigatorContainer}>
                        <Pressable onPress={() => shiftDate(-1)} style={styles.navButton}>
                            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                        </Pressable>
                        <Text style={styles.navDateText}>{dateDisplay}</Text>
                        <Pressable onPress={() => shiftDate(1)} style={styles.navButton}>
                            <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
                        </Pressable>
                    </View>

                    <FlatList
                        data={displayRecords}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        onScroll={swipe.handleScroll}
                        scrollEventThrottle={swipe.scrollEventThrottle}
                        ItemSeparatorComponent={() => <View style={styles.separator} />}
                        ListEmptyComponent={
                            <View style={styles.emptyView}>
                                <Text style={styles.emptyText}>無交易記錄</Text>
                            </View>
                        }
                    />

                    {/* Detail Modal Pop-up inner overlay */}
                    <Modal visible={!!selectedRecord} transparent animationType="slide" onRequestClose={() => setSelectedRecord(null)}>
                        <ModalBackdrop colors={colors} style={styles.innerModalOverlay}>
                            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedRecord(null)} />
                            {(() => {
                                const trs = selectedRecord ? transformRecord(selectedRecord) : null;
                                const tr = Array.isArray(trs) ? trs[0] : trs;
                                return (
                                    <View style={styles.detailModal}>
                                        <View style={styles.detailHeader}>
                                            <View style={[styles.typeTag, { backgroundColor: tr?.['記錄類型'] === '收入' || tr?.['記錄類型'] === '轉入' ? colors.green : tr?.['記錄類型'] === '轉帳' ? colors.blue : colors.red }]}>
                                                <Text style={styles.typeTagText}>{tr?.['記錄類型']}</Text>
                                            </View>
                                            <Text style={styles.detailTitle}>{tr?.['商家'] || tr?.['名稱'] || (tr?.['主類別'] === '轉帳' ? '' : '未命名')}</Text>
                                            <Text style={[styles.detailAmount, tr && tr['金額'] >= 0 ? { color: colors.green } : { color: colors.red }]}>
                                                {tr?.['金額']?.toLocaleString()}
                                            </Text>
                                        </View>
                                        <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 20 }}>
                                            <View style={styles.detailRow}>
                                                <Text style={styles.detailLabel}>日期時間</Text>
                                                <Text style={styles.detailValue}>{tr?.['日期']} {tr?.['時間']}</Text>
                                            </View>
                                            <View style={styles.detailRow}>
                                                <Text style={styles.detailLabel}>分類</Text>
                                                <Text style={styles.detailValue}>{tr?.['主類別']} {tr?.['子類別'] ? `- ${tr?.['子類別']}` : ''}</Text>
                                            </View>
                                            <View style={styles.detailRow}>
                                                <Text style={styles.detailLabel}>金額(原幣)</Text>
                                                <Text style={styles.detailValue}>{selectedRecord?.['幣別'] || 'TWD'} {selectedRecord?.['金額']}</Text>
                                            </View>
                                            <View style={styles.detailRow}>
                                                <Text style={styles.detailLabel}>帳戶</Text>
                                                <Text style={styles.detailValue}>{tr?.['記錄類型'] === '轉帳' ? `${selectedRecord?.['付款(轉出)']} >> ${selectedRecord?.['收款(轉入)']}` : tr?.['帳戶']}</Text>
                                            </View>
                                            {tr?.['專案'] && (
                                                <View style={styles.detailRow}>
                                                    <Text style={styles.detailLabel}>專案</Text>
                                                    <Text style={styles.detailValue}>{tr?.['專案']}</Text>
                                                </View>
                                            )}
                                            <View style={styles.detailRow}>
                                                <Text style={styles.detailLabel}>備註/描述</Text>
                                                <Text style={styles.detailValue}>{tr?.['描述'] || '無'}</Text>
                                            </View>
                                        </ScrollView>
                                    </View>
                                );
                            })()}
                        </ModalBackdrop>
                    </Modal>
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

    // Header
    header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    title: { ...typography.h3, letterSpacing: -0.3 },
    closeBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.accentLight, borderRadius: 16, borderWidth: 1, borderColor: colors.accentBorder },
    closeBtnText: { color: colors.accent, fontWeight: '700', fontSize: 14 },

    // Header Stat Box
    headerRow: { flexDirection: 'row', marginBottom: 16 },
    headerStatBox: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', backgroundColor: colors.greenLight, ...SHADOWS.sm },
    statLabel: { ...typography.caption, color: colors.green },
    statValue: { fontSize: 20, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },

    // Tabs
    modeRow: { paddingBottom: 4 },
    modeToggle: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.divider, ...SHADOWS.sm },
    modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    modeBtnActive: { backgroundColor: colors.accentLight, ...SHADOWS.sm },
    modeBtnText: { ...typography.subtitle, color: colors.textMuted },
    modeBtnTextActive: { color: colors.accent, fontWeight: '700' },

    // Navigator
    navigatorContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.divider },
    navDateText: { ...typography.body, fontWeight: '600', color: colors.textSecondary, flex: 1, textAlign: 'center' },
    navButton: { padding: 8, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border },

    // List
    recordRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: colors.card },
    iconContainer: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    recordMain: { flex: 1, marginRight: 8 },
    recordTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
    recordDate: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
    recordRight: { alignItems: 'flex-end' },
    amountBalanceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    recordAmount: { ...typography.body, fontWeight: '700', letterSpacing: -0.5 },
    recordBalance: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
    recordTarget: { ...typography.caption, marginTop: 4 },

    separator: { height: 1, backgroundColor: colors.divider, marginHorizontal: 20 },
    emptyView: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { ...typography.bodySm },

    // Single Record Detail Inner Modal
    innerModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    detailModal: {
        width: '85%',
        maxHeight: '80%',
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 24, ...SHADOWS.lg
    },
    detailHeader: { alignItems: 'center', marginBottom: 20 },
    typeTag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginBottom: 16 },
    typeTagText: { color: colors.textWhite, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
    detailTitle: { ...typography.h2, textAlign: 'center', marginBottom: 8 },
    detailAmount: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
    detailBody: {},
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
    detailLabel: { ...typography.bodySm, color: colors.textMuted, flex: 1 },
    detailValue: { ...typography.body, fontWeight: '600', flex: 2, textAlign: 'right' },
});
