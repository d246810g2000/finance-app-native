
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { RawRecord } from '../../types';
import { getCategoryAverage } from '../../services/financeService';
import { loadBudgetConfig } from '../../services/budgetService';
import { AppColors, SHADOWS, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import ModalBackdrop from '../ui/ModalBackdrop';

interface BudgetSettingModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (category: string, limit: number, isEdit: boolean) => void;
    editingId: string | null;
    initialCategory: string;
    initialLimit: string;
    uniqueCategories: string[];
    allRawRecords: RawRecord[];
}

const BudgetSettingModal: React.FC<BudgetSettingModalProps> = ({
    visible, onClose, onSave, editingId, initialCategory, initialLimit, uniqueCategories, allRawRecords
}) => {
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [formCategory, setFormCategory] = useState(initialCategory);
    const [formLimit, setFormLimit] = useState(initialLimit);
    const [suggestion, setSuggestion] = useState<number | null>(null);

    useEffect(() => {
        setFormCategory(initialCategory);
        setFormLimit(initialLimit);
    }, [initialCategory, initialLimit, visible]);

    useEffect(() => {
        const fetchSuggestion = async () => {
            if (formCategory && visible) {
                const config = await loadBudgetConfig();
                const avg = getCategoryAverage(allRawRecords, formCategory, config);
                setSuggestion(avg);
            } else {
                setSuggestion(null);
            }
        }
        fetchSuggestion();
    }, [formCategory, allRawRecords, visible]);

    const handleSave = () => {
        if (!formCategory || !formLimit) return;
        const limit = parseFloat(formLimit);
        if (isNaN(limit) || limit < 0) {
            Alert.alert('錯誤', '請輸入有效的金額');
            return;
        }
        onSave(formCategory, limit, !!editingId);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen">
            <ModalBackdrop colors={colors} placement="center" isDark={isDark}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
                    <Text style={styles.title}>{editingId ? '編輯預算' : '新增預算'}</Text>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>類別</Text>
                        {editingId ? (
                            <TextInput style={[styles.input, styles.disabledInput]} value={formCategory} editable={false} />
                        ) : (
                            <View style={{ maxHeight: 200 }}>
                                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ marginBottom: 8 }}>
                                    <View style={styles.chipContainer}>
                                        {uniqueCategories.map(cat => (
                                            <Pressable key={cat}
                                                style={[styles.chip, formCategory === cat && styles.chipActive]}
                                                onPress={() => setFormCategory(cat)}>
                                                <Text style={[styles.chipText, formCategory === cat && styles.chipTextActive]}>{cat}</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </ScrollView>
                                <TextInput
                                    style={styles.input}
                                    placeholder="或輸入自訂類別"
                                    placeholderTextColor={colors.textMuted}
                                    value={formCategory}
                                    onChangeText={setFormCategory}
                                />
                            </View>
                        )}
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>每月預算金額</Text>
                        <View style={styles.amountInputContainer}>
                            <Text style={styles.currencySymbol}>$</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={formLimit}
                                onChangeText={setFormLimit}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                            />
                        </View>

                        {suggestion !== null && suggestion > 0 && (
                            <Pressable onPress={() => setFormLimit(suggestion.toString())} style={styles.suggestionBox}>
                                <Text style={styles.suggestionText}>
                                    智慧建議 (3個月平均): <Text style={{ fontWeight: 'bold' }}>${suggestion.toLocaleString()}</Text> - 點此套用
                                </Text>
                            </Pressable>
                        )}
                        {suggestion === 0 && (
                            <View style={styles.suggestionBoxGray}>
                                <Text style={styles.suggestionTextGray}>
                                    過去3個月在目前的設定下無此類別開銷。
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.footer}>
                        <Pressable onPress={onClose} style={styles.btnCancel}>
                            <Text style={styles.btnTextCancel}>取消</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleSave}
                            style={[
                                styles.btnSave,
                                (!formCategory || !formLimit) && styles.btnSaveDisabled
                            ]}
                            disabled={!formCategory || !formLimit}
                        >
                            <Text style={styles.btnTextSave}>確定</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </ModalBackdrop>
        </Modal>
    );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
    modalContent: { backgroundColor: colors.card, borderRadius: RADIUS.md, padding: 24, maxHeight: '85%', ...SHADOWS.lg },
    title: { fontSize: 20, fontWeight: '700', marginBottom: 24, color: colors.textPrimary },
    formGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: colors.textPrimary, backgroundColor: colors.bg },
    disabledInput: { backgroundColor: colors.bg, color: colors.textMuted },
    amountInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.bg },
    currencySymbol: { fontSize: 18, color: colors.textSecondary, marginRight: 4 },
    amountInput: { flex: 1, paddingVertical: 12, fontSize: 18, color: colors.textPrimary },
    footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 },
    btnCancel: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    btnSave: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, backgroundColor: colors.accent },
    btnSaveDisabled: { backgroundColor: colors.accentBorder },
    btnTextCancel: { color: colors.textSecondary, fontWeight: '600', fontSize: 16 },
    btnTextSave: { color: colors.textWhite, fontWeight: '600', fontSize: 16 },
    suggestionBox: { marginTop: 12, padding: 12, backgroundColor: colors.accentLight, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
    suggestionText: { fontSize: 13, color: colors.accent },
    suggestionBoxGray: { marginTop: 12, padding: 12, backgroundColor: colors.bg, borderRadius: 8 },
    suggestionTextGray: { fontSize: 13, color: colors.textSecondary },
    chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontSize: 14, color: colors.textSecondary },
    chipTextActive: { color: colors.textWhite, fontWeight: 'bold' },
});

export default BudgetSettingModal;
