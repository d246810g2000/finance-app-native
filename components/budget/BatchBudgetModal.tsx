
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { RawRecord, BudgetRule, BudgetGlobalConfig } from '../../types';
import { getCategoryAverage } from '../../services/financeService';
import { COLORS } from '../../theme';

interface BatchBudgetModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentBudgets: BudgetRule[];
    onSave: (newBudgets: BudgetRule[]) => void;
    uniqueCategories: string[];
    allRawRecords: RawRecord[];
    config: BudgetGlobalConfig;
}

const BatchBudgetModal: React.FC<BatchBudgetModalProps> = ({
    isOpen, onClose, currentBudgets, onSave, uniqueCategories, allRawRecords, config
}) => {
    const [localBudgets, setLocalBudgets] = useState<{ [category: string]: number }>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const map: { [key: string]: number } = {};
            uniqueCategories.forEach(cat => map[cat] = 0);
            currentBudgets.forEach(b => map[b.category] = b.monthlyLimit);
            setLocalBudgets(map);
        }
    }, [isOpen, uniqueCategories, currentBudgets]);

    const handleLimitChange = (category: string, value: string) => {
        const num = parseFloat(value);
        setLocalBudgets(prev => ({
            ...prev,
            [category]: isNaN(num) ? 0 : num
        }));
    };

    const handleSmartFill = () => {
        setLoading(true);
        setTimeout(() => {
            const updates = { ...localBudgets };
            uniqueCategories.forEach(cat => {
                const avg = getCategoryAverage(allRawRecords, cat, config);
                updates[cat] = avg;
            });
            setLocalBudgets(updates);
            setLoading(false);
        }, 100);
    };

    const handleSave = () => {
        const newRules: BudgetRule[] = [];
        Object.entries(localBudgets).forEach(([category, limit]) => {
            const numericLimit = limit as number;
            if (numericLimit > 0) {
                const existing = currentBudgets.find(b => b.category === category);
                newRules.push({
                    id: existing ? existing.id : Date.now().toString() + Math.random(),
                    category,
                    monthlyLimit: numericLimit
                });
            }
        });
        onSave(newRules);
        onClose();
    };

    return (
        <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>批次編輯預算</Text>
                            <Pressable onPress={handleSmartFill} style={styles.smartBtn}>
                                {loading ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Text style={styles.smartBtnText}>⚡ 智慧填入 (3個月平均)</Text>}
                            </Pressable>
                        </View>
                        <Pressable onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                        {uniqueCategories.map(cat => (
                            <View key={cat} style={styles.item}>
                                <Text style={styles.itemRef} numberOfLines={1}>{cat}</Text>
                                <View style={styles.amountInputContainer}>
                                    <Text style={styles.currencySymbol}>$</Text>
                                    <TextInput
                                        style={styles.input}
                                        keyboardType="numeric"
                                        placeholder="0"
                                        placeholderTextColor={COLORS.textMuted}
                                        value={localBudgets[cat] ? localBudgets[cat].toString() : ''}
                                        onChangeText={v => handleLimitChange(cat, v)}
                                    />
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    <View style={styles.footer}>
                        <Text style={styles.hint}>金額為 0 將不建立該類別的預算。</Text>
                        <View style={styles.footerButtons}>
                            <Pressable onPress={onClose} style={styles.btnCancel}>
                                <Text style={styles.btnTextCancel}>取消</Text>
                            </Pressable>
                            <Pressable onPress={handleSave} style={styles.btnSave}>
                                <Text style={styles.saveBtnText}>儲存變更</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
    header: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.divider, alignItems: 'center' },
    title: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
    closeBtn: { padding: 8 },
    closeBtnText: { fontSize: 24, color: COLORS.textSecondary },
    smartBtn: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
    smartBtnText: { color: COLORS.accent, fontWeight: '600', fontSize: 14 },
    list: { paddingVertical: 16 },
    item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    itemRef: { flex: 1, fontSize: 16, color: COLORS.textPrimary, marginRight: 10, fontWeight: '500' },
    amountInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: COLORS.bg, width: 140 },
    currencySymbol: { fontSize: 16, color: COLORS.textSecondary, marginRight: 4 },
    input: { flex: 1, paddingVertical: 10, textAlign: 'right', fontSize: 16, color: COLORS.textPrimary },
    footer: { paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.divider },
    hint: { color: COLORS.textMuted, marginBottom: 16, fontSize: 13, textAlign: 'center' },
    footerButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    btnCancel: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
    btnSave: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, backgroundColor: COLORS.accent },
    btnTextCancel: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 16 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});

export default BatchBudgetModal;
