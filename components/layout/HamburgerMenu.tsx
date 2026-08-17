import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated, Dimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { RADIUS, SCREEN_EDGE_MIN, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { useFinanceUI } from '../../context/FinanceUIContext';
import SettingsModal from '../settings/SettingsModal';
import CreditCardManagementModal from '../reconciliation/CreditCardManagementModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MENU_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuRowProps {
    icon: IoniconsName;
    label: string;
    subtitle?: string;
    iconColor: ColorValue;
    iconBg: ColorValue;
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
                android_ripple={{ color: colors.statePressed }}
                style={({ pressed }) => [styles.menuItemPressable, pressed && styles.menuItemPressed]}
                accessibilityRole="button"
                accessibilityLabel={label}
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
                    <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceVariant} style={styles.menuChevron} />
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
    const { setSearchModalVisible, menuVisible: propVisible, setMenuVisible } = useFinanceUI();

    const actualVisible = visible !== undefined ? visible : propVisible;
    const actualOnClose = onClose || (() => setMenuVisible(false));

    const styles = useMemo(() => createStyles(colors), [colors]);
    const edgeH = Math.max(insets.left, SCREEN_EDGE_MIN);

    const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const shouldOpenSettingsAfterClose = useRef(false);
    const shouldOpenCreditCardsAfterClose = useRef(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [isSettingsVisible, setIsSettingsVisible] = useState(false);
    const [isCreditCardSettingsVisible, setIsCreditCardSettingsVisible] = useState(false);

    useEffect(() => {
        if (actualVisible) {
            setIsAnimating(true);
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 220,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 220,
                    useNativeDriver: true,
                }),
            ]).start(() => setIsAnimating(false));
        } else {
            setIsAnimating(true);
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: -MENU_WIDTH,
                    duration: 180,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setIsAnimating(false);
                if (shouldOpenSettingsAfterClose.current) {
                    shouldOpenSettingsAfterClose.current = false;
                    setIsSettingsVisible(true);
                } else if (shouldOpenCreditCardsAfterClose.current) {
                    shouldOpenCreditCardsAfterClose.current = false;
                    setIsCreditCardSettingsVisible(true);
                }
            });
        }
    }, [actualVisible, slideAnim, fadeAnim]);

    if (!actualVisible && !isAnimating && !isSettingsVisible && !isCreditCardSettingsVisible) return null;

    const navigateTo = (path: string) => {
        actualOnClose();
        requestAnimationFrame(() => {
            router.push(path as any);
        });
    };

    const openSettings = () => {
        // A native Modal cannot reliably present another Modal while its close
        // animation is still running. Wait for the drawer animation callback.
        shouldOpenSettingsAfterClose.current = true;
        actualOnClose();
    };

    const openCreditCardSettings = () => {
        shouldOpenCreditCardsAfterClose.current = true;
        actualOnClose();
    };

    const openSearch = () => {
        actualOnClose();
        requestAnimationFrame(() => {
            setSearchModalVisible(true);
        });
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
                    <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={actualOnClose}
                            accessibilityRole="button"
                            accessibilityLabel="關閉選單"
                        />
                    </Animated.View>

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
                                    android_ripple={{ color: colors.statePressed }}
                                    style={({ pressed }) => [styles.menuItemPressable, pressed && styles.menuItemPressed]}
                                    accessibilityRole="button"
                                    accessibilityLabel="搜尋記錄"
                                >
                                    <View style={styles.menuItemRow}>
                                        <View style={[styles.menuIconCircle, { backgroundColor: colors.primaryContainer }]}>
                                            <Ionicons name="search" size={20} color={colors.primary} />
                                        </View>
                                        <View style={styles.menuLabelWrap}>
                                            <Text style={styles.menuText}>搜尋記錄</Text>
                                            <Text style={styles.menuSubtext} numberOfLines={1}>
                                                關鍵字、類別、帳戶...
                                            </Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceVariant} />
                                    </View>
                                </Pressable>

                                <View style={styles.itemDivider} />

                                <MenuRow
                                    icon="cloud-upload-outline"
                                    label="資料匯入"
                                    subtitle="從 CSV 匯入交易紀錄"
                                    iconColor={colors.primary}
                                    iconBg={colors.primaryContainer}
                                    onPress={() => navigateTo('/upload')}
                                    colors={colors}
                                    styles={styles}
                                    showDivider
                                />
                                <MenuRow
                                    icon="storefront-outline"
                                    label="商家分析"
                                    subtitle="商家排行與發票品項"
                                    iconColor={colors.primary}
                                    iconBg={colors.primaryContainer}
                                    onPress={() => navigateTo('/merchant')}
                                    colors={colors}
                                    styles={styles}
                                    showDivider
                                />
                                <MenuRow
                                    icon="heart-outline"
                                    label="財務健檢"
                                    subtitle="健康分數、現金流與規則提醒"
                                    iconColor={colors.red}
                                    iconBg={colors.redLight}
                                    onPress={() => navigateTo('/health')}
                                    colors={colors}
                                    styles={styles}
                                    showDivider
                                />
                                <MenuRow
                                    icon="layers-outline"
                                    label="信用卡對帳設定"
                                    subtitle="結帳日、帳單群組，並可由此開始對帳"
                                    iconColor={colors.primary}
                                    iconBg={colors.primaryContainer}
                                    onPress={openCreditCardSettings}
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
            <CreditCardManagementModal
                visible={isCreditCardSettingsVisible}
                onClose={() => setIsCreditCardSettingsVisible(false)}
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
            backgroundColor: colors.scrim,
        },
        drawerShell: {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: MENU_WIDTH,
            elevation: 8,
        },
        drawerBody: {
            flex: 1,
            width: MENU_WIDTH,
            backgroundColor: colors.surface,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
            gap: 12,
        },
        headerTitle: {
            fontSize: 24,
            fontWeight: '800',
            color: colors.onSurface,
            letterSpacing: -0.4,
            includeFontPadding: false,
        },
        headerSubtitle: {
            fontSize: 13,
            color: colors.onSurfaceVariant,
            marginTop: 4,
            includeFontPadding: false,
        },
        closeBtn: {
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            ...withContinuousRadius(RADIUS.full),
            backgroundColor: colors.surfaceVariant,
        },
        closeBtnPressed: {
            opacity: 0.85,
        },
        sectionLabel: {
            fontSize: 12,
            fontWeight: '800',
            color: colors.onSurfaceVariant,
            letterSpacing: 0.4,
            marginBottom: 10,
            marginLeft: 2,
            includeFontPadding: false,
        },
        menuCard: {
            backgroundColor: colors.surfaceContainer,
            borderRadius: RADIUS.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.outlineVariant,
            overflow: 'hidden',
        },
        menuItemPressable: {
            width: '100%',
            minHeight: 56,
        },
        menuItemPressed: {
            backgroundColor: colors.surfaceVariant,
        },
        menuItemRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 14,
            width: '100%',
            minHeight: 56,
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
            gap: 2,
        },
        menuText: {
            fontSize: 15,
            fontWeight: '700',
            color: colors.onSurface,
            includeFontPadding: false,
        },
        menuSubtext: {
            fontSize: 12,
            color: colors.onSurfaceVariant,
            lineHeight: 16,
            includeFontPadding: false,
        },
        menuChevron: {
            flexShrink: 0,
        },
        itemDivider: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.outlineVariant,
            marginLeft: 66,
        },
        footer: {
            marginTop: 28,
            paddingHorizontal: 2,
        },
        footerText: {
            fontSize: 12,
            color: colors.onSurfaceVariant,
            includeFontPadding: false,
        },
    });
