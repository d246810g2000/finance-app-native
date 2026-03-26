
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { RawRecord } from '../../types';
import { getCategoryAverage } from '../../services/financeService';
import { loadBudgetConfig } from '../../services/budgetService';
import { COLORS } from '../../theme';

interface BudgetSettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (category: string, limit: number, isEdit: boolean) => void;
    editingId: string | null;
    initialCategory: string;
    initialLimit: string;
    uniqueCategories: string[];
    allRawRecords: RawRecord[];
}

const BudgetSettingModal: React.FC<BudgetSettingModalProps> = ({
    isOpen, onClose, onSave, editingId, initialCategory, initialLimit, uniqueCategories, allRawRecords
}) => {
    const [formCategory, setFormCategory] = useState(initialCategory);
    const [formLimit, setFormLimit] = useState(initialLimit);
    const [suggestion, setSuggestion] = useState<number | null>(null);

    useEffect(() => {
        setFormCategory(initialCategory);
        setFormLimit(initialLimit);
    }, [initialCategory, initialLimit, isOpen]);

    useEffect(() => {
        const fetchSuggestion = async () => {
            if (formCategory && isOpen) {
                const config = await loadBudgetConfig();
                const avg = getCategoryAverage(allRawRecords, formCategory, config);
                setSuggestion(avg);
            } else {
                setSuggestion(null);
            }
        }
        fetchSuggestion();
    }, [formCategory, allRawRecords, isOpen]);

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
        <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
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
                                    placeholderTextColor={COLORS.textMuted}
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
                                placeholderTextColor={COLORS.textMuted}
                            />
                        </View>

                        {suggestion !== null && suggestion > 0 && (
                            <Pressable onPress={() => setFormLimit(suggestion.toString())} style={styles.suggestionBox}>
                                <Text style={styles.suggestionText}>
                                    💡 智慧建議 (3個月平均): <Text style={{ fontWeight: 'bold' }}>${suggestion.toLocaleString()}</Text> - 點此套用
                                </Text>
                            </Pressable>
                        )}
                        {suggestion === 0 && (
                            <View style={styles.suggestionBoxGray}>
                                <Text style={styles.suggestionTextGray}>
                                    💡 過去3個月在目前的設定下無此類別開銷。
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
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
    title: { fontSize: 20, fontWeight: '700', marginBottom: 24, color: COLORS.textPrimary },
    formGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
    input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 16, color: COLORS.textPrimary, backgroundColor: COLORS.bg },
    disabledInput: { backgroundColor: COLORS.bg, color: COLORS.textMuted },
    amountInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: COLORS.bg },
    currencySymbol: { fontSize: 18, color: COLORS.textSecondary, marginRight: 4 },
    amountInput: { flex: 1, paddingVertical: 12, fontSize: 18, color: COLORS.textPrimary },
    footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 },
    btnCancel: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
    btnSave: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, backgroundColor: COLORS.accent },
    btnSaveDisabled: { backgroundColor: COLORS.accentBorder },
    btnTextCancel: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 16 },
    btnTextSave: { color: '#fff', fontWeight: '600', fontSize: 16 },
    suggestionBox: { marginTop: 12, padding: 12, backgroundColor: COLORS.accentLight, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
    suggestionText: { fontSize: 13, color: COLORS.accent },
    suggestionBoxGray: { marginTop: 12, padding: 12, backgroundColor: COLORS.bg, borderRadius: 8 },
    suggestionTextGray: { fontSize: 13, color: COLORS.textSecondary },
    chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.divider, backgroundColor: COLORS.bg },
    chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
    chipText: { fontSize: 14, color: COLORS.textSecondary },
    chipTextActive: { color: '#fff', fontWeight: 'bold' },
});

export default BudgetSettingModal;
