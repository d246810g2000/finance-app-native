import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { RawRecord, BudgetGlobalConfig, BudgetRule } from '../../types';
import { AppColors, SHADOWS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import ModalBackdrop from '../ui/ModalBackdrop';
import BatchBudgetModal from '../budget/BatchBudgetModal';
import { ProjectLifecycle } from '../../services/financeService';

/** 自動預設時間軸：排除日常專案，避免一進來被佔滿 */
const AUTO_EXCLUDE_NAMES = new Set(['正常開銷', '共同開銷']);

export function getAutoTimelineProjectNames(lifecycles: ProjectLifecycle[]): string[] {
    return lifecycles
        .filter((l) => l.monthSpan >= 2 && l.totalExpense >= 50000 && !AUTO_EXCLUDE_NAMES.has(l.name))
        .slice(0, 6)
        .map((l) => l.name);
}

/** 設定可勾選清單：所有有支出的專案（含正常／共同開銷） */
export function getTimelineCandidateProjects(lifecycles: ProjectLifecycle[]): ProjectLifecycle[] {
    return [...lifecycles].sort((a, b) => b.totalExpense - a.totalExpense);
}

interface ProjectSettingsModalProps {
    visible: boolean;
    onClose: () => void;
    config: BudgetGlobalConfig;
    onSaveConfig: (config: BudgetGlobalConfig) => void;
    allRawRecords: RawRecord[];
    lifecycles: ProjectLifecycle[];
    globalExcludeTravel: boolean;
    onExcludeTravelChange: (value: boolean) => void;
    budgets: BudgetRule[];
    onSaveBudgets: (budgets: BudgetRule[]) => void;
    uniqueCategories: string[];
}

const getGroupMeta = (colors: AppColors) => ({
    fixed: { label: '固定支出', color: colors.yellow, bg: colors.yellowLight },
    daily: { label: '日常預算', color: colors.green, bg: colors.greenLight },
});

export default function ProjectSettingsModal({
    visible,
    onClose,
    config,
    onSaveConfig,
    allRawRecords,
    lifecycles,
    globalExcludeTravel,
    onExcludeTravelChange,
    budgets,
    onSaveBudgets,
    uniqueCategories,
}: ProjectSettingsModalProps) {
    const { colors, typography, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    const groupMeta = useMemo(() => getGroupMeta(colors), [colors]);
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    const [timelineProjects, setTimelineProjects] = useState<Set<string>>(new Set());
    const [includedProjects, setIncludedProjects] = useState<Set<string>>(new Set());
    const [splitProjects, setSplitProjects] = useState<Set<string>>(new Set());
    const [projectGroups, setProjectGroups] = useState<{ [p: string]: 'fixed' | 'daily' }>({});
    const [splitSharedAccounts, setSplitSharedAccounts] = useState(false);
    const [excludeTravel, setExcludeTravel] = useState(globalExcludeTravel);
    const [isBatchEditVisible, setIsBatchEditVisible] = useState(false);

    const timelineCandidates = useMemo(() => getTimelineCandidateProjects(lifecycles), [lifecycles]);

    const uniqueProjects = useMemo(() => {
        const projects = new Set<string>();
        projects.add('正常開銷');
        projects.add('共同開銷');
        allRawRecords.forEach((r) => {
            const proj = r['專案'];
            if (proj && !proj.match(/^\d{6}-/)) projects.add(proj);
        });
        projects.add('');
        return Array.from(projects).filter((p) => p !== undefined).sort();
    }, [allRawRecords]);

    useEffect(() => {
        if (!visible) return;
        const auto = getAutoTimelineProjectNames(lifecycles);
        const saved = config.timelineProjects;
        setTimelineProjects(new Set(saved != null ? saved : auto));
        setIncludedProjects(new Set(config.includedProjects));
        setSplitProjects(new Set(config.splitProjects));
        setProjectGroups(config.projectGroups || {});
        setSplitSharedAccounts(!!config.isSplitEnabled);
        setExcludeTravel(globalExcludeTravel);
    }, [visible, config, lifecycles, globalExcludeTravel]);

    const toggleTimeline = (name: string) => {
        setTimelineProjects((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const toggleIncluded = (proj: string) => {
        setIncludedProjects((prev) => {
            const next = new Set(prev);
            if (next.has(proj)) next.delete(proj);
            else next.add(proj);
            return next;
        });
    };

    const toggleSplit = (proj: string) => {
        setSplitProjects((prev) => {
            const next = new Set(prev);
            if (next.has(proj)) next.delete(proj);
            else next.add(proj);
            return next;
        });
    };

    const toggleProjectGroup = (proj: string) => {
        setProjectGroups((prev) => ({
            ...prev,
            [proj]: prev[proj] === 'fixed' ? 'daily' : 'fixed',
        }));
    };

    const handleSave = () => {
        onExcludeTravelChange(excludeTravel);
        onSaveConfig({
            includedProjects: Array.from(includedProjects),
            splitProjects: Array.from(splitProjects),
            projectGroups,
            isSplitEnabled: splitSharedAccounts,
            healthCheckProjects: config.healthCheckProjects,
            timelineProjects: Array.from(timelineProjects),
        });
        onClose();
    };

    const includedArray = Array.from(includedProjects).sort();

    return (
        <>
            <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
                <ModalBackdrop colors={colors} isDark={isDark}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                    <Animated.View entering={FadeInDown.springify()} style={styles.modalContent}>
                        <View style={styles.dragHandle} />

                        <View style={styles.header}>
                            <View style={styles.headerText}>
                                <Text style={styles.title}>專案與預算設定</Text>
                                <Text style={styles.subtitle}>時間軸顯示、預算納入專案與分帳規則</Text>
                            </View>
                            <Pressable onPress={handleSave} style={styles.saveBtn} accessibilityRole="button" accessibilityLabel="儲存">
                                <Text style={styles.saveBtnText}>儲存</Text>
                            </Pressable>
                        </View>

                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>長期時間軸顯示</Text>
                                <Text style={styles.sectionDesc}>
                                    勾選要出現在專案頁上方時間軸的專案（含日常／長期專案）。
                                </Text>
                                {timelineCandidates.length === 0 ? (
                                    <Text style={styles.emptyHint}>尚無跨月專案可顯示</Text>
                                ) : (
                                    <View style={styles.card}>
                                        {timelineCandidates.map((l, index) => {
                                            const isLast = index === timelineCandidates.length - 1;
                                            return (
                                                <View
                                                    key={l.name}
                                                    style={[styles.row, !isLast && styles.rowBorder]}
                                                >
                                                    <View style={styles.rowTextCol}>
                                                        <Text style={styles.rowLabel}>{l.name}</Text>
                                                        <Text style={styles.rowMeta}>
                                                            {l.monthSpan} 個月 · ${l.totalExpense.toLocaleString()}
                                                        </Text>
                                                    </View>
                                                    <Switch
                                                        value={timelineProjects.has(l.name)}
                                                        onValueChange={() => toggleTimeline(l.name)}
                                                        trackColor={{ false: colors.border, true: colors.accent }}
                                                        thumbColor="#fff"
                                                        ios_backgroundColor={colors.border}
                                                    />
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>旅遊專案</Text>
                                <View style={styles.card}>
                                    <View style={styles.row}>
                                        <View style={styles.rowTextCol}>
                                            <Text style={styles.rowLabel}>排除旅遊專案</Text>
                                            <Text style={styles.rowMeta}>統計與列表自動剔除旅遊專案支出</Text>
                                        </View>
                                        <Switch
                                            value={excludeTravel}
                                            onValueChange={setExcludeTravel}
                                            trackColor={{ false: colors.border, true: colors.accent }}
                                            thumbColor="#fff"
                                            ios_backgroundColor={colors.border}
                                        />
                                    </View>
                                </View>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>納入預算計算的專案</Text>
                                <Text style={styles.sectionDesc}>只有勾選的專案才會被納入預算與支出統計。</Text>
                                <View style={styles.card}>
                                    {uniqueProjects.map((proj, index) => {
                                        const isLast = index === uniqueProjects.length - 1;
                                        return (
                                            <View key={`inc-${proj || 'empty'}`} style={[styles.row, !isLast && styles.rowBorder]}>
                                                <Text style={styles.rowLabel}>{proj || '(無專案)'}</Text>
                                                <Switch
                                                    value={includedProjects.has(proj)}
                                                    onValueChange={() => toggleIncluded(proj)}
                                                    trackColor={{ false: colors.border, true: colors.accent }}
                                                    thumbColor="#fff"
                                                    ios_backgroundColor={colors.border}
                                                />
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>專案群組分類</Text>
                                <Text style={styles.sectionDesc}>
                                    固定支出會從總預算中扣除，以計算可支配的日常預算。點擊標籤切換。
                                </Text>
                                <View style={styles.card}>
                                    {includedArray.length === 0 ? (
                                        <Text style={[styles.emptyHint, { padding: 16 }]}>請先勾選要納入計算的專案</Text>
                                    ) : (
                                        includedArray.map((proj, index) => {
                                            const group = projectGroups[proj] || 'daily';
                                            const meta = groupMeta[group];
                                            const isLast = index === includedArray.length - 1;
                                            return (
                                                <View key={`grp-${proj || 'empty'}`} style={[styles.row, !isLast && styles.rowBorder]}>
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
                                        })
                                    )}
                                </View>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>分帳規則（最多 50% 一次）</Text>
                                <Text style={styles.sectionDesc}>
                                    1) 勾選「自動分帳專案」的支出先以 50% 計入。{'\n'}
                                    2) 未勾選時，若開啟「共享帳戶分帳」，付款帳戶為共享者再以 50% 計。{'\n'}
                                    兩者不會疊加。「共同開銷」建議勾選分帳。
                                </Text>
                                <View style={styles.card}>
                                    <View style={[styles.row, styles.rowBorder]}>
                                        <Text style={styles.rowLabel}>共享帳戶亦套用 50%</Text>
                                        <Switch
                                            value={splitSharedAccounts}
                                            onValueChange={setSplitSharedAccounts}
                                            trackColor={{ false: colors.border, true: colors.blue }}
                                            thumbColor="#fff"
                                            ios_backgroundColor={colors.border}
                                        />
                                    </View>
                                    {includedArray.map((proj, index) => {
                                        const isLast = index === includedArray.length - 1;
                                        return (
                                            <View key={`split-${proj || 'empty'}`} style={[styles.row, !isLast && styles.rowBorder]}>
                                                <Text style={styles.rowLabel}>{proj || '(無專案)'} · 自動分帳</Text>
                                                <Switch
                                                    value={splitProjects.has(proj)}
                                                    onValueChange={() => toggleSplit(proj)}
                                                    trackColor={{ false: colors.border, true: colors.blue }}
                                                    thumbColor="#fff"
                                                    ios_backgroundColor={colors.border}
                                                />
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>類別預算</Text>
                                <View style={styles.card}>
                                    <Pressable
                                        onPress={() => setIsBatchEditVisible(true)}
                                        style={({ pressed }) => [styles.batchRow, pressed && { opacity: 0.7 }]}
                                        accessibilityRole="button"
                                    >
                                        <View style={[styles.batchIcon, { backgroundColor: colors.blue + '15' }]}>
                                            <Ionicons name="grid-outline" size={20} color={colors.blue} />
                                        </View>
                                        <View style={styles.rowTextCol}>
                                            <Text style={styles.rowLabel}>批次編輯預算額</Text>
                                            <Text style={styles.rowMeta}>一次設定各消費類別的月預算上限</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                                    </Pressable>
                                </View>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </ModalBackdrop>
            </Modal>

            <BatchBudgetModal
                visible={isBatchEditVisible}
                onClose={() => setIsBatchEditVisible(false)}
                currentBudgets={budgets}
                onSave={onSaveBudgets}
                uniqueCategories={uniqueCategories}
                allRawRecords={allRawRecords}
                config={{
                    ...config,
                    includedProjects: Array.from(includedProjects),
                    splitProjects: Array.from(splitProjects),
                    projectGroups,
                    isSplitEnabled: splitSharedAccounts,
                    timelineProjects: Array.from(timelineProjects),
                }}
            />
        </>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) =>
    StyleSheet.create({
        modalContent: {
            backgroundColor: colors.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: '90%',
            ...SHADOWS.lg,
        },
        dragHandle: {
            width: 40,
            height: 5,
            backgroundColor: colors.border,
            borderRadius: 3,
            alignSelf: 'center',
            marginTop: 12,
            marginBottom: 8,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
            gap: 12,
        },
        headerText: { flex: 1 },
        title: {
            ...typography.h3,
            letterSpacing: -0.3,
            marginBottom: 4,
        },
        subtitle: {
            ...typography.caption,
            color: colors.textSecondary,
        },
        saveBtn: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: colors.accentLight,
            borderRadius: 16,
        },
        saveBtnText: {
            color: colors.accent,
            fontWeight: '700',
            fontSize: 14,
        },
        scrollView: { flex: 1 },
        scrollContent: { padding: 16 },
        section: { marginBottom: 28 },
        sectionTitle: {
            fontSize: 16,
            fontWeight: '800',
            color: colors.textPrimary,
            marginBottom: 6,
            marginLeft: 4,
        },
        sectionDesc: {
            fontSize: 13,
            color: colors.textSecondary,
            marginBottom: 12,
            marginLeft: 4,
            lineHeight: 18,
        },
        card: {
            backgroundColor: colors.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.divider,
            overflow: 'hidden',
        },
        row: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 16,
            gap: 12,
        },
        rowBorder: {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.divider,
        },
        rowTextCol: { flex: 1 },
        rowLabel: {
            fontSize: 16,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        rowMeta: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
        },
        groupBadge: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
        },
        groupBadgeText: { fontSize: 13, fontWeight: '700' },
        emptyHint: {
            fontSize: 13,
            color: colors.textMuted,
            fontStyle: 'italic',
            paddingVertical: 8,
            marginLeft: 4,
        },
        batchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
            gap: 12,
        },
        batchIcon: {
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
    });
