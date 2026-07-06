import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import NotificationService from '../../services/NotificationService';

// 子 Modal 引入
import AccountMappingModal from '../account/AccountMappingModal';
import AccountSettingsModal from '../account/AccountSettingsModal';
import BudgetSettingsModal from '../budget/BudgetSettingsModal';
import BatchBudgetModal from '../budget/BatchBudgetModal';

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
    const { colors, typography, theme, setTheme } = useAppTheme();
    const { 
        records, 
        customMappings, 
        saveCustomMappings, 
        globalExcludeTravel, 
        setGlobalExcludeTravel,
        excludedAccounts,
        saveExcludedAccounts,
        budgetConfig,
        saveBudgetConfig,
        budgets,
        saveBudgets
    } = useFinance();

    // ─── 子 Modal 顯示狀態 ───
    const [isMappingVisible, setIsMappingVisible] = useState(false);
    const [isVisibilityVisible, setIsVisibilityVisible] = useState(false);
    const [isBudgetConfigVisible, setIsBudgetConfigVisible] = useState(false);
    const [isBatchEditVisible, setIsBatchEditVisible] = useState(false);

    // ─── 通知設定狀態 ───
    const [notificationEnabled, setNotificationEnabled] = useState(false);

    // 載入通知狀態
    useEffect(() => {
        if (visible) {
            NotificationService.isEnabled().then(setNotificationEnabled);
        }
    }, [visible]);

    // 計算所有帳戶 (含已分類及交易中出現的)
    const allAccountsForMapping = React.useMemo(() => {
        const set = new Set<string>();
        Object.keys(customMappings).forEach(acc => set.add(acc));
        records.forEach(r => {
            if (r['收款(轉入)']) set.add(r['收款(轉入)'].trim());
            if (r['付款(轉出)']) set.add(r['付款(轉出)'].trim());
        });
        set.delete('代付');
        set.delete('轉帳');
        set.delete('');
        return Array.from(set).sort();
    }, [customMappings, records]);

    const uniqueCategories = React.useMemo(() => {
        const cats = new Set<string>();
        records.forEach(r => {
            if (r['付款(轉出)'] && !r['收款(轉入)'] && r['分類'] && r['分類'] !== 'SYSTEM' && r['分類'] !== '代付') {
                cats.add(r['分類']);
            }
        });
        return Array.from(cats).sort();
    }, [records]);

    const toggleNotification = async () => {
        if (!NotificationService.isSupported()) {
            Alert.alert(
                "不支援的環境",
                "由於您目前正在使用 Expo Go，無法執行原生常駐通知的模組 (@notifee/react-native)。\n\n欲測試此功能，請編譯原生的 Android 應用程式 (使用指令 npx expo run:android)。",
                [{ text: "了解" }]
            );
            return;
        }

        const newValue = !notificationEnabled;
        if (newValue) {
            const hasPermission = await NotificationService.requestPermissions();
            if (!hasPermission) return;
        }
        await NotificationService.setEnabled(newValue);
        setNotificationEnabled(newValue);
        if (newValue) {
            NotificationService.syncWithRecords(records);
        }
    };

    const handleThemeChange = () => {
        if (theme === 'light') setTheme('dark');
        else if (theme === 'dark') setTheme('system');
        else setTheme('light');
    };

    return (
        <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
            <BlurView intensity={25} tint="dark" style={styles.blurOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                
                <Animated.View entering={FadeInDown.springify()} style={[styles.container, { backgroundColor: colors.bg }]}>
                    <View style={styles.handleBar} />
                    
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.divider }]}>
                        <Text style={[typography.h3, { color: colors.textPrimary }]}>系統設定</Text>
                        <Pressable onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>關閉</Text>
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {/* 1. 帳戶與資產設定 */}
                        <Text style={styles.sectionTitle}>💳 帳戶與資產設定</Text>
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                            <TouchableOpacity style={styles.itemRow} onPress={() => setIsMappingVisible(true)}>
                                <View style={styles.itemLeft}>
                                    <View style={[styles.iconBg, { backgroundColor: COLORS.accent + '15' }]}>
                                        <Ionicons name="git-branch-outline" size={20} color={COLORS.accent} />
                                    </View>
                                    <View>
                                        <Text style={[styles.itemText, { color: colors.textPrimary }]}>帳戶分類對照設定</Text>
                                        <Text style={styles.itemSubtext}>自訂 CSV 帳戶的「個人/共用」歸屬與類別</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                            </TouchableOpacity>

                            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

                            <TouchableOpacity style={styles.itemRow} onPress={() => setIsVisibilityVisible(true)}>
                                <View style={styles.itemLeft}>
                                    <View style={[styles.iconBg, { backgroundColor: COLORS.green + '15' }]}>
                                        <Ionicons name="eye-off-outline" size={20} color={COLORS.green} />
                                    </View>
                                    <View>
                                        <Text style={[styles.itemText, { color: colors.textPrimary }]}>帳戶顯示隱私設定</Text>
                                        <Text style={styles.itemSubtext}>設定要隱藏或排除不列入統計的帳戶</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {/* 2. 預算與專案設定 */}
                        <Text style={styles.sectionTitle}>📊 預算與專案設定</Text>
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                            <TouchableOpacity style={styles.itemRow} onPress={() => setIsBudgetConfigVisible(true)}>
                                <View style={styles.itemLeft}>
                                    <View style={[styles.iconBg, { backgroundColor: COLORS.yellow + '15' }]}>
                                        <Ionicons name="options-outline" size={20} color={COLORS.yellow} />
                                    </View>
                                    <View>
                                        <Text style={[styles.itemText, { color: colors.textPrimary }]}>預算專案全局設定</Text>
                                        <Text style={styles.itemSubtext}>自訂預算納入的專案、拆分比或固定支出</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                            </TouchableOpacity>

                            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

                            <TouchableOpacity style={styles.itemRow} onPress={() => setIsBatchEditVisible(true)}>
                                <View style={styles.itemLeft}>
                                    <View style={[styles.iconBg, { backgroundColor: COLORS.blue + '15' }]}>
                                        <Ionicons name="grid-outline" size={20} color={COLORS.blue} />
                                    </View>
                                    <View>
                                        <Text style={[styles.itemText, { color: colors.textPrimary }]}>批次編輯預算額</Text>
                                        <Text style={styles.itemSubtext}>一次性自訂設定所有消費類別的月預算限制</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                            </TouchableOpacity>

                            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

                            <View style={styles.itemRow}>
                                <View style={styles.itemLeft}>
                                    <View style={[styles.iconBg, { backgroundColor: COLORS.blue + '15' }]}>
                                        <Ionicons name="airplane-outline" size={20} color={COLORS.blue} />
                                    </View>
                                    <View>
                                        <Text style={[styles.itemText, { color: colors.textPrimary }]}>排除旅遊專案</Text>
                                        <Text style={styles.itemSubtext}>在統計與預算中自動剔除旅遊專案支出</Text>
                                    </View>
                                </View>
                                <Switch 
                                    value={globalExcludeTravel} 
                                    onValueChange={setGlobalExcludeTravel}
                                    trackColor={{ false: colors.border, true: COLORS.accent }}
                                    thumbColor={colors.card}
                                />
                            </View>
                        </View>

                        {/* 3. 系統通知與喜好 */}
                        <Text style={styles.sectionTitle}>⚙️ 系統與喜好設定</Text>
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                            <View style={styles.itemRow}>
                                <View style={styles.itemLeft}>
                                    <View style={[styles.iconBg, { backgroundColor: COLORS.accent + '15' }]}>
                                        <Ionicons name="notifications-outline" size={20} color={COLORS.accent} />
                                    </View>
                                    <View>
                                        <Text style={[styles.itemText, { color: colors.textPrimary }]}>預算常駐通知</Text>
                                        <Text style={styles.itemSubtext}>在解鎖手機時於通知列常駐顯示本月可用餘額</Text>
                                    </View>
                                </View>
                                <Switch 
                                    value={notificationEnabled} 
                                    onValueChange={toggleNotification}
                                    trackColor={{ false: colors.border, true: COLORS.accent }}
                                    thumbColor={colors.card}
                                />
                            </View>

                            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

                            <TouchableOpacity style={styles.itemRow} onPress={handleThemeChange}>
                                <View style={styles.itemLeft}>
                                    <View style={[styles.iconBg, { backgroundColor: colors.divider }]}>
                                        <Ionicons name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sunny' : 'contrast'} size={20} color={colors.textPrimary} />
                                    </View>
                                    <View>
                                        <Text style={[styles.itemText, { color: colors.textPrimary }]}>外觀主題</Text>
                                        <Text style={styles.itemSubtext}>
                                            目前設定：{theme === 'dark' ? '深色' : theme === 'light' ? '淺色' : '跟隨系統'}
                                        </Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </Animated.View>
            </BlurView>

            {/* ─── 子設定 Modals 堆疊 ─── */}
            <AccountMappingModal
                visible={isMappingVisible}
                onClose={() => setIsMappingVisible(false)}
                unmappedAccounts={allAccountsForMapping}
                onSave={saveCustomMappings}
                existingMappings={customMappings}
            />

            <AccountSettingsModal
                visible={isVisibilityVisible}
                onClose={() => setIsVisibilityVisible(false)}
                excludedAccounts={excludedAccounts}
                onSave={saveExcludedAccounts}
            />

            <BudgetSettingsModal
                isOpen={isBudgetConfigVisible}
                onClose={() => setIsBudgetConfigVisible(false)}
                config={budgetConfig}
                onSave={saveBudgetConfig}
                allRawRecords={records}
            />

            <BatchBudgetModal
                isOpen={isBatchEditVisible}
                onClose={() => setIsBatchEditVisible(false)}
                currentBudgets={budgets}
                onSave={saveBudgets}
                uniqueCategories={uniqueCategories}
                allRawRecords={records}
                config={budgetConfig}
            />
        </Modal>
    );
}

const styles = StyleSheet.create({
    blurOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    container: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
        paddingBottom: 40,
        ...SHADOWS.lg,
    },
    handleBar: {
        width: 40,
        height: 5,
        backgroundColor: COLORS.border,
        borderRadius: 3,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    closeBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: COLORS.accentLight,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.accentBorder,
    },
    closeBtnText: {
        color: COLORS.accent,
        fontWeight: '700',
        fontSize: 13,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 60,
    },
    sectionTitle: {
        ...TYPOGRAPHY.caption,
        fontSize: 12,
        fontWeight: '800',
        marginTop: 20,
        marginBottom: 8,
        marginLeft: 4,
    },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
        ...SHADOWS.sm,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    itemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 16,
    },
    iconBg: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    itemText: {
        fontSize: 15,
        fontWeight: '700',
    },
    itemSubtext: {
        fontSize: 12,
        color: COLORS.textMuted,
        marginTop: 4,
    },
    divider: {
        height: 1,
        marginHorizontal: 16,
    },
});
