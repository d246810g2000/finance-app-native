import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Switch, Alert, TouchableWithoutFeedback } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, SHADOWS, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import ModalBackdrop from '../ui/ModalBackdrop';
import SheetHeader from '../ui/SheetHeader';
import { useBottomSheetSwipe } from '../ui/useBottomSheetSwipe';
import BottomSheetGestureWrapper from '../ui/BottomSheetGestureWrapper';
import { useFinance } from '../../context/FinanceContext';
import NotificationService from '../../services/NotificationService';

import AccountMappingModal from '../account/AccountMappingModal';
import AccountSettingsModal from '../account/AccountSettingsModal';

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingsRowProps {
    icon: IoniconsName;
    iconColor: string;
    iconBg: string;
    title: string;
    subtitle: string;
    onPress?: () => void;
    trailing?: React.ReactNode;
    colors: AppColors;
    styles: ReturnType<typeof createStyles>;
}

/** Android：橫向排版放在內層 View，避免 Pressable 上 flex 失效 */
function SettingsRow({ icon, iconColor, iconBg, title, subtitle, onPress, trailing, colors, styles }: SettingsRowProps) {
    const content = (
        <View style={styles.itemRow}>
            <View style={[styles.iconBg, { backgroundColor: iconBg }]}>
                <Ionicons name={icon} size={20} color={iconColor} />
            </View>
            <View style={styles.itemTextCol}>
                <Text style={[styles.itemText, { color: colors.textPrimary }]}>{title}</Text>
                <Text style={styles.itemSubtext}>{subtitle}</Text>
            </View>
            {trailing ?? (
                onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.itemTrailing} /> : null
            )}
        </View>
    );

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                android_ripple={{ color: colors.accent + '18' }}
                style={({ pressed }) => [pressed && { backgroundColor: colors.bg }]}
            >
                {content}
            </Pressable>
        );
    }
    return content;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
    const { colors, theme, setTheme, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const swipe = useBottomSheetSwipe(onClose, visible);
    const {
        records,
        customMappings,
        saveCustomMappings,
        excludedAccounts,
        saveExcludedAccounts,
    } = useFinance();

    const [isMappingVisible, setIsMappingVisible] = useState(false);
    const [isVisibilityVisible, setIsVisibilityVisible] = useState(false);
    const [notificationEnabled, setNotificationEnabled] = useState(false);

    useEffect(() => {
        if (visible) {
            NotificationService.isEnabled().then(setNotificationEnabled);
        }
    }, [visible]);

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

    const toggleNotification = async () => {
        if (!NotificationService.isSupported()) {
            Alert.alert(
                '不支援的環境',
                '由於您目前正在使用 Expo Go，無法執行原生常駐通知的模組 (@notifee/react-native)。\n\n欲測試此功能，請編譯原生的 Android 應用程式 (使用指令 npx expo run:android)。',
                [{ text: '了解' }],
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
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            presentationStyle="overFullScreen"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <ModalBackdrop colors={colors} isDark={isDark}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.dismissArea} />
                </TouchableWithoutFeedback>

                {/* 與 DetailModal 相同：固定 height 90% + ScrollView flex:1；支援下滑關閉 */}
                <BottomSheetGestureWrapper
                    swipe={swipe}
                    style={[styles.container, { paddingBottom: insets.bottom + 8 }]}
                    header={(
                        <>
                            <View style={styles.handleBar} />
                            <SheetHeader title="系統設定" onClose={onClose} style={styles.headerOverride} />
                        </>
                    )}
                >

                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        onScroll={swipe.handleScroll}
                        scrollEventThrottle={swipe.scrollEventThrottle}
                    >
                        {/* 1. 帳戶與資產設定 */}
                        <View style={styles.settingsSection}>
                            <View style={styles.sectionTitleRow}>
                                <Ionicons name="card-outline" size={16} color={colors.accent} style={styles.sectionIcon} />
                                <Text style={styles.sectionTitle}>帳戶與資產設定</Text>
                            </View>
                            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                                <SettingsRow
                                    icon="git-branch-outline"
                                    iconColor={colors.accent}
                                    iconBg={colors.accent + '15'}
                                    title="帳戶分類對照設定"
                                    subtitle="自訂 CSV 帳戶的「個人/共用」歸屬與類別"
                                    onPress={() => setIsMappingVisible(true)}
                                    colors={colors}
                                    styles={styles}
                                />
                                <View style={[styles.divider, { backgroundColor: colors.divider }]} />
                                <SettingsRow
                                    icon="eye-off-outline"
                                    iconColor={colors.green}
                                    iconBg={colors.green + '15'}
                                    title="帳戶顯示隱私設定"
                                    subtitle="設定要隱藏或排除不列入統計的帳戶"
                                    onPress={() => setIsVisibilityVisible(true)}
                                    colors={colors}
                                    styles={styles}
                                />
                            </View>
                        </View>

                        {/* 2. 系統與喜好 */}
                        <View style={styles.settingsSection}>
                            <View style={styles.sectionTitleRow}>
                                <Ionicons name="settings-outline" size={16} color={colors.textPrimary} style={styles.sectionIcon} />
                                <Text style={styles.sectionTitle}>系統與喜好設定</Text>
                            </View>
                            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                                <SettingsRow
                                    icon="notifications-outline"
                                    iconColor={colors.accent}
                                    iconBg={colors.accent + '15'}
                                    title="預算常駐通知"
                                    subtitle="在解鎖手機時於通知列常駐顯示本月可用餘額"
                                    colors={colors}
                                    styles={styles}
                                    trailing={(
                                        <Switch
                                            value={notificationEnabled}
                                            onValueChange={toggleNotification}
                                            trackColor={{ false: colors.border, true: colors.accent }}
                                            thumbColor={colors.card}
                                        />
                                    )}
                                />
                                <View style={[styles.divider, { backgroundColor: colors.divider }]} />
                                <SettingsRow
                                    icon={theme === 'dark' ? 'moon' : theme === 'light' ? 'sunny' : 'contrast'}
                                    iconColor={colors.textPrimary}
                                    iconBg={colors.divider}
                                    title="外觀主題"
                                    subtitle={`目前設定：${theme === 'dark' ? '深色' : theme === 'light' ? '淺色' : '跟隨系統'}`}
                                    onPress={handleThemeChange}
                                    colors={colors}
                                    styles={styles}
                                />
                            </View>
                        </View>
                    </ScrollView>
                </BottomSheetGestureWrapper>
            </ModalBackdrop>

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
        </Modal>
    );
}

const createStyles = (colors: AppColors) =>
    StyleSheet.create({
        dismissArea: { flex: 1, width: '100%' },
        container: {
            width: '100%',
            height: '90%',
            backgroundColor: colors.bg,
            borderTopLeftRadius: RADIUS.xl,
            borderTopRightRadius: RADIUS.xl,
            elevation: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.12,
            shadowRadius: 16,
        },
        handleBar: {
            width: 40,
            height: 5,
            backgroundColor: colors.border,
            borderRadius: 3,
            alignSelf: 'center',
            marginTop: 10,
            marginBottom: 4,
        },
        headerOverride: {
            backgroundColor: 'transparent',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.divider,
        },
        scroll: {
            flex: 1,
        },
        scrollContent: {
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 24,
        },
        settingsSection: {
            marginBottom: 16,
        },
        sectionTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 8,
            marginLeft: 4,
        },
        sectionIcon: {
            marginRight: 8,
        },
        sectionTitle: {
            fontSize: 12,
            fontWeight: '800',
            color: colors.textMuted,
            letterSpacing: 0.4,
            includeFontPadding: false,
        },
        card: {
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            overflow: 'hidden',
            ...SHADOWS.sm,
        },
        itemRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 14,
            width: '100%',
        },
        itemTextCol: {
            flex: 1,
            minWidth: 0,
            marginRight: 8,
        },
        iconBg: {
            width: 40,
            height: 40,
            borderRadius: 12,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
            flexShrink: 0,
        },
        itemText: {
            fontSize: 15,
            fontWeight: '700',
            includeFontPadding: false,
        },
        itemSubtext: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 3,
            lineHeight: 17,
            includeFontPadding: false,
        },
        itemTrailing: {
            flexShrink: 0,
        },
        divider: {
            height: StyleSheet.hairlineWidth,
            marginLeft: 66,
        },
    });
