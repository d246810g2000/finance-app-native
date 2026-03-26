
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, Platform, Pressable, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useFinance, SearchFilters } from '../context/FinanceContext';
import { transformRecordsForExport } from '../services/financeService';
import { parseFormattedDate, zeroPadDate } from '../utils/dateUtils';

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
                <TouchableOpacity onPress={onCancel} style={styles.drumButton}>
                    <Text style={styles.drumCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onConfirm(new Date(selectedYear, selectedMonth - 1, selectedDay))} style={styles.drumButton}>
                    <Text style={styles.drumConfirmText}>確定</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

export default function SearchModal({ visible, onClose, onApply }: SearchModalProps) {
    const { colors, typography } = useAppTheme();
    const { records, searchFilters, setSearchModalVisible, setMenuVisible, searchMetadata: metadata } = useFinance();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
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
                    toValue: SCREEN_WIDTH,
                    duration: 300,
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

    const renderFilterRow = (icon: string, label: string, value: string, type: typeof pickerType, placeholder: string = '全部') => (
        <TouchableOpacity style={styles.filterRow} activeOpacity={0.7} onPress={() => openPicker(type)}>
            <View style={styles.filterIconLabel}>
                <Text style={styles.rowEmoji}>{icon}</Text>
                <Text style={styles.rowLabel}>{label}</Text>
            </View>
            <View style={styles.filterValueContainer}>
                <Text style={[styles.rowValue, !value && styles.rowPlaceholder]}>
                    {value || placeholder}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
        </TouchableOpacity>
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
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={handleClose}
                            style={styles.headerButton}
                        >
                            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>搜尋</Text>
                        <TouchableOpacity onPress={handleReset} style={styles.headerButton}>
                            <Text style={styles.resetText}>重設</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
                        {/* Keyword Input */}
                        <View style={styles.inputSection}>
                            <TextInput
                                style={styles.keywordInput}
                                placeholder="關鍵字"
                                placeholderTextColor={colors.textMuted}
                                value={filters.keyword}
                                onChangeText={(text) => setFilters(prev => ({ ...prev, keyword: text }))}
                            />
                        </View>

                        {/* Filter List */}
                        <View style={styles.filterSection}>
                            {renderFilterRow('🛒', '類別', filters.category, 'category')}
                            <View style={styles.divider} />

                            {/* Date Selection */}
                            <View style={styles.filterRow}>
                                <View style={styles.filterIconLabel}>
                                    <Text style={styles.rowEmoji}>📅</Text>
                                    <Text style={styles.rowLabel}>日期</Text>
                                </View>
                                <TouchableOpacity onPress={() => {
                                    setFilters(prev => ({ ...prev, startDate: null, endDate: null }));
                                }}>
                                    <Text style={styles.resetTextSmall}>清除日期</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.datePickerContainer}>
                                <TouchableOpacity
                                    style={styles.dateBox}
                                    onPress={() => { setPickerType('date'); setTempDateType('start'); }}
                                >
                                    <Text style={styles.dateLabel}>起始日期</Text>
                                    <Text style={[styles.dateValue, !filters.startDate && styles.rowPlaceholder]}>
                                        {formatDateInput(filters.startDate)}
                                    </Text>
                                </TouchableOpacity>

                                <View style={styles.dateSeparator} />

                                <TouchableOpacity
                                    style={styles.dateBox}
                                    onPress={() => { setPickerType('date'); setTempDateType('end'); }}
                                >
                                    <Text style={styles.dateLabel}>結束日期</Text>
                                    <Text style={[styles.dateValue, !filters.endDate && styles.rowPlaceholder]}>
                                        {formatDateInput(filters.endDate)}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />
                            {/* Amount Range UI */}
                            <View style={styles.filterRow}>
                                <View style={styles.filterIconLabel}>
                                    <Text style={styles.rowEmoji}>💰</Text>
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
                            {renderFilterRow('🏦', '帳戶', filters.account, 'account')}
                            <View style={styles.divider} />
                            {renderFilterRow('📁', '專案', filters.project, 'project')}

                        </View>
                    </ScrollView>

                    {/* Selection Modal */}
                    <Modal visible={!!pickerType} animationType="fade" transparent onRequestClose={() => setPickerType(null)}>
                        <View style={styles.pickerOverlay}>
                            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerType(null)} />
                            <View style={styles.pickerContent}>
                                <View style={styles.pickerHeader}>
                                    <Text style={styles.pickerTitle}>
                                        {pickerType === 'category' ? '選擇類別' :
                                            pickerType === 'account' ? '選擇帳戶' :
                                                pickerType === 'project' ? '選擇專案' : '選擇日期'}
                                    </Text>
                                    <TouchableOpacity onPress={() => setPickerType(null)}>
                                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                                    </TouchableOpacity>
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
                                        <TouchableOpacity style={styles.pickerItem} onPress={() => selectValue('')}>
                                            <Text style={[styles.pickerItemText, { color: colors.accent }]}>全部</Text>
                                        </TouchableOpacity>
                                        {(metadata as any)[pickerType === 'category' ? 'categories' : pickerType === 'account' ? 'accounts' : 'projects'].map((item: string) => (
                                            <TouchableOpacity key={item} style={styles.pickerItem} onPress={() => selectValue(item)}>
                                                <Text style={styles.pickerItemText}>{item}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                )}
                            </View>
                        </View>
                    </Modal>

                    {/* Footer Buttons */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                            <Text style={styles.cancelButtonText}>取消</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                            <Text style={styles.confirmButtonText}>確定</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const createStyles = (colors: any, typography: any) => StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.blackOverlay || 'rgba(0,0,0,0.5)',
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
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    headerButton: { minWidth: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { ...typography.h3, flex: 1, textAlign: 'center' },
    resetText: { color: colors.accent, fontWeight: '600' },
    content: { flex: 1 },
    inputSection: { padding: 16, backgroundColor: colors.card, marginTop: 12 },
    keywordInput: {
        height: 48,
        backgroundColor: colors.bg,
        borderRadius: 8,
        paddingHorizontal: 16,
        fontSize: 16,
        color: colors.textPrimary,
    },
    filterSection: { marginTop: 12, backgroundColor: colors.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider },
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    filterIconLabel: { flexDirection: 'row', alignItems: 'center' },
    rowEmoji: { fontSize: 22, marginRight: 12 },
    rowLabel: { fontSize: 16, color: colors.textPrimary, fontWeight: '500' },
    filterValueContainer: { flexDirection: 'row', alignItems: 'center' },
    rowValue: { fontSize: 15, color: colors.textPrimary, marginRight: 4 },
    rowPlaceholder: { color: colors.textMuted },
    divider: { height: 1, backgroundColor: colors.divider, marginLeft: 50 },
    resetTextSmall: { color: colors.accent, fontSize: 13, fontWeight: '600' },

    // Date Selection UI
    datePickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 12,
    },
    dateBox: {
        flex: 1,
        backgroundColor: colors.bg,
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    dateLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
    dateValue: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
    currencyLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
    dateSeparator: { width: 10, height: 1, backgroundColor: colors.divider },

    // Amount Range UI
    amountRangeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
        gap: 12,
    },
    amountInputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 48,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    amountPrefix: { fontSize: 12, color: colors.textMuted, marginRight: 4 },
    amountInput: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
    amountSeparator: { fontSize: 16, color: colors.textMuted },

    // Selection Pickers
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    pickerContent: {
        backgroundColor: colors.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '70%',
        paddingBottom: Platform.OS === 'ios' ? 40 : 20
    },
    pickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    pickerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    pickerList: { maxHeight: 400 },
    dateList: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    pickerItem: {
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    pickerItemText: { fontSize: 16, color: colors.textPrimary },

    // Drum Picker
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
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 16,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        backgroundColor: colors.card,
    },
    cancelButton: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center' },
    cancelButtonText: { color: colors.green, fontSize: 16, fontWeight: '600' },
    confirmButton: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center' },
    confirmButtonText: { color: colors.green, fontSize: 16, fontWeight: '600' },
});
