import React, { useState, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert, Modal, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useFinance } from '../../context/FinanceContext';
import { loadBudgets, saveBudgets, loadBudgetConfig, saveBudgetConfig, calculateBudgetStatus } from '../../services/budgetService';
import { BudgetRule, BudgetGlobalConfig, TransformedRecord, BudgetStatus } from '../../types';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../../theme';
import { BudgetProgressCard, OtherExpensesCard } from '../../components/budget/BudgetProgressCard';
import BudgetSettingModal from '../../components/budget/BudgetSettingModal';
import SettingsModal from '../../components/settings/SettingsModal';
import BatchBudgetModal from '../../components/budget/BatchBudgetModal';
import DetailModal from '../../components/DetailModal';
import { transformRecordsForExport, detectExpenseSpikes } from '../../services/financeService';
import { Ionicons } from '@expo/vector-icons';
import UnifiedDateNavigator from '../../components/layout/UnifiedDateNavigator';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function BudgetScreen() {
    const { 
        records, 
        refreshRecords,
        budgets,
        saveBudgets,
        budgetConfig: config,
        customMappings
    } = useFinance();
    const navigation = useNavigation();
    const [refreshing, setRefreshing] = useState(false);

    // Budget State
    const [targetMonth, setTargetMonth] = useState(new Date());

    // Modals State
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Sort State
    type BudgetSortKey = 'spent_desc' | 'spent_asc' | 'limit_desc' | 'limit_asc' | 'pct_desc' | 'pct_asc' | 'remaining_desc' | 'remaining_asc' | 'name_asc' | 'name_desc';
    const [sortKey, setSortKey] = useState<BudgetSortKey>('pct_desc');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [formCategory, setFormCategory] = useState('');
    const [formLimit, setFormLimit] = useState('');

    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setIsLoaded(true);
    }, []);

    const loadData = async () => {
        setIsLoaded(true);
    };

    // Save budgets effect — also sync notification + widget
    useEffect(() => {
        if (isLoaded) {
            import('../../services/NotificationService').then(ns => ns.default.syncWithRecords(records));
            import('../../services/WidgetService').then(ws => ws.default.syncWidgetData(records));
        }
    }, [budgets, records, isLoaded]);

    // Reload on tab focus
    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshRecords();
        setRefreshing(false);
    }, [refreshRecords]);

    // Calculations
    const budgetCalc = useMemo(() => {
        return calculateBudgetStatus(records, budgets, targetMonth, config);
    }, [records, budgets, targetMonth, config]);

    const sortStatuses = useCallback((statuses: BudgetStatus[]) => {
        return [...statuses].sort((a, b) => {
            switch (sortKey) {
                case 'spent_desc': return b.spent - a.spent;
                case 'spent_asc': return a.spent - b.spent;
                case 'limit_desc': return b.rule.monthlyLimit - a.rule.monthlyLimit;
                case 'limit_asc': return a.rule.monthlyLimit - b.rule.monthlyLimit;
                case 'pct_desc': return (b.spent / (b.rule.monthlyLimit || 1)) - (a.spent / (a.rule.monthlyLimit || 1));
                case 'pct_asc': return (a.spent / (a.rule.monthlyLimit || 1)) - (b.spent / (b.rule.monthlyLimit || 1));
                case 'remaining_desc': return (b.rule.monthlyLimit - b.spent) - (a.rule.monthlyLimit - a.spent);
                case 'remaining_asc': return (a.rule.monthlyLimit - a.spent) - (b.rule.monthlyLimit - b.spent);
                case 'name_asc': return a.rule.category.localeCompare(b.rule.category);
                case 'name_desc': return b.rule.category.localeCompare(a.rule.category);
                default: return 0;
            }
        });
    }, [sortKey]);

    const sortedDailyStatuses = useMemo(() => sortStatuses(budgetCalc.dailyStatuses), [budgetCalc.dailyStatuses, sortStatuses]);

    // Derived values
    // totalBudget = 所有 BudgetRule 的總和（涵蓋固定+日常）
    const totalBudget = budgetCalc.totalDailyBudget;
    // 可支配日常 = 總預算 − 固定支出實際花費
    const disposableDailyBudget = totalBudget - budgetCalc.totalFixedSpent;
    const dailyRemaining = disposableDailyBudget - budgetCalc.totalDailySpent;
    const hasFixedProjects = budgetCalc.fixedProjectStatuses.length > 0;

    const spikes = useMemo(() => {
        if (records.length === 0) return [];
        const start = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
        const end = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        const projectFilter = config.includedProjects && config.includedProjects.length > 0
            ? config.includedProjects
            : null;

        return detectExpenseSpikes(
            records,
            start,
            end,
            null, // no account filter
            true, // split shared accounts
            customMappings || {},
            projectFilter,
            config.splitProjects
        );
    }, [records, targetMonth, config, customMappings]);

    const uniqueCategories = useMemo(() => {
        const cats = new Set<string>();
        records.forEach(r => {
            if (r['付款(轉出)'] && !r['收款(轉入)'] && r['分類'] && r['分類'] !== 'SYSTEM' && r['分類'] !== '代付') {
                cats.add(r['分類']);
            }
        });
        return Array.from(cats).sort();
    }, [records]);

    const handleMonthChange = (offset: number) => {
        const newDate = new Date(targetMonth);
        newDate.setMonth(newDate.getMonth() + offset);
        setTargetMonth(newDate);
    };

    const openModal = (rule?: BudgetRule) => {
        if (rule) {
            setEditingId(rule.id);
            setFormCategory(rule.category);
            setFormLimit(rule.monthlyLimit.toString());
        } else {
            setEditingId(null);
            setFormCategory(uniqueCategories[0] || '');
            setFormLimit('');
        }
        setIsModalOpen(true);
    };

    const handleSaveBudget = async (category: string, limit: number, isEdit: boolean) => {
        let updated: BudgetRule[] = [];
        if (isEdit && editingId) {
            updated = budgets.map(b => b.id === editingId ? { ...b, category, monthlyLimit: limit } : b);
        } else {
            if (budgets.some(b => b.category === category)) {
                Alert.alert('提示', '此類別已設定預算，請使用編輯功能。');
                return;
            }
            updated = [...budgets, {
                id: Date.now().toString(),
                category,
                monthlyLimit: limit
            }];
        }
        await saveBudgets(updated);
        setIsModalOpen(false);
    };

    const handleDeleteBudget = (id: string) => {
        Alert.alert('刪除預算', '確定要刪除此預算設定嗎？', [
            { text: '取消', style: 'cancel' },
            { text: '刪除', style: 'destructive', onPress: async () => {
                const updated = budgets.filter(b => b.id !== id);
                await saveBudgets(updated);
            }}
        ]);
    };

    // Detail Modal State
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [detailModalTitle, setDetailModalTitle] = useState('');
    const [detailModalData, setDetailModalData] = useState<TransformedRecord[]>([]);

    const handleCardClick = (categoryName: string, isOther: boolean = false) => {
        const targetYear = targetMonth.getFullYear();
        const targetMonthIndex = targetMonth.getMonth();

        // 只取日常專案的記錄
        const dailyProjects = config.includedProjects.filter(
            p => (config.projectGroups[p] || 'daily') === 'daily'
        );

        const monthlyRecords = records.filter(record => {
            let year, month;
            if (record.parsedDate) {
                year = record.parsedDate.getFullYear();
                month = record.parsedDate.getMonth();
            } else if (record['日期'] && typeof record['日期'] === 'string') {
                const dateStr = record['日期'];
                if (dateStr.includes('/') || dateStr.includes('-')) {
                    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
                    if (parts.length === 3) {
                        year = parseInt(parts[0], 10);
                        month = parseInt(parts[1], 10) - 1;
                    } else { return false; }
                } else if (dateStr.length >= 8) {
                    year = parseInt(dateStr.substring(0, 4), 10);
                    month = parseInt(dateStr.substring(4, 6), 10) - 1;
                } else { return false; }
            } else { return false; }

            if (year !== targetYear || month !== targetMonthIndex) return false;

            const expenseAccount = record['付款(轉出)'];
            const incomeAccount = record['收款(轉入)'];
            if (!expenseAccount || incomeAccount || record['分類'] === 'SYSTEM' || record['分類'] === '代付') return false;

            const project = record['專案'] || '';
            if (!dailyProjects.includes(project)) return false;

            if (isOther) {
                const budgetedCats = new Set(budgets.map(b => b.category));
                return !budgetedCats.has(record['分類']);
            } else {
                return record['分類'] === categoryName;
            }
        });

        const transformedData: TransformedRecord[] = monthlyRecords.flatMap(r => {
            const tArr = transformRecordsForExport([r]);
            if (tArr.length === 0) return [];
            const t = tArr[0];
            const project = r['專案'] || '';
            const isSplitProject = config.splitProjects.includes(project);
            if (isSplitProject) {
                return [{ ...t, '金額': t['金額'] * 0.5, '專案': t['專案'] ? `${t['專案']} (50%)` : '(分帳 50%)' }];
            }
            return [t];
        });

        setDetailModalTitle(`${isOther ? '其他 (未歸類)' : categoryName} 支出明細 (已按分帳規則計算)`);
        setDetailModalData(transformedData);
        setIsDetailModalOpen(true);
    };

    // 固定支出專案點擊 → 顯示該專案的明細
    const handleFixedProjectClick = (projectName: string) => {
        const targetYear = targetMonth.getFullYear();
        const targetMonthIndex = targetMonth.getMonth();

        const monthlyRecords = records.filter(record => {
            let year, month;
            if (record.parsedDate) {
                year = record.parsedDate.getFullYear();
                month = record.parsedDate.getMonth();
            } else if (record['日期'] && typeof record['日期'] === 'string') {
                const dateStr = record['日期'];
                if (dateStr.includes('/') || dateStr.includes('-')) {
                    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
                    if (parts.length === 3) {
                        year = parseInt(parts[0], 10);
                        month = parseInt(parts[1], 10) - 1;
                    } else { return false; }
                } else if (dateStr.length >= 8) {
                    year = parseInt(dateStr.substring(0, 4), 10);
                    month = parseInt(dateStr.substring(4, 6), 10) - 1;
                } else { return false; }
            } else { return false; }

            if (year !== targetYear || month !== targetMonthIndex) return false;

            const expenseAccount = record['付款(轉出)'];
            const incomeAccount = record['收款(轉入)'];
            if (!expenseAccount || incomeAccount || record['分類'] === 'SYSTEM' || record['分類'] === '代付') return false;

            return (record['專案'] || '') === projectName;
        });

        const transformedData: TransformedRecord[] = monthlyRecords.flatMap(r => {
            const tArr = transformRecordsForExport([r]);
            if (tArr.length === 0) return [];
            const t = tArr[0];
            const project = r['專案'] || '';
            const isSplitProject = config.splitProjects.includes(project);
            if (isSplitProject) {
                return [{ ...t, '金額': t['金額'] * 0.5, '專案': t['專案'] ? `${t['專案']} (50%)` : '(分帳 50%)' }];
            }
            return [t];
        });

        setDetailModalTitle(`${projectName} 固定支出明細 (已按分帳規則計算)`);
        setDetailModalData(transformedData);
        setIsDetailModalOpen(true);
    };

    // Set header right buttons
    useLayoutEffect(() => {
        navigation.setOptions({
            headerRightContainerStyle: { paddingRight: 16 },
            headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable
                        onPress={() => openModal()}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => [styles.headerAddBtn, pressed && { opacity: 0.6, transform: [{ scale: 0.9 }] }]}
                    >
                        <Text style={styles.headerAddBtnText}>+</Text>
                    </Pressable>
                </View>
            ),
        });
    }, [navigation]);

    return (
        <View style={styles.container}>
            {/* Header / Month Navigator */}
            <View style={styles.header}>
                <UnifiedDateNavigator
                    dateLabel={`${targetMonth.getFullYear()}年 ${targetMonth.getMonth() + 1}月`}
                    subLabel={`總預算 $${totalBudget.toLocaleString()}`}
                    onPrev={() => handleMonthChange(-1)}
                    onNext={() => handleMonthChange(1)}
                    onCenterPress={() => { }}
                />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* ══ Unified Summary Card ══ */}
                <View style={styles.summaryCard}>
                    {/* Segmented Progress Bar */}
                    <View style={styles.segBarContainer}>
                        <View style={styles.segBarTrack}>
                            {totalBudget > 0 && (
                                <>
                                    {/* Fixed segment (blue-gray) */}
                                    <View style={[styles.segBarFill, {
                                        width: `${Math.min((budgetCalc.totalFixedSpent / totalBudget) * 100, 100)}%`,
                                        backgroundColor: '#64748B',
                                        borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
                                    }]} />
                                    {/* Daily segment (indigo) */}
                                    <View style={[styles.segBarFill, {
                                        width: `${Math.min((budgetCalc.totalDailySpent / totalBudget) * 100, Math.max(0, 100 - (budgetCalc.totalFixedSpent / totalBudget) * 100))}%`,
                                        backgroundColor: '#6366F1',
                                    }]} />
                                </>
                            )}
                        </View>
                        {/* Legend chips */}
                        <View style={styles.segLegendRow}>
                            <View style={styles.segLegendItem}>
                                <View style={[styles.segLegendDot, { backgroundColor: '#64748B' }]} />
                                <Text style={styles.segLegendText}>固定</Text>
                            </View>
                            <View style={styles.segLegendItem}>
                                <View style={[styles.segLegendDot, { backgroundColor: '#6366F1' }]} />
                                <Text style={styles.segLegendText}>日常</Text>
                            </View>
                            <View style={styles.segLegendItem}>
                                <View style={[styles.segLegendDot, { backgroundColor: COLORS.divider }]} />
                                <Text style={styles.segLegendText}>剩餘</Text>
                            </View>
                        </View>
                    </View>

                    {/* Key Metrics Grid */}
                    <View style={styles.metricsGrid}>
                        <View style={styles.metricItem}>
                            <Text style={styles.metricLabel}>📌 固定支出</Text>
                            <Text style={[styles.metricValue, { color: '#64748B' }]}>
                                ${budgetCalc.totalFixedSpent.toLocaleString()}
                            </Text>
                        </View>
                        <View style={styles.metricDividerV} />
                        <View style={styles.metricItem}>
                            <Text style={styles.metricLabel}>💰 日常已支出</Text>
                            <Text style={[styles.metricValue, { color: budgetCalc.totalDailySpent > disposableDailyBudget ? COLORS.red : '#6366F1' }]}>
                                ${budgetCalc.totalDailySpent.toLocaleString()}
                            </Text>
                        </View>
                        <View style={styles.metricDividerV} />
                        <View style={styles.metricItem}>
                            <Text style={styles.metricLabel}>{dailyRemaining >= 0 ? '✨ 可用餘額' : '⚠️ 超支'}</Text>
                            <Text style={[styles.metricValue, {
                                color: dailyRemaining >= 0 ? COLORS.green : COLORS.red,
                            }]}>
                                ${Math.abs(dailyRemaining).toLocaleString()}
                            </Text>
                        </View>
                    </View>

                </View>

                {/* ════════════════ 固定支出區 ════════════════ */}
                {hasFixedProjects && (
                    <View style={styles.groupSection}>
                        <View style={[styles.groupHeader, { borderLeftColor: '#64748B' }]}>
                            <Text style={styles.groupTitle}>📌 固定支出</Text>
                            <Text style={styles.groupSubtitle}>
                                合計 <Text style={{ color: '#64748B', fontWeight: '800' }}>${budgetCalc.totalFixedSpent.toLocaleString()}</Text>
                            </Text>
                        </View>
                        {budgetCalc.fixedProjectStatuses.map(ps => (
                            <Pressable
                                key={ps.project}
                                onPress={() => handleFixedProjectClick(ps.project)}
                                style={({ pressed }) => [
                                    styles.fixedProjectCard,
                                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                                ]}
                            >
                                <View style={styles.fixedProjectStrip} />
                                <View style={styles.fixedProjectContent}>
                                    <Text style={styles.fixedProjectName}>{ps.project || '(無專案)'}</Text>
                                    <Text style={styles.fixedProjectAmount}>
                                        ${ps.spent.toLocaleString()}
                                    </Text>
                                </View>
                            </Pressable>
                        ))}
                    </View>
                )}

                {/* ════════════════ 日常預算區 ════════════════ */}
                <View style={styles.groupSection}>
                    <View style={[styles.groupHeader, { borderLeftColor: '#10B981' }]}>
                        <Text style={styles.groupTitle}>💰 日常預算</Text>
                        <Text style={styles.groupSubtitle}>
                            {dailyRemaining >= 0 ? '剩餘 ' : '超支 '}
                            <Text style={{ color: dailyRemaining >= 0 ? COLORS.green : COLORS.red, fontWeight: '800' }}>
                                ${Math.abs(dailyRemaining).toLocaleString()}
                            </Text>
                        </Text>
                    </View>

                    {/* Sort Chips (only for daily) */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow} style={styles.sortContainer}>
                        {([
                            { baseKey: 'pct', label: '使用率' },
                            { baseKey: 'spent', label: '已支出' },
                            { baseKey: 'remaining', label: '剩餘' },
                            { baseKey: 'limit', label: '預算額' },
                            { baseKey: 'name', label: '名稱' },
                        ] as { baseKey: string; label: string }[]).map(opt => {
                            const isActive = sortKey.startsWith(opt.baseKey);
                            const isAsc = sortKey === `${opt.baseKey}_asc`;
                            return (
                                <Pressable
                                    key={opt.baseKey}
                                    onPress={() => {
                                        if (isActive) {
                                            setSortKey(`${opt.baseKey}_${isAsc ? 'desc' : 'asc'}` as any);
                                        } else {
                                            setSortKey(`${opt.baseKey}_desc` as any);
                                        }
                                    }}
                                    style={[styles.sortChip, isActive ? styles.sortChipActive : null]}
                                >
                                    <Text style={[styles.sortChipText, isActive ? styles.sortChipTextActive : null]}>
                                        {opt.label}{isActive && (isAsc ? ' ▴' : ' ▾')}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    {/* Daily Budget Cards */}
                    <View style={styles.listContainer}>
                        {sortedDailyStatuses.map(status => (
                            <BudgetProgressCard
                                key={status.rule.id}
                                status={status}
                                onEdit={() => openModal(status.rule)}
                                onDelete={() => handleDeleteBudget(status.rule.id)}
                                onClick={() => handleCardClick(status.rule.category)}
                            />
                        ))}
                        {budgetCalc.dailyUnbudgetedSpent > 0 && (
                            <OtherExpensesCard amount={budgetCalc.dailyUnbudgetedSpent} onClick={() => handleCardClick('OTHER', true)} />
                        )}
                    </View>
                </View>

                {budgetCalc.dailyStatuses.length === 0 && budgetCalc.fixedProjectStatuses.length === 0 && budgetCalc.dailyUnbudgetedSpent === 0 && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>尚無預算設定且無支出</Text>
                    </View>
                )}

                {/* 財務健檢 (Health Alerts) */}
                <View style={{ marginTop: 24, marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                        <View style={{ width: 4, height: 18, borderRadius: 2, marginRight: 10, backgroundColor: spikes.length > 0 ? COLORS.red : COLORS.green }} />
                        <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 }}>財務健檢</Text>
                    </View>
                    
                    {spikes.length === 0 ? (
                        <Animated.View entering={FadeInDown.duration(400).springify()} style={[styles.healthCard, { borderColor: COLORS.green + '30', backgroundColor: COLORS.green + '05', borderWidth: 1.5, padding: 16, borderRadius: 20 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.green} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }}>本月消費控制良好</Text>
                                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>未發現異常超支的消費分類，請繼續保持！</Text>
                                </View>
                            </View>
                        </Animated.View>
                    ) : (
                        <View style={{ gap: 12 }}>
                            {spikes.map((spike, idx) => {
                                const isRed = spike.status === 'red';
                                const isNew = spike.status === 'new';
                                const badgeColor = isRed ? COLORS.red : isNew ? COLORS.accent : COLORS.yellow;
                                const cardBg = isRed ? COLORS.red + '05' : isNew ? COLORS.accent + '05' : COLORS.yellow + '05';
                                const cardBorder = isRed ? COLORS.red + '30' : isNew ? COLORS.accent + '30' : COLORS.yellow + '30';

                                const description = isNew 
                                    ? `本月新增支出達 $${spike.currentSpent.toLocaleString()}，過去 3 期無此項支出。`
                                    : `本月花費 $${spike.currentSpent.toLocaleString()}，已達歷史平均 ($${spike.avgSpent.toLocaleString()}) 的 ${Math.round(spike.ratio * 100)}%，超額 $${spike.difference.toLocaleString()}。`;

                                return (
                                    <Animated.View 
                                        key={spike.category} 
                                        entering={FadeInDown.delay(idx * 100).duration(400).springify()}
                                    >
                                        <Pressable
                                            onPress={() => {
                                                setDetailModalTitle(`${spike.category} 異常消費明細 (Top 5)`);
                                                setDetailModalData(spike.topTransactions);
                                                setIsDetailModalOpen(true);
                                            }}
                                            style={({ pressed }) => [
                                                styles.healthCard, 
                                                { 
                                                    borderColor: cardBorder, 
                                                    backgroundColor: cardBg,
                                                    borderWidth: 1.5,
                                                    padding: 16,
                                                    borderRadius: 20,
                                                    opacity: pressed ? 0.8 : 1 
                                                }
                                            ]}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                                <View style={{ marginTop: 2 }}>
                                                    <Ionicons 
                                                        name={isRed ? "alert-circle" : isNew ? "sparkles" : "warning"} 
                                                        size={22} 
                                                        color={badgeColor} 
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' }}>
                                                            {spike.category}
                                                        </Text>
                                                        <Text style={{ color: badgeColor, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                                                            {isNew ? '🆕 全新類別' : isRed ? '🔴 嚴重超支' : '🟡 輕微超支'}
                                                        </Text>
                                                    </View>
                                                    
                                                    <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 18 }}>
                                                        {description}
                                                    </Text>
                                                    
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
                                                        <Text style={{ color: badgeColor, fontSize: 11, fontWeight: '600' }}>點擊查看大額明細</Text>
                                                        <Ionicons name="chevron-forward" size={12} color={badgeColor} />
                                                    </View>
                                                </View>
                                            </View>
                                        </Pressable>
                                    </Animated.View>
                                );
                            })}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Modals */}
            <BudgetSettingModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveBudget}
                editingId={editingId}
                initialCategory={formCategory}
                initialLimit={formLimit}
                uniqueCategories={uniqueCategories}
                allRawRecords={records}
            />

            <DetailModal
                visible={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title={detailModalTitle}
                records={detailModalData}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    header: {
        paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.headerBg,
        borderBottomWidth: 1, borderBottomColor: COLORS.divider, ...SHADOWS.sm, zIndex: 10,
    },
    scrollContent: { paddingVertical: 12, paddingHorizontal: 16, paddingBottom: 40 },

    // ── Unified Summary Card ──
    summaryCard: {
        backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 6, ...SHADOWS.sm,
    },
    segBarContainer: { marginBottom: 14 },
    segBarTrack: {
        flexDirection: 'row', height: 10, backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: 5, overflow: 'hidden',
    },
    segBarFill: { height: '100%' },
    segLegendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
    segLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    segLegendDot: { width: 8, height: 8, borderRadius: 4 },
    segLegendText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },

    // ── Metrics Grid ──
    metricsGrid: {
        flexDirection: 'row', alignItems: 'center',
        borderTopWidth: 1, borderTopColor: COLORS.divider, paddingTop: 12,
    },
    metricItem: { flex: 1, alignItems: 'center' },
    metricLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4, letterSpacing: -0.2 },
    metricValue: { fontSize: 17, fontWeight: '800', letterSpacing: -0.5 },
    metricDividerV: { width: 1, height: 32, backgroundColor: COLORS.divider },

    // ── Group Sections ──
    groupSection: { marginTop: 14 },
    groupHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10,
    },
    groupTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.2 },
    groupSubtitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

    // ── Fixed Project Card ──
    fixedProjectCard: {
        flexDirection: 'row', borderRadius: 14, marginBottom: 8, borderWidth: 1,
        overflow: 'hidden', backgroundColor: COLORS.card,
        borderColor: 'rgba(100, 116, 139, 0.18)', ...SHADOWS.sm,
    },
    fixedProjectStrip: { width: 4, backgroundColor: '#64748B' },
    fixedProjectContent: {
        flex: 1, paddingVertical: 14, paddingHorizontal: 14,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    fixedProjectName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3 },
    fixedProjectAmount: { fontSize: 16, fontWeight: '800', color: '#64748B', letterSpacing: -0.3 },

    // ── Sort Chips ──
    sortContainer: { marginBottom: 8 },
    sortRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    sortChip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder, ...SHADOWS.sm,
    },
    sortChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
    sortChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
    sortChipTextActive: { color: '#fff' },

    listContainer: { },

    // ── Header Add Button ──
    headerAddBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
    },
    headerAddBtnText: { color: '#0F172A', fontSize: 24, fontWeight: '700', lineHeight: 26 },

    // ── Empty State ──
    emptyState: {
        padding: 40, alignItems: 'center', width: '100%', backgroundColor: COLORS.card,
        borderRadius: 20, borderWidth: 1, borderColor: COLORS.divider, marginTop: 20,
    },
    emptyText: { ...TYPOGRAPHY.body, textAlign: 'center' },

    // ── Settings Quick Menu ──
    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    menuCard: {
        backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingTop: 12, paddingBottom: 40, paddingHorizontal: 24, ...SHADOWS.lg,
    },
    menuHandle: {
        width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
        alignSelf: 'center', marginBottom: 16,
    },
    menuTitle: {
        fontSize: 18, fontWeight: '700', color: COLORS.textPrimary,
        marginBottom: 20, letterSpacing: -0.3,
    },
    menuOption: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14,
    },
    menuOptionTextWrap: { flex: 1 },
    menuIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    menuOptionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 3 },
    menuOptionDesc: { fontSize: 13, color: COLORS.textMuted, lineHeight: 17 },
    menuDivider: { height: 1, backgroundColor: COLORS.divider, marginVertical: 4, marginHorizontal: 8 },
    healthCard: {
        padding: 16,
        borderRadius: 20,
        borderWidth: 1.5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
});
