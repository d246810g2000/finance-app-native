
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Switch } from 'react-native';
import { RawRecord, BudgetGlobalConfig } from '../../types';
import { COLORS } from '../../theme';

interface BudgetSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: BudgetGlobalConfig;
    onSave: (config: BudgetGlobalConfig) => void;
    allRawRecords: RawRecord[];
}

const GROUP_META = {
    fixed: { label: '📌 固定支出', color: '#F97316', bg: 'rgba(249, 115, 22, 0.10)' },
    daily: { label: '💰 日常預算', color: '#10B981', bg: 'rgba(16, 185, 129, 0.10)' },
};

const BudgetSettingsModal: React.FC<BudgetSettingsModalProps> = ({
    isOpen, onClose, config, onSave, allRawRecords
}) => {
    const [includedProjects, setIncludedProjects] = useState<Set<string>>(new Set());
    const [splitProjects, setSplitProjects] = useState<Set<string>>(new Set());
    const [projectGroups, setProjectGroups] = useState<{ [p: string]: 'fixed' | 'daily' }>({});

    const uniqueProjects = React.useMemo(() => {
        const projects = new Set<string>();
        projects.add('正常開銷');
        projects.add('共同開銷');
        allRawRecords.forEach(r => {
            const proj = r['專案'];
            if (proj && !proj.match(/^\d{6}-/)) {
                projects.add(proj);
            }
        });
        projects.add('');
        return Array.from(projects).filter(p => p !== undefined).sort();
    }, [allRawRecords]);

    useEffect(() => {
        if (isOpen) {
            setIncludedProjects(new Set(config.includedProjects));
            setSplitProjects(new Set(config.splitProjects));
            setProjectGroups(config.projectGroups || {});
        }
    }, [isOpen, config]);

    const toggleIncluded = (proj: string) => {
        const next = new Set(includedProjects);
        if (next.has(proj)) next.delete(proj);
        else next.add(proj);
        setIncludedProjects(next);
    };

    const toggleSplit = (proj: string) => {
        const next = new Set(splitProjects);
        if (next.has(proj)) next.delete(proj);
        else next.add(proj);
        setSplitProjects(next);
    };

    const toggleProjectGroup = (proj: string) => {
        setProjectGroups(prev => ({
            ...prev,
            [proj]: prev[proj] === 'fixed' ? 'daily' : 'fixed',
        }));
    };

    const handleSave = () => {
        onSave({
            includedProjects: Array.from(includedProjects),
            splitProjects: Array.from(splitProjects),
            projectGroups,
        });
        onClose();
    };

    const includedArray = Array.from(includedProjects).sort();

    return (
        <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>預算計算設定</Text>
                        <Pressable onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </Pressable>
                    </View>

                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {/* Section 1: Included Projects */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>納入計算的專案</Text>
                            <Text style={styles.sectionDesc}>只有勾選的專案才會被納入預算與支出統計。</Text>
                            {uniqueProjects.map(proj => (
                                <View key={`inc-${proj}`} style={styles.row}>
                                    <Text style={styles.rowLabel}>{proj || '(無專案)'}</Text>
                                    <Switch
                                        value={includedProjects.has(proj)}
                                        onValueChange={() => toggleIncluded(proj)}
                                        trackColor={{ false: '#ddd', true: COLORS.accent }}
                                    />
                                </View>
                            ))}
                        </View>

                        {/* Section 2: Project Group Assignment */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>專案群組分類</Text>
                            <Text style={styles.sectionDesc}>
                                將納入計算的專案分為「固定支出」或「日常預算」。{'\n'}
                                固定支出會從總預算中扣除，以計算可支配的日常預算。
                            </Text>
                            {includedArray.map(proj => {
                                const group = projectGroups[proj] || 'daily';
                                const meta = GROUP_META[group];
                                return (
                                    <View key={`grp-${proj}`} style={styles.row}>
                                        <Text style={styles.rowLabel}>{proj || '(無專案)'}</Text>
                                        <Pressable
                                            onPress={() => toggleProjectGroup(proj)}
                                            style={[styles.groupBadge, { backgroundColor: meta.bg }]}
                                        >
                                            <Text style={[styles.groupBadgeText, { color: meta.color }]}>
                                                {meta.label}
                                            </Text>
                                        </Pressable>
                                    </View>
                                );
                            })}
                            {includedArray.length === 0 && (
                                <Text style={styles.emptyHint}>請先在上方勾選要納入計算的專案</Text>
                            )}
                        </View>

                        {/* Section 3: Split Projects */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>自動分帳專案 (50%)</Text>
                            <Text style={styles.sectionDesc}>勾選的專案，其支出將自動除以 2 計算（例如：共同開銷）。</Text>
                            {includedArray.map(proj => (
                                <View key={`split-${proj}`} style={styles.row}>
                                    <Text style={styles.rowLabel}>{proj || '(無專案)'}</Text>
                                    <Switch
                                        value={splitProjects.has(proj)}
                                        onValueChange={() => toggleSplit(proj)}
                                        trackColor={{ false: '#ddd', true: COLORS.blue }}
                                    />
                                </View>
                            ))}
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        <View style={styles.footerButtons}>
                            <Pressable onPress={onClose} style={styles.btnCancel}>
                                <Text style={styles.btnTextCancel}>取消</Text>
                            </Pressable>
                            <Pressable onPress={handleSave} style={styles.btnSave}>
                                <Text style={styles.saveBtnText}>儲存設定</Text>
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
    content: { paddingVertical: 16 },
    section: { marginBottom: 30 },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6, color: COLORS.textPrimary },
    sectionDesc: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 18 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
    rowLabel: { fontSize: 16, color: COLORS.textPrimary, fontWeight: '500', flex: 1 },
    groupBadge: {
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    },
    groupBadgeText: { fontSize: 13, fontWeight: '700' },
    emptyHint: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', paddingVertical: 10 },
    footer: { paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.divider },
    footerButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    btnCancel: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
    btnSave: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, backgroundColor: COLORS.accent },
    btnTextCancel: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 16 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});

export default BudgetSettingsModal;
