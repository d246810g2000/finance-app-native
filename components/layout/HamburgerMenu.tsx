import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { RADIUS, SCREEN_EDGE_MIN, SHADOWS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import SettingsModal from '../settings/SettingsModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MENU_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuRowProps {
    icon: IoniconsName;
    label: string;
    subtitle?: string;
    iconColor: string;
    iconBg: string;
    onPress: () => void;
    colors: ReturnType<typeof useAppTheme>['colors'];
    styles: ReturnType<typeof createStyles>;
    showDivider?: boolean;
}

function MenuRow({ icon, label, subtitle, iconColor, iconBg, onPress, colors, styles, showDivider }: MenuRowProps) {
    return (
        <>
            <Pressable
                onPress={onPress}
                android_ripple={{ color: colors.accent + '20' }}
                style={({ pressed }) => [styles.menuItemPressable, pressed && styles.menuItemPressed]}
            >
                <View style={styles.menuItemRow}>
                    <View style={[styles.menuIconCircle, { backgroundColor: iconBg }]}>
                        <Ionicons name={icon} size={20} color={iconColor} />
                    </View>
                    <View style={styles.menuLabelWrap}>
                        <Text style={styles.menuText} numberOfLines={1}>{label}</Text>
                        {subtitle ? (
                            <Text style={styles.menuSubtext} numberOfLines={1}>{subtitle}</Text>
                        ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.menuChevron} />
                </View>
            </Pressable>
            {showDivider ? <View style={styles.itemDivider} /> : null}
        </>
    );
}

interface HamburgerMenuProps {
    visible: boolean;
    onClose: () => void;
}

export default function HamburgerMenu({ visible, onClose }: HamburgerMenuProps) {
    const router = useRouter();
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const { setSearchModalVisible, menuVisible: propVisible, setMenuVisible } = useFinance();

    const actualVisible = visible !== undefined ? visible : propVisible;
    const actualOnClose = onClose || (() => setMenuVisible(false));

    const styles = useMemo(() => createStyles(colors), [colors]);
    const edgeH = Math.max(insets.left, SCREEN_EDGE_MIN);

    const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;
    const [isAnimating, setIsAnimating] = useState(false);
    const [isSettingsVisible, setIsSettingsVisible] = useState(false);

    useEffect(() => {
        if (actualVisible) {
            setIsAnimating(true);
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 280,
                useNativeDriver: true,
            }).start(() => setIsAnimating(false));
        } else {
            setIsAnimating(true);
            Animated.timing(slideAnim, {
                toValue: -MENU_WIDTH,
                duration: 280,
                useNativeDriver: true,
            }).start(() => setIsAnimating(false));
        }
    }, [actualVisible, slideAnim]);

    if (!actualVisible && !isAnimating && !isSettingsVisible) return null;

    const navigateTo = (path: string) => {
        actualOnClose();
        setTimeout(() => router.push(path as any), 280);
    };

    const openSettings = () => {
        actualOnClose();
        setTimeout(() => setIsSettingsVisible(true), 300);
    };

    const openSearch = () => {
        actualOnClose();
        setTimeout(() => setSearchModalVisible(true), 280);
    };

    return (
        <>
            <Modal
                transparent
                visible={actualVisible || isAnimating}
                onRequestClose={actualOnClose}
                animationType="none"
                statusBarTranslucent
            >
                <View style={styles.overlay}>
                    <Pressable
                        style={styles.backdrop}
                        onPress={actualOnClose}
                        accessibilityRole="button"
                        accessibilityLabel="關閉選單"
                    />

                    <Animated.View style={[styles.drawerShell, { transform: [{ translateX: slideAnim }] }]}>
                        <View
                            style={[
                                styles.drawerBody,
                                {
                                    paddingTop: insets.top + 8,
                                    paddingBottom: insets.bottom + 12,
                                    paddingHorizontal: edgeH,
                                },
                            ]}
                        >
                            <View style={styles.header}>
                                <View>
                                    <Text style={styles.headerTitle}>選單</Text>
                                    <Text style={styles.headerSubtitle}>快速導覽與設定</Text>
                                </View>
                                <Pressable
                                    onPress={actualOnClose}
                                    hitSlop={12}
                                    style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                                    accessibilityRole="button"
                                    accessibilityLabel="關閉選單"
                                >
                                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                                </Pressable>
                            </View>

                            <Text style={styles.sectionLabel}>功能</Text>
                            <View style={styles.menuCard}>
                                <Pressable
                                    onPress={openSearch}
                                    android_ripple={{ color: colors.accent + '20' }}
                                    style={({ pressed }) => [styles.menuItemPressable, pressed && styles.menuItemPressed]}
                                >
                                    <View style={styles.menuItemRow}>
                                        <View style={[styles.menuIconCircle, { backgroundColor: colors.accentLight }]}>
                                            <Ionicons name="search" size={20} color={colors.accent} />
                                        </View>
                                        <View style={styles.menuLabelWrap}>
                                            <Text style={styles.menuText}>搜尋記錄</Text>
                                            <Text style={styles.menuSubtext} numberOfLines={1}>
                                                關鍵字、類別、帳戶...
                                            </Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                                    </View>
                                </Pressable>

                                <View style={styles.itemDivider} />

                                <MenuRow
                                    icon="cloud-upload-outline"
                                    label="資料匯入"
                                    subtitle="從 CSV 匯入交易紀錄"
                                    iconColor={colors.accent}
                                    iconBg={colors.accentLight}
                                    onPress={() => navigateTo('/upload')}
                                    colors={colors}
                                    styles={styles}
                                    showDivider
                                />
                                <MenuRow
                                    icon="settings-outline"
                                    label="系統設定"
                                    subtitle="帳戶、預算與外觀主題"
                                    iconColor={colors.green}
                                    iconBg={colors.greenLight}
                                    onPress={openSettings}
                                    colors={colors}
                                    styles={styles}
                                />
                            </View>

                            <View style={styles.footer}>
                                <Text style={styles.footerText}>個人財務管理</Text>
                            </View>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

            <SettingsModal
                visible={isSettingsVisible}
                onClose={() => setIsSettingsVisible(false)}
            />
        </>
    );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
        },
        backdrop: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: colors.blackOverlay,
        },
        drawerShell: {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: MENU_WIDTH,
            elevation: 24,
            shadowColor: '#000',
            shadowOffset: { width: 4, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
        },
        drawerBody: {
            flex: 1,
            width: MENU_WIDTH,
            backgroundColor: colors.bg,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
        },
        headerTitle: {
            fontSize: 24,
            fontWeight: '800',
            color: colors.textPrimary,
            letterSpacing: -0.4,
            includeFontPadding: false,
        },
        headerSubtitle: {
            fontSize: 13,
            color: colors.textMuted,
            marginTop: 4,
            includeFontPadding: false,
        },
        closeBtn: {
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 20,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
        },
        closeBtnPressed: {
            opacity: 0.8,
            transform: [{ scale: 0.96 }],
        },
        sectionLabel: {
            fontSize: 12,
            fontWeight: '800',
            color: colors.textMuted,
            letterSpacing: 0.4,
            marginBottom: 10,
            marginLeft: 2,
            includeFontPadding: false,
        },
        menuCard: {
            backgroundColor: colors.card,
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            overflow: 'hidden',
            ...SHADOWS.sm,
        },
        menuItemPressable: {
            width: '100%',
        },
        menuItemPressed: {
            backgroundColor: colors.accent + '10',
        },
        menuItemRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 14,
            width: '100%',
        },
        menuIconCircle: {
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        },
        menuLabelWrap: {
            flex: 1,
            minWidth: 0,
            marginLeft: 12,
            marginRight: 8,
            justifyContent: 'center',
        },
        menuText: {
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPrimary,
            includeFontPadding: false,
        },
        menuSubtext: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 3,
            lineHeight: 16,
            includeFontPadding: false,
        },
        menuChevron: {
            flexShrink: 0,
        },
        itemDivider: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.divider,
            marginLeft: 66,
        },
        footer: {
            marginTop: 28,
            paddingHorizontal: 2,
        },
        footerText: {
            fontSize: 12,
            color: colors.textMuted,
            includeFontPadding: false,
        },
    });
