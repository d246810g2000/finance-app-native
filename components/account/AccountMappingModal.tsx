import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, SHADOWS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import ModalBackdrop from '../ui/ModalBackdrop';
import SegmentedControl from '../ui/SegmentedControl';
import { useBottomSheetSwipe } from '../ui/useBottomSheetSwipe';
import BottomSheetGestureWrapper from '../ui/BottomSheetGestureWrapper';
import { CustomAccountMappings, CustomAccountMapping } from '../../types';
import { SHARED_ACCOUNTS, ACCOUNT_CATEGORIES } from '../../constants';

interface AccountMappingModalProps {
    visible: boolean;
    onClose: () => void;
    unmappedAccounts: string[];
    onSave: (newMappings: CustomAccountMappings) => void;
    existingMappings: CustomAccountMappings;
}

const CATEGORIES: ('現金' | '銀行' | '信用卡' | '儲值卡' | '證券戶' | '其他')[] = ['現金', '銀行', '信用卡', '儲值卡', '證券戶', '其他'];

export default function AccountMappingModal({ visible, onClose, unmappedAccounts, onSave, existingMappings }: AccountMappingModalProps) {
    const { colors, typography } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const swipe = useBottomSheetSwipe(onClose, visible);
    const [localMappings, setLocalMappings] = useState<CustomAccountMappings>({});

    useEffect(() => {
        if (visible) {
            const initial: CustomAccountMappings = {};
            unmappedAccounts.forEach(acc => {
                if (existingMappings[acc]) {
                    initial[acc] = existingMappings[acc];
                } else {
                    const isShared = SHARED_ACCOUNTS.includes(acc);
                    let category: CustomAccountMapping['category'] = '銀行';
                    for (const cat in ACCOUNT_CATEGORIES) {
                        if (ACCOUNT_CATEGORIES[cat].includes(acc)) {
                            category = cat as any;
                            break;
                        }
                    }
                    initial[acc] = {
                        type: isShared ? 'shared' : 'personal',
                        category,
                    };
                }
            });
            setLocalMappings(initial);
        }
    }, [visible, unmappedAccounts, existingMappings]);

    const handleUpdateMapping = (account: string, field: keyof CustomAccountMapping, value: any) => {
        setLocalMappings(prev => ({
            ...prev,
            [account]: {
                ...prev[account],
                [field]: value,
            },
        }));
    };

    const handleSave = () => {
        onSave({
            ...existingMappings,
            ...localMappings,
        });
        onClose();
    };

    const hasUnmapped = unmappedAccounts.length > 0;

    return (
        <Modal visible={visible} animationType="none" transparent presentationStyle="overFullScreen">
            <ModalBackdrop colors={colors}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.dismissArea} />
                </TouchableWithoutFeedback>

                <BottomSheetGestureWrapper
                    swipe={swipe}
                    style={[styles.modalContent, { paddingBottom: insets.bottom + 8 }]}
                    header={(
                        <>
                            <View style={styles.dragHandle} />

                            <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>
                                {hasUnmapped ? '新增帳戶分類設定' : '帳戶分類設定'}
                            </Text>
                            <Text style={styles.subtitle}>
                                {hasUnmapped ? '偵測到未分類的新帳戶，請為其選擇歸屬' : '目前所有帳戶皆已分類完成'}
                            </Text>
                        </View>
                        <Pressable onPress={hasUnmapped ? handleSave : onClose} style={styles.saveBtn}>
                            <Text style={styles.saveBtnText}>
                                {hasUnmapped ? '確定' : '關閉'}
                            </Text>
                        </Pressable>
                    </View>
                        </>
                    )}
                >
                    {!hasUnmapped ? (
                        <View style={{ flex: 1, paddingVertical: 60, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="checkmark-circle" size={54} color={colors.green} style={{ marginBottom: 16 }} />
                            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800' }}>所有帳戶分類完成</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 }}>
                                目前沒有從 CSV 檔案中偵測到未分類的新帳戶。當您匯入包含新信用卡或銀行帳號的 CSV 時，系統會自動引導您在此處進行分類。
                            </Text>
                        </View>
                    ) : (
                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
                            onScroll={swipe.handleScroll}
                            scrollEventThrottle={swipe.scrollEventThrottle}
                        >
                            {unmappedAccounts.map(account => {
                                const mapping = localMappings[account] || { type: 'personal', category: '銀行' };

                                return (
                                    <View key={account} style={styles.accountCard}>
                                        <View style={styles.cardHeader}>
                                            <Text style={styles.accountName}>{account}</Text>
                                        </View>

                                        {/* Type Selection */}
                                        <View style={styles.selectorRow}>
                                            <Text style={styles.label}>帳戶歸屬</Text>
                                            <SegmentedControl
                                                options={[
                                                    { value: 'personal', label: '個人' },
                                                    { value: 'shared', label: '共用' },
                                                ]}
                                                value={mapping.type}
                                                onChange={(v) => handleUpdateMapping(account, 'type', v)}
                                            />
                                        </View>

                                        {/* Category Selection */}
                                        <View style={styles.categoryContainer}>
                                            <Text style={[styles.label, { marginBottom: 8 }]}>資產類別</Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                                                {CATEGORIES.map(cat => {
                                                    const isActive = mapping.category === cat;
                                                    return (
                                                        <Pressable
                                                            key={cat}
                                                            style={({ pressed }) => [styles.categoryChip, isActive && styles.categoryChipActive, pressed && { opacity: 0.85 }]}
                                                            onPress={() => handleUpdateMapping(account, 'category', cat)}
                                                        >
                                                            <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                                                                {cat}
                                                            </Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    )}
                </BottomSheetGestureWrapper>
            </ModalBackdrop>
        </Modal>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    dismissArea: { flex: 1, width: '100%' },
    modalContent: {
        backgroundColor: colors.bg,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '75%',
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
    },
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
        paddingHorizontal: 18,
        paddingVertical: 8,
        backgroundColor: colors.accent,
        borderRadius: 16,
    },
    saveBtnText: {
        color: colors.textWhite,
        fontWeight: '700',
        fontSize: 14,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    accountCard: {
        backgroundColor: colors.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.divider,
        padding: 16,
        marginBottom: 16,
        ...SHADOWS.sm,
    },
    cardHeader: {
        marginBottom: 12,
    },
    accountName: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    selectorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    buttonGroup: {
        flexDirection: 'row',
        backgroundColor: colors.bg,
        borderRadius: 10,
        padding: 2,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    groupBtn: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 8,
    },
    groupBtnActive: {
        backgroundColor: colors.card,
        ...SHADOWS.sm,
    },
    groupBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textMuted,
    },
    groupBtnTextActive: {
        color: colors.accent,
        fontWeight: '700',
    },
    categoryContainer: {
        marginTop: 4,
    },
    categoryScroll: {
        gap: 8,
    },
    categoryChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    categoryChipActive: {
        backgroundColor: colors.accentLight,
        borderColor: colors.accentBorder,
    },
    categoryChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    categoryChipTextActive: {
        color: colors.accent,
        fontWeight: '700',
    },
});
