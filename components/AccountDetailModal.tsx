import React, { useMemo, useCallback, useState, useEffect, memo } from 'react';
import {
    View, Text, Pressable, Modal, StyleSheet,
    TouchableWithoutFeedback, ScrollView, InteractionManager,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, RADIUS } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import ModalBackdrop from './ui/ModalBackdrop';
import SegmentedControl from './ui/SegmentedControl';
import { useBottomSheetSwipe } from './ui/useBottomSheetSwipe';
import BottomSheetGestureWrapper from './ui/BottomSheetGestureWrapper';
import { RawRecord } from '../types';
import { transformRecord, initializeAccountData, filterAndSortRecords, updateAccountBalancesAndSnapshots, getCategoryForAccount } from '../services/financeService';
import { Ionicons } from '@expo/vector-icons';
import { useFinance } from '../context/FinanceContext';
import { useFinanceUI } from '../context/FinanceUIContext';
import { parseFormattedDate, zeroPadDate } from '../utils/dateUtils';
import { EXCHANGE_RATES } from '../constants';
import { getSettingsForCard } from '../services/creditCardSettingsService';

interface AccountDetailModalProps {
    visible: boolean;
    accountName: string;
    onClose: () => void;
}

type AccountDisplayRecord = RawRecord & {
    isIncome: boolean;
    displayAmount: number;
    runningBalance: number;
    index: number;
};

const EMPTY_ACCOUNT_DATA = {
    displayRecords: [] as AccountDisplayRecord[],
    totalBalance: 0,
};

const LIST_CONTENT_STYLE = { paddingBottom: 40 } as const;

const AccountRecordSeparator = memo(function AccountRecordSeparator({
    color,
}: {
    color: string;
}) {
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color, marginHorizontal: 20 }} />;
});

type AccountRowProps = {
    item: AccountDisplayRecord;
    accountName: string;
    colors: AppColors;
    styles: ReturnType<typeof createStyles>;
    onPress: (item: AccountDisplayRecord) => void;
};

const AccountRecordRow = memo(function AccountRecordRow({
    item,
    accountName,
    colors,
    styles,
    onPress,
}: AccountRowProps) {
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
    const formattedDateObj = parseFormattedDate(item['日期']?.toString() || '');
    const outDateStr = formattedDateObj ? `${formattedDateObj.getFullYear()} -${String(formattedDateObj.getMonth() + 1).padStart(2, '0')} -${String(formattedDateObj.getDate()).padStart(2, '0')} ` : dateStr;
    const projectStr = item['專案'] ? ` "${item['專案']}"` : '';

    return (
        <Pressable
            onPress={() => onPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`${categoryDisplay}，金額 ${amount.toLocaleString()}`}
        >
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
                        <Text style={[styles.recordAmount, { color: isIncome ? colors.green : colors.red }]} selectable>
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
});

export default function AccountDetailModal({ visible, accountName, onClose }: AccountDetailModalProps) {
    const { colors, typography } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { records: rawRecords, customMappings, creditCardSettings } = useFinance();
    const { openReconciliation } = useFinanceUI();
    const [viewMode, setViewMode] = useState<'year' | 'month'>('month');
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [selectedRecord, setSelectedRecord] = useState<any>(null);
    const [accountData, setAccountData] = useState(EMPTY_ACCOUNT_DATA);
    const swipe = useBottomSheetSwipe(onClose, visible);

    const isCreditCard = useMemo(
        () => getCategoryForAccount(accountName, customMappings) === '信用卡',
        [accountName, customMappings]
    );
    const cardSettings = useMemo(
        () => getSettingsForCard(creditCardSettings, accountName),
        [creditCardSettings, accountName]
    );

    useEffect(() => {
        if (visible) {
            setCurrentDate(new Date());
        } else {
            setAccountData(EMPTY_ACCOUNT_DATA);
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

    // 餘額與列表較重：僅 visible 時、且等進場互動結束後再算
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        const task = InteractionManager.runAfterInteractions(() => {
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            const { accountRunningBalances } = initializeAccountData(rawRecords);
            const balanceCopy = { ...accountRunningBalances };
            const recordsUpToToday = filterAndSortRecords(rawRecords, null, today);
            updateAccountBalancesAndSnapshots(recordsUpToToday, balanceCopy);
            const authoritativeBalance = Math.round(balanceCopy[accountName] || 0);

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

            const nextRecords = processedRecords.filter(r => {
                if (!r.parsedDate) return false;
                return r.parsedDate >= periodStart && r.parsedDate <= periodEnd;
            }).sort((a, b) => b.index - a.index);

            if (!cancelled) {
                setAccountData({ displayRecords: nextRecords, totalBalance: authoritativeBalance });
            }
        });
        return () => {
            cancelled = true;
            task.cancel?.();
        };
    }, [visible, rawRecords, accountName, periodStart, periodEnd]);

    const { displayRecords, totalBalance } = accountData;

    const onSelectRecord = useCallback((item: AccountDisplayRecord) => {
        setSelectedRecord(item);
    }, []);

    const renderItem = useCallback(({ item }: { item: AccountDisplayRecord }) => (
        <AccountRecordRow
            item={item}
            accountName={accountName}
            colors={colors}
            styles={styles}
            onPress={onSelectRecord}
        />
    ), [accountName, colors, styles, onSelectRecord]);

    const keyExtractor = useCallback((item: AccountDisplayRecord, index: number) => {
        const id = item.id != null ? String(item.id) : '';
        return id || `account-row-${item.index}-${index}`;
    }, []);

    const renderSeparator = useCallback(
        () => <AccountRecordSeparator color={colors.outlineVariant as string} />,
        [colors.outlineVariant]
    );

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
                                    <Ionicons name="card" size={28} color={colors.primary} style={{ marginRight: 12 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.title} numberOfLines={1}>{accountName}</Text>
                                    </View>
                                    <Pressable
                                        style={styles.closeBtn}
                                        onPress={onClose}
                                        accessibilityRole="button"
                                        accessibilityLabel="關閉帳戶明細"
                                    >
                                        <Text style={styles.closeBtnText}>關閉</Text>
                                    </Pressable>
                                </View>

                                <View style={styles.headerRow}>
                                    <View style={styles.headerStatBox}>
                                        <Text style={styles.statLabel}>當前餘額</Text>
                                        <Text style={[styles.statValue, { color: colors.green }]} selectable>
                                            TW$ {totalBalance.toLocaleString()}
                                        </Text>
                                    </View>
                                </View>

                                {isCreditCard ? (
                                    <View style={styles.reconEntryRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.reconEntryLabel}>對帳</Text>
                                            <Text style={styles.reconEntryHint}>
                                                {cardSettings.statementGroup
                                                    ? `${cardSettings.statementGroup} · 每月 ${cardSettings.statementDay} 日`
                                                    : `每月 ${cardSettings.statementDay} 日結帳`}
                                            </Text>
                                        </View>
                                        <Pressable
                                            style={styles.reconBtn}
                                            onPress={() => openReconciliation(accountName)}
                                            accessibilityRole="button"
                                            accessibilityLabel="進入對帳模式"
                                        >
                                            <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
                                            <Text style={styles.reconBtnText}>對帳</Text>
                                        </Pressable>
                                    </View>
                                ) : null}

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
                    <View style={styles.navigatorContainer}>
                        <Pressable
                            onPress={() => shiftDate(-1)}
                            style={styles.navButton}
                            accessibilityRole="button"
                            accessibilityLabel="上一個期間"
                        >
                            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                        </Pressable>
                        <Text style={styles.navDateText}>{dateDisplay}</Text>
                        <Pressable
                            onPress={() => shiftDate(1)}
                            style={styles.navButton}
                            accessibilityRole="button"
                            accessibilityLabel="下一個期間"
                        >
                            <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
                        </Pressable>
                    </View>

                    <View style={styles.listWrap}>
                        <FlashList
                            data={displayRecords}
                            renderItem={renderItem}
                            keyExtractor={keyExtractor}
                            contentContainerStyle={LIST_CONTENT_STYLE}
                            onScroll={swipe.handleScroll}
                            scrollEventThrottle={swipe.scrollEventThrottle}
                            // @ts-expect-error FlashList v2 estimatedItemSize
                            estimatedItemSize={72}
                            ItemSeparatorComponent={renderSeparator}
                            ListEmptyComponent={
                                <View style={styles.emptyView}>
                                    <Text style={styles.emptyText}>無交易記錄</Text>
                                </View>
                            }
                        />
                    </View>

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
    dismissArea: { flex: 1, width: '100%' },
    container: { backgroundColor: colors.surfaceContainer, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, height: '90%', overflow: 'hidden' },
    handleBar: { width: 32, height: 4, backgroundColor: colors.outline, borderRadius: RADIUS.full, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
    header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet },
    headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
    title: { ...typography.h3, letterSpacing: -0.3, flex: 1 },
    closeBtn: { paddingHorizontal: 16, paddingVertical: 8, minHeight: 40, justifyContent: 'center', backgroundColor: colors.primaryContainer, borderRadius: RADIUS.full },
    closeBtnText: { color: colors.onPrimaryContainer, fontWeight: '700', fontSize: 14 },
    headerRow: { flexDirection: 'row', marginBottom: 16 },
    headerStatBox: { flex: 1, padding: 16, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: colors.greenLight, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.outlineVariant },
    statLabel: { ...typography.caption, color: colors.green },
    statValue: { fontSize: 20, fontWeight: '800', marginTop: 4, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    reconEntryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        paddingHorizontal: 12,
        paddingVertical: 12,
        minHeight: 52,
        backgroundColor: colors.primaryContainer,
        borderRadius: RADIUS.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
    },
    reconEntryLabel: { ...typography.subtitle, fontWeight: '700', color: colors.textPrimary },
    reconEntryHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    reconBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 14,
        paddingVertical: 8,
        minHeight: 40,
        backgroundColor: colors.surfaceContainer,
        borderRadius: RADIUS.full,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
    },
    reconBtnText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
    modeRow: { paddingBottom: 4 },
    navigatorContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
    navDateText: { ...typography.body, fontWeight: '600', color: colors.textSecondary, flex: 1, textAlign: 'center' },
    navButton: { padding: 8, minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceVariant, borderRadius: RADIUS.full },
    listWrap: { flex: 1, minHeight: 120 },
    recordRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, minHeight: 56, backgroundColor: colors.surfaceContainer },
    iconContainer: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    recordMain: { flex: 1, marginRight: 8 },
    recordTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
    recordDate: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
    recordRight: { alignItems: 'flex-end' },
    amountBalanceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    recordAmount: { ...typography.body, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    recordBalance: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', fontVariant: ['tabular-nums'] },
    recordTarget: { ...typography.caption, marginTop: 4 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant, marginHorizontal: 20 },
    emptyView: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { ...typography.bodySm },
    innerModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    detailModal: {
        width: '85%',
        maxHeight: '80%',
        backgroundColor: colors.surfaceContainer,
        borderRadius: RADIUS.md,
        padding: 24,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outlineVariant,
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
