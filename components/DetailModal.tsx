import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
    View, Text, Pressable, FlatList, ScrollView, Modal, StyleSheet,
    Animated, PanResponder, TouchableWithoutFeedback, Dimensions
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { BlurView } from 'expo-blur';
import { TransformedRecord } from '../types';
import { COLORS, SHADOWS, CATEGORY_COLORS, TYPOGRAPHY } from '../theme';

type SortKey = '日期' | '金額' | '主類別' | '商家';
type SortDir = 'asc' | 'desc';
type ViewMode = 'list' | 'stats';

interface DetailModalProps {
    visible: boolean;
    title: string;
    records: TransformedRecord[];
    onClose: () => void;
}

const getRecordName = (r: TransformedRecord): string => {
    const parts = [r['主類別']];
    if (r['子類別']) parts.push(r['子類別']);
    if (r['商家']) parts.push(`(${r['商家']})`);
    return parts.join(' · ');
};

// ─── Stats View ───
function StatsView({ records, onScroll }: { records: TransformedRecord[], onScroll: (e: any) => void }) {
    const expenses = useMemo(() => records.filter(r => r['金額'] < 0), [records]);
    const incomes = useMemo(() => records.filter(r => r['金額'] > 0), [records]);

    const stats = useMemo(() => {
        const totalExp = expenses.reduce((s, r) => s + Math.abs(r['金額']), 0);
        const totalInc = incomes.reduce((s, r) => s + r['金額'], 0);
        const avgExp = expenses.length > 0 ? totalExp / expenses.length : 0;
        const maxExp = expenses.length > 0 ? Math.max(...expenses.map(r => Math.abs(r['金額']))) : 0;
        const maxExpRecord = expenses.find(r => Math.abs(r['金額']) === maxExp);
        return { totalExp, totalInc, avgExp, maxExp, maxExpRecord, expCount: expenses.length, incCount: incomes.length };
    }, [expenses, incomes]);

    // Category breakdown
    const categoryData = useMemo(() => {
        const catMap: { [key: string]: number } = {};
        expenses.forEach(r => {
            const cat = r['主類別'] || '未分類';
            catMap[cat] = (catMap[cat] || 0) + Math.abs(r['金額']);
        });
        return Object.entries(catMap)
            .map(([name, value]) => ({ name, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [expenses]);

    const totalCategoryExpense = categoryData.reduce((s, c) => s + c.value, 0);

    // Merchant top 5
    const merchantData = useMemo(() => {
        const mMap: { [key: string]: number } = {};
        expenses.forEach(r => {
            const m = r['商家'] || '(無商家)';
            mMap[m] = (mMap[m] || 0) + Math.abs(r['金額']);
        });
        return Object.entries(mMap)
            .map(([name, value]) => ({ name, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [expenses]);

    const maxMerchantValue = merchantData.length > 0 ? merchantData[0].value : 1;

    if (records.length === 0) {
        return (
            <View style={statsStyles.emptyView}>
                <Text style={statsStyles.emptyText}>無數據可分析</Text>
            </View>
        );
    }

    return (
        <ScrollView
            contentContainerStyle={{ paddingBottom: 60 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
        >
            {/* Summary Stats Cards */}
            <View style={statsStyles.cardsRow}>
                <View style={[statsStyles.statCard, { backgroundColor: COLORS.accentLight }]}>
                    <Text style={statsStyles.statLabel}>筆數</Text>
                    <Text style={[statsStyles.statValue, { color: COLORS.accent }]}>{records.length}</Text>
                    <Text style={statsStyles.statSub}>{stats.expCount} 支出 · {stats.incCount} 收入</Text>
                </View>
                <View style={[statsStyles.statCard, { backgroundColor: COLORS.redLight }]}>
                    <Text style={statsStyles.statLabel}>平均支出</Text>
                    <Text style={[statsStyles.statValue, { color: COLORS.red }]}>${Math.round(stats.avgExp).toLocaleString()}</Text>
                    <Text style={statsStyles.statSub}>每筆</Text>
                </View>
            </View>

            {/* Max single expense */}
            {stats.maxExpRecord ? (
                <View style={statsStyles.maxCard}>
                    <View style={statsStyles.maxHeader}>
                        <Text style={statsStyles.maxIcon}>💸</Text>
                        <Text style={statsStyles.maxTitle}>最大單筆支出</Text>
                    </View>
                    <View style={statsStyles.maxBody}>
                        <Text style={statsStyles.maxName} numberOfLines={1}>{getRecordName(stats.maxExpRecord)}</Text>
                        <Text style={statsStyles.maxAmount}>${stats.maxExp.toLocaleString()}</Text>
                    </View>
                    <Text style={statsStyles.maxDate}>{stats.maxExpRecord['日期']}</Text>
                </View>
            ) : null}

            {/* Category Breakdown */}
            {categoryData.length > 0 ? (
                <View style={statsStyles.section}>
                    <Text style={statsStyles.sectionTitle}>📊 支出類別分佈</Text>
                    {/* Distribution bar */}
                    <View style={statsStyles.distBar}>
                        {categoryData.map((cat, idx) => (
                            <View key={cat.name} style={{
                                width: `${totalCategoryExpense > 0 ? (cat.value / totalCategoryExpense) * 100 : 0}%` as any,
                                backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] as string,
                                height: '100%',
                            }} />
                        ))}
                    </View>
                    {categoryData.map((cat, idx) => {
                        const pct = totalCategoryExpense > 0 ? (cat.value / totalCategoryExpense) * 100 : 0;
                        return (
                            <View key={cat.name} style={statsStyles.catRow}>
                                <View style={statsStyles.catLeft}>
                                    <View style={[statsStyles.catDot, { backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] as string }]} />
                                    <Text style={statsStyles.catName}>{cat.name}</Text>
                                </View>
                                <View style={statsStyles.catRight}>
                                    <Text style={statsStyles.catAmount}>${cat.value.toLocaleString()}</Text>
                                    <Text style={statsStyles.catPct}>{pct.toFixed(1)}%</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ) : null}

            {/* Merchant Top 5 */}
            {merchantData.length > 0 ? (
                <View style={statsStyles.section}>
                    <Text style={statsStyles.sectionTitle}>🏪 商家排行 Top 5</Text>
                    {merchantData.map((m, idx) => {
                        const barWidth = (m.value / maxMerchantValue) * 100;
                        return (
                            <View key={m.name} style={statsStyles.merchantRow}>
                                <View style={statsStyles.merchantLeft}>
                                    <Text style={statsStyles.merchantRank}>{idx + 1}</Text>
                                    <Text style={statsStyles.merchantName} numberOfLines={1}>{m.name}</Text>
                                </View>
                                <View style={statsStyles.merchantBarContainer}>
                                    <View style={[statsStyles.merchantBar, { width: `${barWidth}%` as any }]} />
                                </View>
                                <Text style={statsStyles.merchantAmount}>${m.value.toLocaleString()}</Text>
                            </View>
                        );
                    })}
                </View>
            ) : null}
        </ScrollView>
    );
}

// ─── Main Component ───
export default function DetailModal({ visible, title, records, onClose }: DetailModalProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [sortKey, setSortKey] = useState<SortKey>('日期');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const panY = useRef(new Animated.Value(0)).current;
    const panX = useRef(new Animated.Value(0)).current;
    const isAtTopRef = useRef(true);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                const isVerticalSwipe = isAtTopRef.current && gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
                const isHorizontalSwipe = Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
                return isVerticalSwipe || isHorizontalSwipe;
            },
            onPanResponderMove: (_, gestureState) => {
                if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10) {
                    panX.setValue(gestureState.dx);
                } else if (gestureState.dy > 0) {
                    panY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 1.2) {
                    Animated.timing(panY, {
                        toValue: 800,
                        duration: 250,
                        useNativeDriver: true,
                    }).start(() => onClose());
                } else if (Math.abs(gestureState.dx) > 120 || Math.abs(gestureState.vx) > 1.2) {
                    Animated.timing(panX, {
                        toValue: gestureState.dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH,
                        duration: 250,
                        useNativeDriver: true,
                    }).start(() => onClose());
                } else {
                    Animated.parallel([
                        Animated.spring(panY, { toValue: 0, useNativeDriver: true }),
                        Animated.spring(panX, { toValue: 0, useNativeDriver: true })
                    ]).start();
                }
            }
        })
    ).current;

    useEffect(() => {
        if (visible) {
            panY.setValue(0);
            panX.setValue(0);
        }
    }, [visible, panY, panX]);

    const handleSort = useCallback((key: SortKey) => {
        setSortKey(prev => {
            if (prev === key) {
                setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
                return key;
            }
            setSortDir('desc');
            return key;
        });
    }, []);

    const sorted = useMemo(() => {
        const data = [...records];
        data.sort((a, b) => {
            let va: string | number;
            let vb: string | number;
            switch (sortKey) {
                case '日期': va = a['日期'] || ''; vb = b['日期'] || ''; break;
                case '金額': va = a['金額']; vb = b['金額']; break;
                case '主類別': va = a['主類別'] || ''; vb = b['主類別'] || ''; break;
                case '商家': va = a['商家'] || ''; vb = b['商家'] || ''; break;
                default: va = ''; vb = '';
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return data;
    }, [records, sortKey, sortDir]);

    const totalIncome = useMemo(() => sorted.filter(r => r['金額'] > 0).reduce((s, r) => s + r['金額'], 0), [sorted]);
    const totalExpense = useMemo(() => sorted.filter(r => r['金額'] < 0).reduce((s, r) => s + Math.abs(r['金額']), 0), [sorted]);

    const renderItem = useCallback(({ item }: { item: TransformedRecord }) => (
        <View style={styles.row}>
            <View style={styles.rowLeft}>
                <Text style={styles.rowName} numberOfLines={1}>{getRecordName(item)}</Text>
                <Text style={styles.rowMeta}>{item['日期']}{item['專案'] ? ` · ${item['專案']}` : ''}</Text>
                {item['描述'] ? <Text style={styles.rowDesc} numberOfLines={1}>{item['描述']}</Text> : null}
            </View>
            <Text style={[styles.rowAmount, item['金額'] >= 0 ? styles.amountGreen : styles.amountRed]}>
                {item['金額'] >= 0 ? '+' : '-'}${Math.abs(item['金額']).toLocaleString()}
            </Text>
        </View>
    ), []);

    const SortChip = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
        <Pressable
            style={({ pressed }) => [
                styles.sortChip,
                sortKey === sortKeyVal ? styles.sortChipActive : null,
                pressed && { transform: [{ scale: 0.95 }], opacity: 0.8 }
            ]}
            onPress={() => handleSort(sortKeyVal)}
        >
            <Text style={[styles.sortChipText, sortKey === sortKeyVal ? styles.sortChipTextActive : null]}>
                {label}{sortKey === sortKeyVal ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </Text>
        </Pressable>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
            <BlurView intensity={25} tint="dark" style={styles.blurOverlay}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.dismissArea} />
                </TouchableWithoutFeedback>
                <Animated.View style={[styles.container, { transform: [{ translateY: panY }, { translateX: panX }] }]} {...panResponder.panHandlers}>
                    {/* Gesture Header Area */}
                    <View>
                        {/* Handle */}
                        <View style={styles.handleBar} />

                        {/* Header */}
                        <View style={styles.header}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                                <Text style={styles.subtitle}>{sorted.length} 筆記錄</Text>
                            </View>
                            <Pressable
                                onPress={onClose}
                                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
                            >
                                <Text style={styles.closeBtnText}>關閉</Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* Summary */}
                    <View style={styles.summaryRow}>
                        <View style={[styles.summaryItem, { backgroundColor: COLORS.greenLight }]}>
                            <Text style={[styles.summaryLabel, { color: COLORS.green }]}>收入</Text>
                            <Text style={[styles.summaryValue, { color: COLORS.green }]}>${totalIncome.toLocaleString()}</Text>
                        </View>
                        <View style={[styles.summaryItem, { backgroundColor: COLORS.redLight }]}>
                            <Text style={[styles.summaryLabel, { color: COLORS.red }]}>支出</Text>
                            <Text style={[styles.summaryValue, { color: COLORS.red }]}>${totalExpense.toLocaleString()}</Text>
                        </View>
                    </View>

                    {/* View Mode Toggle */}
                    <View style={styles.modeRow}>
                        <View style={styles.modeToggle}>
                            {(['list', 'stats'] as ViewMode[]).map(mode => (
                                <Pressable key={mode} onPress={() => setViewMode(mode)}
                                    style={[styles.modeBtn, viewMode === mode ? styles.modeBtnActive : null]}
                                >
                                    <Text style={[styles.modeBtnText, viewMode === mode ? styles.modeBtnTextActive : null]}>
                                        {mode === 'list' ? '📋 列表' : '📊 統計'}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {/* Content */}
                    {viewMode === 'list' ? (
                        <>
                            {/* Sort Chips */}
                            <View style={styles.sortRow}>
                                <SortChip label="日期" sortKeyVal="日期" />
                                <SortChip label="金額" sortKeyVal="金額" />
                                <SortChip label="類別" sortKeyVal="主類別" />
                                <SortChip label="商家" sortKeyVal="商家" />
                            </View>

                            {/* Records List */}
                            <FlatList
                                data={sorted}
                                renderItem={renderItem}
                                keyExtractor={(_, i) => i.toString()}
                                contentContainerStyle={{ paddingBottom: 40 }}
                                initialNumToRender={15}
                                onScroll={(e) => {
                                    isAtTopRef.current = e.nativeEvent.contentOffset.y <= 0;
                                }}
                                scrollEventThrottle={16}
                                maxToRenderPerBatch={10}
                                ListEmptyComponent={
                                    <View style={styles.emptyView}>
                                        <Text style={styles.emptyText}>無交易記錄</Text>
                                    </View>
                                }
                            />
                        </>
                    ) : (
                        <StatsView
                            records={records}
                            onScroll={(e) => {
                                isAtTopRef.current = e.nativeEvent.contentOffset.y <= 0;
                            }}
                        />
                    )}
                </Animated.View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    blurOverlay: { flex: 1, justifyContent: 'flex-end' },
    dismissArea: { flex: 1, width: '100%' },
    container: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '90%', ...SHADOWS.lg },
    handleBar: { width: 40, height: 5, backgroundColor: COLORS.border, borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.divider, backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    title: { ...TYPOGRAPHY.h3, letterSpacing: -0.3 },
    subtitle: { ...TYPOGRAPHY.caption, marginTop: 4 },
    closeBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.accentLight, borderRadius: 16, borderWidth: 1, borderColor: COLORS.accentBorder },
    closeBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
    // Summary
    summaryRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    summaryItem: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', ...SHADOWS.sm },
    summaryLabel: { ...TYPOGRAPHY.caption },
    summaryValue: { fontSize: 18, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
    // Mode Toggle
    modeRow: { paddingHorizontal: 16, paddingBottom: 12 },
    modeToggle: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: COLORS.divider, ...SHADOWS.sm },
    modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    modeBtnActive: { backgroundColor: COLORS.accentLight, ...SHADOWS.sm },
    modeBtnText: { ...TYPOGRAPHY.subtitle, color: COLORS.textMuted },
    modeBtnTextActive: { color: COLORS.accent, fontWeight: '700' },
    // Sort
    sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
    sortChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
    sortChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent, ...SHADOWS.sm },
    sortChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
    sortChipTextActive: { color: COLORS.textWhite },
    // Rows
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
    rowLeft: { flex: 1, marginRight: 16 },
    rowName: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary },
    rowMeta: { ...TYPOGRAPHY.caption, marginTop: 4 },
    rowDesc: { ...TYPOGRAPHY.bodySm, marginTop: 4 },
    rowAmount: { fontSize: 16, fontWeight: '700', letterSpacing: -0.5 },
    amountGreen: { color: COLORS.green },
    amountRed: { color: COLORS.red },
    // Empty
    emptyView: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { ...TYPOGRAPHY.bodySm },
});

const statsStyles = StyleSheet.create({
    // Stats cards
    cardsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
    statCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', ...SHADOWS.sm },
    statLabel: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
    statValue: { fontSize: 24, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
    statSub: { ...TYPOGRAPHY.caption, marginTop: 4 },
    // Max
    maxCard: { marginHorizontal: 16, padding: 16, backgroundColor: COLORS.yellowLight, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FDE68A', ...SHADOWS.sm },
    maxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    maxIcon: { fontSize: 18 },
    maxTitle: { ...TYPOGRAPHY.subtitle, fontWeight: '700', color: '#92400E' },
    maxBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    maxName: { ...TYPOGRAPHY.body, fontWeight: '600', color: '#78350F', flex: 1 },
    maxAmount: { fontSize: 18, fontWeight: '800', color: COLORS.red, letterSpacing: -0.5 },
    maxDate: { ...TYPOGRAPHY.caption, color: '#A16207', marginTop: 6 },
    // Category
    section: { marginHorizontal: 16, marginBottom: 20, backgroundColor: COLORS.card, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: COLORS.cardBorder, ...SHADOWS.sm },
    sectionTitle: { ...TYPOGRAPHY.h3, marginBottom: 16 },
    distBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: COLORS.bg, marginBottom: 16 },
    catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    catLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    catDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
    catName: { ...TYPOGRAPHY.body, fontWeight: '500' },
    catRight: { flexDirection: 'row', alignItems: 'center' },
    catAmount: { ...TYPOGRAPHY.body, fontWeight: '700', marginRight: 10 },
    catPct: { ...TYPOGRAPHY.caption, width: 44, textAlign: 'right' },
    // Merchant
    merchantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    merchantLeft: { flexDirection: 'row', alignItems: 'center', width: 110 },
    merchantRank: { width: 20, ...TYPOGRAPHY.caption, fontWeight: '700', textAlign: 'center' },
    merchantName: { ...TYPOGRAPHY.body, fontWeight: '500', flex: 1 },
    merchantBarContainer: { flex: 1, height: 12, backgroundColor: COLORS.bg, borderRadius: 6, overflow: 'hidden', marginHorizontal: 10 },
    merchantBar: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 6 },
    merchantAmount: { ...TYPOGRAPHY.body, fontWeight: '700', width: 75, textAlign: 'right' },
    // Empty
    emptyView: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { ...TYPOGRAPHY.bodySm },
});
