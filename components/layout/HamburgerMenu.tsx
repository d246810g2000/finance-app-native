import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SHADOWS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import NotificationService from '../../services/NotificationService';
import { useFinance, SearchFilters } from '../../context/FinanceContext';

const { width } = Dimensions.get('window');
const MENU_WIDTH = width * 0.75;

interface HamburgerMenuProps {
    visible: boolean;
    onClose: () => void;
}

export default function HamburgerMenu({ visible, onClose }: HamburgerMenuProps) {
    const router = useRouter();
    const { colors, typography, theme, setTheme } = useAppTheme();
    const { records, globalExcludeTravel, setGlobalExcludeTravel, setSearchFilters, searchModalVisible, setSearchModalVisible, menuVisible: propVisible, setMenuVisible } = useFinance();

    // Resolve which visibility to use
    const actualVisible = visible !== undefined ? visible : propVisible;
    const actualOnClose = onClose || (() => setMenuVisible(false));

    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;
    const [isAnimating, setIsAnimating] = useState(false);
    const [notificationEnabled, setNotificationEnabled] = useState(false);

    useEffect(() => {
        NotificationService.isEnabled().then(setNotificationEnabled);
    }, []);



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

    useEffect(() => {
        if (actualVisible) {
            setIsAnimating(true);
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start(() => setIsAnimating(false));
        } else {
            setIsAnimating(true);
            Animated.timing(slideAnim, {
                toValue: -MENU_WIDTH,
                duration: 300,
                useNativeDriver: true,
            }).start(() => setIsAnimating(false));
        }
    }, [actualVisible]);

    if (!actualVisible && !isAnimating) return null;

    const navigateTo = (path: string) => {
        onClose();
        setTimeout(() => {
            router.push(path as any);
        }, 300);
    };

    const toggleTheme = () => {
        if (theme === 'light') setTheme('dark');
        else if (theme === 'dark') setTheme('system');
        else setTheme('light');
    };

    const handleApplySearch = (filters: SearchFilters) => {
        setSearchFilters(filters);
        navigateTo('/records');
    };

    return (
        <Modal transparent visible={actualVisible || isAnimating} onRequestClose={actualOnClose} animationType="none">
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={actualOnClose} />
                <Animated.View style={[styles.menuContainer, { transform: [{ translateX: slideAnim }] }]}>
                    <View style={styles.header}>
                        <Text style={typography.h2}>設定選單</Text>
                        <TouchableOpacity onPress={actualOnClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={28} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.content}>
                        <TouchableOpacity style={styles.searchItem} onPress={() => {
                            // 立即開啟搜尋視窗並關閉選單，達成無縫銜接
                            setMenuVisible(false);
                            setSearchModalVisible(true);
                        }}>
                            <View style={styles.searchIconContainer}>
                                <Ionicons name="search" size={20} color={colors.textSecondary} />
                            </View>
                            <Text style={styles.searchText}>搜尋關鍵字、類別...</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/upload')}>
                            <View style={styles.iconContainer}>
                                <Ionicons name="cloud-upload-outline" size={24} color={colors.textPrimary} />
                            </View>
                            <Text style={styles.menuText}>資料匯入</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <TouchableOpacity style={styles.menuItem} onPress={toggleTheme}>
                            <View style={styles.iconContainer}>
                                <Ionicons name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sunny' : 'contrast'} size={24} color={colors.textPrimary} />
                            </View>
                            <Text style={styles.menuText}>
                                主題：{theme === 'dark' ? '深色' : theme === 'light' ? '淺色' : '跟隨系統'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={toggleNotification}>
                            <View style={styles.iconContainer}>
                                <Ionicons name={notificationEnabled ? "notifications" : "notifications-outline"} size={24} color={notificationEnabled ? colors.accent : colors.textPrimary} />
                            </View>
                            <Text style={[styles.menuText, { flex: 1 }]}>預算常駐通知</Text>
                            <View style={[styles.switchContainer, notificationEnabled && styles.switchEnabled]}>
                                <View style={[styles.switchKnob, notificationEnabled && styles.switchKnobEnabled]} />
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={() => setGlobalExcludeTravel(!globalExcludeTravel)}>
                            <View style={styles.iconContainer}>
                                <Ionicons name={globalExcludeTravel ? "airplane" : "airplane-outline"} size={24} color={globalExcludeTravel ? colors.accent : colors.textPrimary} />
                            </View>
                            <Text style={[styles.menuText, { flex: 1 }]}>排除旅遊專案</Text>
                            <View style={[styles.switchContainer, globalExcludeTravel && styles.switchEnabled]}>
                                <View style={[styles.switchKnob, globalExcludeTravel && styles.switchKnobEnabled]} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const createStyles = (colors: any, typography: any) => StyleSheet.create({
    overlay: {
        flex: 1,
        flexDirection: 'row',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.blackOverlay,
    },
    menuContainer: {
        width: MENU_WIDTH,
        height: '100%',
        backgroundColor: colors.card,
        ...SHADOWS.lg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 24,
        paddingBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    content: {
        flex: 1,
        paddingTop: 8,
    },
    searchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 16,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    searchIconContainer: {
        marginRight: 8,
    },
    searchText: {
        ...typography.bodySm,
        color: colors.textMuted,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
    },
    iconContainer: {
        width: 32,
        alignItems: 'center',
    },
    menuText: {
        ...typography.subtitle,
        marginLeft: 16,
    },
    switchContainer: {
        width: 44,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.border,
        justifyContent: 'center',
        padding: 2,
    },
    switchEnabled: {
        backgroundColor: colors.green,
    },
    switchKnob: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.card,
        ...SHADOWS.sm,
    },
    switchKnobEnabled: {
        transform: [{ translateX: 20 }],
    },
    divider: {
        height: 1,
        backgroundColor: colors.divider,
        marginVertical: 16,
        marginHorizontal: 24,
    }
});
