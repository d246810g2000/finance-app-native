
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, ScrollView, Pressable, Animated, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useFinance, SearchFilters } from '../context/FinanceContext';
import { AppColors, RADIUS, SCREEN_EDGE_MIN, SHADOWS, withContinuousRadius } from '../theme';
import HeaderMenuButton from './layout/HeaderMenuButton';

interface SearchModalProps {
    visible: boolean;
    onClose: () => void;
    onApply: (filters: SearchFilters) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Custom Wheel/Drum Picker Component
function DrumDatePicker({ initialDate, onConfirm, onCancel, colors, styles }: any) {
    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
    }, []);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const [selectedYear, setSelectedYear] = useState(initialDate.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(initialDate.getMonth() + 1);
    const [selectedDay, setSelectedDay] = useState(initialDate.getDate());

    const daysInMonth = useMemo(() => new Date(selectedYear, selectedMonth, 0).getDate(), [selectedYear, selectedMonth]);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const ITEM_HEIGHT = 44;

    const Wheel = ({ data, selectedValue, onValueChange }: any) => {
        const scrollRef = useRef<ScrollView>(null);

        useEffect(() => {
            const index = data.indexOf(selectedValue);
            if (index !== -1) {
                setTimeout(() => scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false }), 50);
            }
        }, []);

        return (
            <View style={{ flex: 1, height: ITEM_HEIGHT * 3, overflow: 'hidden' }}>
                <View style={[styles.wheelSelectionLine, { top: ITEM_HEIGHT, backgroundColor: colors.divider }]} />
                <View style={[styles.wheelSelectionLine, { top: ITEM_HEIGHT * 2, backgroundColor: colors.divider }]} />
                <ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={(e) => {
                        const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
                        if (data[index] !== undefined) onValueChange(data[index]);
                    }}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                >
                    {data.map((item: any) => (
                        <View key={item} style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={[styles.wheelText, selectedValue === item && styles.wheelTextActive, { color: selectedValue === item ? colors.textPrimary : colors.textMuted }]}>
                                {item}
                            </Text>
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    };

    return (
        <View style={styles.drumContainer}>
            <View style={styles.drumPickerRow}>
                <Wheel data={years} selectedValue={selectedYear} onValueChange={setSelectedYear} />
                <Wheel data={months} selectedValue={selectedMonth} onValueChange={setSelectedMonth} />
                <Wheel data={days} selectedValue={selectedDay} onValueChange={setSelectedDay} />
            </View>
            <View style={styles.drumFooter}>
                <Pressable onPress={onCancel} style={({ pressed }) => [styles.drumButton, pressed && { opacity: 0.7 }]}>
                    <Text style={styles.drumCancelText}>取消</Text>
                </Pressable>
                <Pressable onPress={() => onConfirm(new Date(selectedYear, selectedMonth - 1, selectedDay))} style={({ pressed }) => [styles.drumButton, pressed && { opacity: 0.7 }]}>
                    <Text style={styles.drumConfirmText}>確定</Text>
                </Pressable>
            </View>
        </View>
    );
}

export default function SearchModal({ visible, onClose, onApply }: SearchModalProps) {
    const { colors, typography } = useAppTheme();
    const insets = useSafeAreaInsets();
    const { searchFilters, searchMetadata: metadata } = useFinance();
    const edgeH = Math.max(insets.left, insets.right, SCREEN_EDGE_MIN);
    const styles = useMemo(() => createStyles(colors, typography, edgeH), [colors, typography, edgeH]);

    const slideAnim = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [isRendering, setIsRendering] = useState(false);

    useEffect(() => {
        if (visible) {
            setIsRendering(true);
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: -SCREEN_WIDTH,
                    duration: 280,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setIsRendering(false);
            });
        }
    }, [visible]);

    const handleClose = () => {
        onClose();
    };


    const [filters, setFilters] = useState<SearchFilters>(searchFilters || {
        keyword: '',
        category: '',
        startDate: metadata.minDate,
        endDate: metadata.maxDate,
        account: '',
        project: '',
        minAmount: null,
        maxAmount: null
    });

    // Picker states
    const [pickerType, setPickerType] = useState<'category' | 'account' | 'project' | 'date' | null>(null);
    const [tempDateType, setTempDateType] = useState<'start' | 'end' | null>(null);

    // Sync with global filters when modal opens
    // 注意：這裡只在 searchFilters 有值時同步，避免因為返回清除結果而洗掉模態內部的輸入
    useEffect(() => {
        if (visible && searchFilters) {
            setFilters(searchFilters);
        }
    }, [visible, searchFilters]);

    // Reset with metadata defaults
    const handleReset = () => {
        setFilters({
            keyword: '',
            category: '',
            startDate: metadata.minDate,
            endDate: metadata.maxDate,
            account: '',
            project: '',
            minAmount: null,
            maxAmount: null
        });
    };

    const handleConfirm = () => {
        onApply(filters);
        onClose();
    };

    const openPicker = (type: typeof pickerType) => setPickerType(type);

    const selectValue = (value: string) => {
        if (!pickerType) return;
        setFilters(prev => ({ ...prev, [pickerType]: value }));
        setPickerType(null);
    };

    const renderFilterRow = (icon: React.ComponentProps<typeof Ionicons>['name'], label: string, value: string, type: typeof pickerType, placeholder: string = '全部') => (
        <Pressable style={({ pressed }) => [styles.filterRow, pressed && { opacity: 0.7 }]} onPress={() => openPicker(type)}>
            <View style={styles.filterIconLabel}>
                <View style={styles.filterIconBg}>
                    <Ionicons name={icon} size={18} color={colors.accent} />
                </View>
                <Text style={styles.rowLabel}>{label}</Text>
            </View>
            <View style={styles.filterValueContainer}>
                <Text style={[styles.rowValue, !value && styles.rowPlaceholder]}>
                    {value || placeholder}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
        </Pressable>
    );

    const formatDateInput = (date: Date | null) => {
        if (!date) return '請選擇日期';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    if (!visible && !isRendering) return null;

    return (
        <Modal visible={visible || isRendering} animationType="none" transparent onRequestClose={handleClose}>
            <View style={StyleSheet.absoluteFill}>
                <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
                </Animated.View>

                <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
                    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                        <HeaderMenuButton icon="back" onPress={handleClose} accessibilityLabel="返回" />
                        <Text style={styles.headerTitle}>搜尋記錄</Text>
                        <Pressable
                            onPress={handleReset}
                            hitSlop={8}
                            style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.7 }]}
                        >
                            <Text style={styles.resetText}>重設</Text>
                        </Pressable>
                    </View>

                    <ScrollView
                        style={styles.content}
                        contentContainerStyle={styles.contentInner}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.sectionLabel}>關鍵字</Text>
                        <View style={styles.card}>
                            <TextInput
                                style={styles.keywordInput}
                                placeholder="商家、描述、類別..."
                                placeholderTextColor={colors.textMuted}
                                value={filters.keyword}
                                onChangeText={(text) => setFilters(prev => ({ ...prev, keyword: text }))}
                            />
                        </View>

                        <Text style={styles.sectionLabel}>篩選條件</Text>
                        <View style={styles.card}>
                            {renderFilterRow('pricetag-outline', '類別', filters.category, 'category')}
                            <View style={styles.divider} />

                            {/* Date Selection */}
                            <View style={styles.filterRow}>
                                <View style={styles.filterIconLabel}>
                                    <View style={styles.filterIconBg}>
                                        <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                                    </View>
                                    <Text style={styles.rowLabel}>日期</Text>
                                </View>
                                <Pressable onPress={() => {
                                    setFilters(prev => ({ ...prev, startDate: null, endDate: null }));
                                }}>
                                    <Text style={styles.resetTextSmall}>清除日期</Text>
                                </Pressable>
                            </View>

                            <View style={styles.datePickerContainer}>
                                <Pressable
                                    style={({ pressed }) => [styles.dateBox, pressed && { opacity: 0.85 }]}
                                    onPress={() => { setPickerType('date'); setTempDateType('start'); }}
                                >
                                    <Text style={styles.dateLabel}>起始日期</Text>
                                    <Text style={[styles.dateValue, !filters.startDate && styles.rowPlaceholder]}>
                                        {formatDateInput(filters.startDate)}
                                    </Text>
                                </Pressable>

                                <View style={styles.dateSeparator} />

                                <Pressable
                                    style={({ pressed }) => [styles.dateBox, pressed && { opacity: 0.85 }]}
                                    onPress={() => { setPickerType('date'); setTempDateType('end'); }}
                                >
                                    <Text style={styles.dateLabel}>結束日期</Text>
                                    <Text style={[styles.dateValue, !filters.endDate && styles.rowPlaceholder]}>
                                        {formatDateInput(filters.endDate)}
                                    </Text>
                                </Pressable>
                            </View>

                            <View style={styles.divider} />
                            {/* Amount Range UI */}
                            <View style={styles.filterRow}>
                                <View style={styles.filterIconLabel}>
                                    <View style={styles.filterIconBg}>
                                        <Ionicons name="cash-outline" size={18} color={colors.accent} />
                                    </View>
                                    <Text style={styles.rowLabel}>金額區間</Text>
                                </View>
                            </View>
                            <View style={styles.amountRangeContainer}>
                                <View style={styles.amountInputWrapper}>
                                    <Text style={styles.amountPrefix}>TW$</Text>
                                    <TextInput
                                        style={styles.amountInput}
                                        placeholder="最小值"
                                        keyboardType="numeric"
                                        value={filters.minAmount?.toString() || ''}
                                        onChangeText={(text) => setFilters(prev => ({ ...prev, minAmount: text ? parseFloat(text) : null }))}
                                    />
                                </View>
                                <Text style={styles.amountSeparator}>~</Text>
                                <View style={styles.amountInputWrapper}>
                                    <Text style={styles.amountPrefix}>TW$</Text>
                                    <TextInput
                                        style={styles.amountInput}
                                        placeholder="最大值"
                                        keyboardType="numeric"
                                        value={filters.maxAmount?.toString() || ''}
                                        onChangeText={(text) => setFilters(prev => ({ ...prev, maxAmount: text ? parseFloat(text) : null }))}
                                    />
                                </View>
                            </View>

                            <View style={styles.divider} />
                            {renderFilterRow('card-outline', '帳戶', filters.account, 'account')}
                            <View style={styles.divider} />
                            {renderFilterRow('folder-outline', '專案', filters.project, 'project')}
                        </View>
                    </ScrollView>

                    {/* Selection Modal */}
                    <Modal visible={!!pickerType} animationType="fade" transparent onRequestClose={() => setPickerType(null)}>
                        <View style={styles.pickerOverlay}>
                            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerType(null)} />
                            <View style={[styles.pickerContent, { paddingBottom: insets.bottom + 16 }]}>
                                <View style={styles.pickerHeader}>
                                    <Text style={styles.pickerTitle}>
                                        {pickerType === 'category' ? '選擇類別' :
                                            pickerType === 'account' ? '選擇帳戶' :
                                                pickerType === 'project' ? '選擇專案' : '選擇日期'}
                                    </Text>
                                    <Pressable onPress={() => setPickerType(null)} hitSlop={8}>
                                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                                    </Pressable>
                                </View>

                                {pickerType === 'date' ? (
                                    <DrumDatePicker
                                        initialDate={tempDateType === 'start' ? (filters.startDate || metadata.minDate) : (filters.endDate || metadata.maxDate)}
                                        onConfirm={(date: Date) => {
                                            if (tempDateType === 'start') setFilters(prev => ({ ...prev, startDate: date }));
                                            else setFilters(prev => ({ ...prev, endDate: date }));
                                            setPickerType(null);
                                        }}
                                        onCancel={() => setPickerType(null)}
                                        colors={colors}
                                        styles={styles}
                                    />
                                ) : (
                                    <ScrollView style={styles.pickerList}>
                                        <Pressable style={({ pressed }) => [styles.pickerItem, pressed && { backgroundColor: colors.bg }]} onPress={() => selectValue('')}>
                                            <Text style={[styles.pickerItemText, { color: colors.accent }]}>全部</Text>
                                        </Pressable>
                                        {(metadata as any)[pickerType === 'category' ? 'categories' : pickerType === 'account' ? 'accounts' : 'projects'].map((item: string) => (
                                            <Pressable key={item} style={({ pressed }) => [styles.pickerItem, pressed && { backgroundColor: colors.bg }]} onPress={() => selectValue(item)}>
                                                <Text style={styles.pickerItemText}>{item}</Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                )}
                            </View>
                        </View>
                    </Modal>

                    <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                        <Pressable
                            style={({ pressed }) => [styles.footerBtn, styles.cancelButton, pressed && styles.footerBtnPressed]}
                            onPress={onClose}
                        >
                            <Text style={styles.cancelButtonText}>取消</Text>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.footerBtn, styles.confirmButton, pressed && styles.footerBtnPressed]}
                            onPress={handleConfirm}
                        >
                            <Text style={styles.confirmButtonText}>搜尋</Text>
                        </Pressable>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography'], edgeH: number) => StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.blackOverlay,
    },
    container: {
        flex: 1,
        backgroundColor: colors.bg,
        width: '100%',
        height: '100%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: edgeH,
        paddingBottom: 12,
        backgroundColor: colors.headerBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.cardBorder,
        gap: 8,
    },
    headerTitle: {
        ...typography.h3,
        flex: 1,
        textAlign: 'center',
        includeFontPadding: false,
    },
    resetBtn: {
        minWidth: 44,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    resetText: { color: colors.accent, fontWeight: '700', fontSize: 14, includeFontPadding: false },
    content: { flex: 1 },
    contentInner: {
        paddingHorizontal: edgeH,
        paddingTop: 16,
        paddingBottom: 24,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.textMuted,
        letterSpacing: 0.4,
        marginBottom: 8,
        marginLeft: 2,
        includeFontPadding: false,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        overflow: 'hidden',
        marginBottom: 20,
        ...SHADOWS.sm,
    },
    keywordInput: {
        height: 48,
        margin: 14,
        backgroundColor: colors.bg,
        borderRadius: RADIUS.sm,
        paddingHorizontal: 14,
        fontSize: 16,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.divider,
        includeFontPadding: false,
    },
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 14,
    },
    filterIconLabel: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
    filterIconBg: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: colors.accentLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        flexShrink: 0,
    },
    rowLabel: { fontSize: 15, color: colors.textPrimary, fontWeight: '600', includeFontPadding: false },
    filterValueContainer: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
    rowValue: { fontSize: 14, color: colors.textSecondary, marginRight: 4, fontWeight: '600', includeFontPadding: false },
    rowPlaceholder: { color: colors.textMuted, fontWeight: '500' },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: 62 },
    resetTextSmall: { color: colors.accent, fontSize: 12, fontWeight: '700', includeFontPadding: false },

    datePickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingBottom: 14,
        gap: 10,
    },
    dateBox: {
        flex: 1,
        backgroundColor: colors.bg,
        borderRadius: RADIUS.sm,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    dateLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4, includeFontPadding: false },
    dateValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '700', includeFontPadding: false },
    dateSeparator: { width: 8, height: 1, backgroundColor: colors.divider },

    amountRangeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingBottom: 14,
        gap: 10,
    },
    amountInputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        borderRadius: RADIUS.sm,
        paddingHorizontal: 10,
        height: 44,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    amountPrefix: { fontSize: 11, color: colors.textMuted, marginRight: 4, includeFontPadding: false },
    amountInput: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '600', includeFontPadding: false },
    amountSeparator: { fontSize: 14, color: colors.textMuted },

    pickerOverlay: { flex: 1, backgroundColor: colors.blackOverlay, justifyContent: 'flex-end' },
    pickerContent: {
        backgroundColor: colors.card,
        borderTopLeftRadius: RADIUS.xl,
        borderTopRightRadius: RADIUS.xl,
        maxHeight: '70%',
        paddingBottom: 20,
    },
    pickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
    },
    pickerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, includeFontPadding: false },
    pickerList: { maxHeight: 400 },
    pickerItem: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
    },
    pickerItemText: { fontSize: 16, color: colors.textPrimary, includeFontPadding: false },

    drumContainer: { backgroundColor: colors.card, padding: 16 },
    drumPickerRow: { flexDirection: 'row', alignItems: 'center', height: 132 },
    wheelSelectionLine: { position: 'absolute', left: 0, right: 0, height: 1 },
    wheelText: { fontSize: 18, fontWeight: '400' },
    wheelTextActive: { fontSize: 22, fontWeight: '700' },
    drumFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 20 },
    drumButton: { padding: 8 },
    drumCancelText: { color: colors.textMuted, fontSize: 16 },
    drumConfirmText: { color: colors.green, fontSize: 16, fontWeight: '700' },

    footer: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: edgeH,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
        backgroundColor: colors.card,
        ...SHADOWS.md,
    },
    footerBtn: {
        flex: 1,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        ...withContinuousRadius(RADIUS.md),
    },
    footerBtnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
    cancelButton: {
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    cancelButtonText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700', includeFontPadding: false },
    confirmButton: {
        backgroundColor: colors.accent,
    },
    confirmButtonText: { color: colors.textWhite, fontSize: 15, fontWeight: '700', includeFontPadding: false },
});
