import React, { useState, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert, Modal, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useFinance } from '../../context/FinanceContext';
import { loadBudgets, saveBudgets, loadBudgetConfig, saveBudgetConfig, calculateBudgetStatus } from '../../services/budgetService';
import { BudgetRule, BudgetGlobalConfig, TransformedRecord, BudgetStatus } from '../../types';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { BudgetProgressCard, OtherExpensesCard } from '../../components/budget/BudgetProgressCard';
import HealthCheckCard from '../../components/budget/HealthCheckCard';
import BudgetSettingModal from '../../components/budget/BudgetSettingModal';
import SettingsModal from '../../components/settings/SettingsModal';
import BatchBudgetModal from '../../components/budget/BatchBudgetModal';
import DetailModal from '../../components/DetailModal';
import { transformRecordsForExport, detectExpenseSpikes } from '../../services/financeService';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import UnifiedDateNavigator from '../../components/layout/UnifiedDateNavigator';
import ModalBackdrop from '../../components/ui/ModalBackdrop';
import EmptyState from '../../components/ui/EmptyState';
import SortChips from '../../components/ui/SortChips';
import SectionHeader from '../../components/ui/SectionHeader';
import PageChrome from '../../components/layout/PageChrome';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function BudgetScreen() {
    const { colors, typography, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { 
        records, 
        refreshRecords,
        budgets,
        saveBudgets,
        budgetConfig: config,
        customMappings,
    } = useFinance();
    const navigation = useNavigation();
    const [refreshing, setRefreshing] = useState(false);

    // Budget State
    const [targetMonth, setTargetMonth] = useState(new Date());

    // Modals State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

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
    const fixedColor = colors.textSecondary;
    const dailyColor = colors.accent;

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

    const handleSelectMonth = (monthIndex: number) => {
        setTargetMonth(new Date(pickerYear, monthIndex, 1));
        setShowMonthPicker(false);
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
            headerRight: () => (
                <Pressable
                    onPress={() => openModal()}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => [styles.headerAddBtn, pressed && styles.headerAddBtnPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="新增預算"
                >
                    <Ionicons name="add" size={26} color={colors.textPrimary} />
                </Pressable>
            ),
        });
    }, [navigation, colors.textPrimary]);

    return (
        <View style={styles.container}>
            {/* Header / Month Navigator */}
            <PageChrome>
                <UnifiedDateNavigator
                    dateLabel={`${targetMonth.getFullYear()}年 ${targetMonth.getMonth() + 1}月`}
                    subLabel={`總預算 $${totalBudget.toLocaleString()}`}
                    onPrev={() => handleMonthChange(-1)}
                    onNext={() => handleMonthChange(1)}
                    onCenterPress={() => {
                        setPickerYear(targetMonth.getFullYear());
                        setShowMonthPicker(true);
                    }}
                />
            </PageChrome>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* ══ Unified Summary Card ══ */}
                <View style={styles.summaryCard}>
                    <LinearGradient
                        colors={colors.accentGradientShape as [string, string]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.summaryCardAccent}
                    />
                    {/* Segmented Progress Bar */}
                    <View style={styles.segBarContainer}>
                        <View style={styles.segBarTrack}>
                            {totalBudget > 0 && (
                                <>
                                    {/* Fixed segment (blue-gray) */}
                                    <View style={[styles.segBarFill, {
                                        width: `${Math.min((budgetCalc.totalFixedSpent / totalBudget) * 100, 100)}%`,
                                        backgroundColor: fixedColor,
                                        borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
                                    }]} />
                                    {/* Daily segment (indigo) */}
                                    <View style={[styles.segBarFill, {
                                        width: `${Math.min((budgetCalc.totalDailySpent / totalBudget) * 100, Math.max(0, 100 - (budgetCalc.totalFixedSpent / totalBudget) * 100))}%`,
                                        backgroundColor: dailyColor,
                                    }]} />
                                </>
                            )}
                        </View>
                        {/* Legend chips */}
                        <View style={styles.segLegendRow}>
                            <View style={styles.segLegendItem}>
                                <View style={[styles.segLegendDot, { backgroundColor: fixedColor }]} />
                                <Text style={styles.segLegendText}>固定</Text>
                            </View>
                            <View style={styles.segLegendItem}>
                                <View style={[styles.segLegendDot, { backgroundColor: dailyColor }]} />
                                <Text style={styles.segLegendText}>日常</Text>
                            </View>
                            <View style={styles.segLegendItem}>
                                <View style={[styles.segLegendDot, { backgroundColor: colors.divider }]} />
                                <Text style={styles.segLegendText}>剩餘</Text>
                            </View>
                        </View>
                    </View>

                    {/* Key Metrics Grid */}
                    <View style={styles.metricsGrid}>
                        <View style={styles.metricItem}>
                            <View style={styles.metricLabelRow}>
                                <Ionicons name="pin-outline" size={14} color={fixedColor} />
                                <Text style={styles.metricLabel}>固定支出</Text>
                            </View>
                            <Text style={[styles.metricValue, { color: fixedColor }]}>
                                ${budgetCalc.totalFixedSpent.toLocaleString()}
                            </Text>
                        </View>
                        <View style={styles.metricDividerV} />
                        <View style={styles.metricItem}>
                            <View style={styles.metricLabelRow}>
                                <Ionicons name="wallet-outline" size={14} color={dailyColor} />
                                <Text style={styles.metricLabel}>日常已支出</Text>
                            </View>
                            <Text style={[styles.metricValue, { color: budgetCalc.totalDailySpent > disposableDailyBudget ? colors.red : dailyColor }]}>
                                ${budgetCalc.totalDailySpent.toLocaleString()}
                            </Text>
                        </View>
                        <View style={styles.metricDividerV} />
                        <View style={styles.metricItem}>
                            <View style={styles.metricLabelRow}>
                                <Ionicons name={dailyRemaining >= 0 ? 'sparkles-outline' : 'warning-outline'} size={14} color={dailyRemaining >= 0 ? colors.green : colors.red} />
                                <Text style={styles.metricLabel}>{dailyRemaining >= 0 ? '可用餘額' : '超支'}</Text>
                            </View>
                            <Text style={[styles.metricValue, {
                                color: dailyRemaining >= 0 ? colors.green : colors.red,
                            }]}>
                                ${Math.abs(dailyRemaining).toLocaleString()}
                            </Text>
                        </View>
                    </View>

                </View>

                {/* ════════════════ 固定支出區 ════════════════ */}
                {hasFixedProjects && (
                    <View style={styles.groupSection}>
                        <View style={[styles.groupHeader, { borderLeftColor: fixedColor }]}>
                            <View style={styles.groupTitleRow}>
                                <Ionicons name="pin-outline" size={16} color={fixedColor} />
                                <Text style={styles.groupTitle}>固定支出</Text>
                            </View>
                            <Text style={styles.groupSubtitle}>
                                合計 <Text style={{ color: fixedColor, fontWeight: '800' }}>${budgetCalc.totalFixedSpent.toLocaleString()}</Text>
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
                                <View style={[styles.fixedProjectStrip, { backgroundColor: fixedColor }]} />
                                <View style={styles.fixedProjectContent}>
                                    <Text style={styles.fixedProjectName}>{ps.project || '(無專案)'}</Text>
                                    <Text style={[styles.fixedProjectAmount, { color: fixedColor }]}>
                                        ${ps.spent.toLocaleString()}
                                    </Text>
                                </View>
                            </Pressable>
                        ))}
                    </View>
                )}

                {/* ════════════════ 日常預算區 ════════════════ */}
                <View style={styles.groupSection}>
                    <View style={[styles.groupHeader, { borderLeftColor: colors.green }]}>
                        <View style={styles.groupTitleRow}>
                            <Ionicons name="wallet-outline" size={16} color={colors.green} />
                            <Text style={styles.groupTitle}>日常預算</Text>
                        </View>
                        <Text style={styles.groupSubtitle}>
                            {dailyRemaining >= 0 ? '剩餘 ' : '超支 '}
                            <Text style={{ color: dailyRemaining >= 0 ? colors.green : colors.red, fontWeight: '800' }}>
                                ${Math.abs(dailyRemaining).toLocaleString()}
                            </Text>
                        </Text>
                    </View>

                    {/* Sort Chips (only for daily) */}
                    <View style={styles.sortContainer}>
                        <SortChips
                            options={[
                                { key: 'pct', label: '使用率' },
                                { key: 'spent', label: '已支出' },
                                { key: 'remaining', label: '剩餘' },
                                { key: 'limit', label: '預算額' },
                                { key: 'name', label: '名稱' },
                            ]}
                            activeKey={sortKey.replace(/_(asc|desc)$/, '')}
                            direction={sortKey.endsWith('_asc') ? 'asc' : 'desc'}
                            onChange={(key, direction) => setSortKey(`${key}_${direction}` as BudgetSortKey)}
                        />
                    </View>

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
                    <EmptyState
                        icon="wallet-outline"
                        title="尚無預算設定且無支出"
                        description="點擊右上角 + 新增預算規則"
                    />
                )}

                {/* 財務健檢 (Health Alerts) */}
                <View style={styles.healthSection}>
                    <SectionHeader
                        title="財務健檢"
                        accent={spikes.length > 0 ? colors.red : colors.green}
                        trailing={spikes.length > 0 ? (
                            <Text style={[styles.healthAlertCount, { color: colors.red }]}>
                                {spikes.length} 項異常
                            </Text>
                        ) : undefined}
                    />

                    {spikes.length === 0 ? (
                        <Animated.View entering={FadeInDown.duration(400).springify()}>
                            <HealthCheckCard
                                variant="success"
                                title="本月消費控制良好"
                                description="未發現異常超支的消費分類，請繼續保持！"
                            />
                        </Animated.View>
                    ) : (
                        <View style={styles.healthAlertList}>
                            {spikes.map((spike, idx) => {
                                const isRed = spike.status === 'red';
                                const isNew = spike.status === 'new';
                                const variant = isRed ? 'red' : isNew ? 'new' : 'yellow';
                                const badge = isNew ? '全新類別' : isRed ? '嚴重超支' : '輕微超支';

                                const description = isNew
                                    ? `本月新增支出 $${spike.currentSpent.toLocaleString()}，過去 3 期無此項支出。`
                                    : `本月 $${spike.currentSpent.toLocaleString()}，為歷史平均 $${spike.avgSpent.toLocaleString()} 的 ${Math.round(spike.ratio * 100)}%，超額 $${spike.difference.toLocaleString()}。`;

                                return (
                                    <Animated.View
                                        key={spike.category}
                                        entering={FadeInDown.delay(idx * 80).duration(400).springify()}
                                    >
                                        <HealthCheckCard
                                            variant={variant}
                                            title={spike.category}
                                            description={description}
                                            badge={badge}
                                            onPress={() => {
                                                setDetailModalTitle(`${spike.category} 異常消費明細 (Top 5)`);
                                                setDetailModalData(spike.topTransactions);
                                                setIsDetailModalOpen(true);
                                            }}
                                        />
                                    </Animated.View>
                                );
                            })}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Modals */}
            <BudgetSettingModal
                visible={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveBudget}
                editingId={editingId}
                initialCategory={formCategory}
                initialLimit={formLimit}
                uniqueCategories={uniqueCategories}
                allRawRecords={records}
            />

            <Modal visible={showMonthPicker} transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
                <ModalBackdrop colors={colors} placement="center" isDark={isDark}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMonthPicker(false)} />
                    <View style={styles.monthPickerContent}>
                        <View style={styles.monthPickerHeader}>
                            <Pressable onPress={() => setPickerYear(y => y - 1)} hitSlop={8} accessibilityLabel="上一年">
                                <Ionicons name="chevron-back" size={24} color={colors.accent} />
                            </Pressable>
                            <Text style={styles.monthPickerTitle}>{pickerYear} 年</Text>
                            <Pressable onPress={() => setPickerYear(y => y + 1)} hitSlop={8} accessibilityLabel="下一年">
                                <Ionicons name="chevron-forward" size={24} color={colors.accent} />
                            </Pressable>
                        </View>
                        <View style={styles.monthGrid}>
                            {Array.from({ length: 12 }, (_, i) => (
                                <Pressable
                                    key={i}
                                    style={[
                                        styles.monthCell,
                                        targetMonth.getFullYear() === pickerYear && targetMonth.getMonth() === i && styles.monthCellActive,
                                    ]}
                                    onPress={() => handleSelectMonth(i)}
                                >
                                    <Text style={[
                                        styles.monthCellText,
                                        targetMonth.getFullYear() === pickerYear && targetMonth.getMonth() === i && styles.monthCellTextActive,
                                    ]}>
                                        {i + 1}月
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </ModalBackdrop>
            </Modal>

            <DetailModal
                visible={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title={detailModalTitle}
                records={detailModalData}
            />
        </View>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingVertical: 12, paddingHorizontal: 16, paddingBottom: 40 },

    // ── Unified Summary Card ──
    summaryCard: {
        backgroundColor: colors.card, ...withContinuousRadius(RADIUS.lg), padding: 16,
        borderWidth: 1, borderColor: colors.cardBorder, marginBottom: 6, ...SHADOWS.md,
        overflow: 'hidden',
    },
    summaryCardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
    segBarContainer: { marginBottom: 14 },
    segBarTrack: {
        flexDirection: 'row', height: 10, backgroundColor: colors.divider,
        borderRadius: 5, overflow: 'hidden',
    },
    segBarFill: { height: '100%' },
    segLegendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
    segLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    segLegendDot: { width: 8, height: 8, borderRadius: 4 },
    segLegendText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },

    // ── Metrics Grid ──
    metricsGrid: {
        flexDirection: 'row', alignItems: 'center',
        borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12,
    },
    metricItem: { flex: 1, alignItems: 'center' },
    metricLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, letterSpacing: -0.2 },
    metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
    metricValue: { fontSize: 17, fontWeight: '800', letterSpacing: -0.5 },
    metricDividerV: { width: 1, height: 32, backgroundColor: colors.divider },

    // ── Group Sections ──
    groupSection: { marginTop: 14 },
    groupHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10,
    },
    groupTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.2 },
    groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    groupSubtitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

    // ── Fixed Project Card ──
    fixedProjectCard: {
        flexDirection: 'row', ...withContinuousRadius(RADIUS.md), marginBottom: 8, borderWidth: 1,
        overflow: 'hidden', backgroundColor: colors.card,
        borderColor: colors.textSecondary + '30', ...SHADOWS.sm,
    },
    fixedProjectStrip: { width: 4 },
    fixedProjectContent: {
        flex: 1, paddingVertical: 14, paddingHorizontal: 14,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    fixedProjectName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
    fixedProjectAmount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },

    // ── Sort Chips ──
    sortContainer: { marginHorizontal: -16, marginBottom: 8 },

    listContainer: { },

    // ── Header Add Button ──
    headerAddBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        ...withContinuousRadius(20),
        ...Platform.select({
            android: { elevation: 1 },
            default: {},
        }),
    },
    headerAddBtnPressed: {
        opacity: 0.8,
        transform: [{ scale: 0.96 }],
    },

    // ── Settings Quick Menu ──
    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    menuCard: {
        backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingTop: 12, paddingBottom: 40, paddingHorizontal: 24, ...SHADOWS.lg,
    },
    menuHandle: {
        width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
        alignSelf: 'center', marginBottom: 16,
    },
    menuTitle: {
        fontSize: 18, fontWeight: '700', color: colors.textPrimary,
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
    menuOptionTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 3 },
    menuOptionDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 17 },
    menuDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 4, marginHorizontal: 8 },

    healthSection: { marginTop: 24, marginBottom: 8 },
    healthAlertList: { gap: 10 },
    healthAlertCount: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },

    // Month picker
    monthPickerContent: {
        backgroundColor: colors.card,
        borderRadius: RADIUS.md,
        padding: 20,
        width: '100%',
        maxWidth: 340,
        alignSelf: 'center',
        ...SHADOWS.lg,
    },
    monthPickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    monthPickerTitle: { ...typography.h3 },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    monthCell: {
        width: '30%',
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: RADIUS.sm,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    monthCellActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    monthCellText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
    monthCellTextActive: { color: colors.textWhite, fontWeight: '700' },
});
