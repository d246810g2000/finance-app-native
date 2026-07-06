import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../../theme';
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
        <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
            <BlurView intensity={30} tint="dark" style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <Animated.View entering={FadeInDown.springify()} style={styles.modalContent}>
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

                    {!hasUnmapped ? (
                        <View style={{ flex: 1, paddingVertical: 60, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 54, marginBottom: 16 }}>🎉</Text>
                            <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' }}>所有帳戶分類完成</Text>
                            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 }}>
                                目前沒有從 CSV 檔案中偵測到未分類的新帳戶。當您匯入包含新信用卡或銀行帳號的 CSV 時，系統會自動引導您在此處進行分類。
                            </Text>
                        </View>
                    ) : (
                        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                            {unmappedAccounts.map(account => {
                                const mapping = localMappings[account] || { type: 'personal', category: '銀行' };

                                return (
                                    <View key={account} style={styles.accountCard}>
                                        <View style={styles.cardHeader}>
                                            <Text style={styles.accountName}>💳 {account}</Text>
                                        </View>

                                        {/* Type Selection */}
                                        <View style={styles.selectorRow}>
                                            <Text style={styles.label}>帳戶歸屬</Text>
                                            <View style={styles.buttonGroup}>
                                                <TouchableOpacity
                                                    style={[styles.groupBtn, mapping.type === 'personal' && styles.groupBtnActive]}
                                                    onPress={() => handleUpdateMapping(account, 'type', 'personal')}
                                                >
                                                    <Text style={[styles.groupBtnText, mapping.type === 'personal' && styles.groupBtnTextActive]}>
                                                        個人
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.groupBtn, mapping.type === 'shared' && styles.groupBtnActive]}
                                                    onPress={() => handleUpdateMapping(account, 'type', 'shared')}
                                                >
                                                    <Text style={[styles.groupBtnText, mapping.type === 'shared' && styles.groupBtnTextActive]}>
                                                        共用
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        {/* Category Selection */}
                                        <View style={styles.categoryContainer}>
                                            <Text style={[styles.label, { marginBottom: 8 }]}>資產類別</Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                                                {CATEGORIES.map(cat => {
                                                    const isActive = mapping.category === cat;
                                                    return (
                                                        <TouchableOpacity
                                                            key={cat}
                                                            style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                                                            onPress={() => handleUpdateMapping(account, 'category', cat)}
                                                        >
                                                            <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                                                                {cat}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    )}
                </Animated.View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.bg,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '75%',
        ...SHADOWS.lg,
    },
    dragHandle: {
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.divider,
    },
    title: {
        ...TYPOGRAPHY.h3,
        letterSpacing: -0.3,
        marginBottom: 4,
    },
    subtitle: {
        ...TYPOGRAPHY.caption,
        color: COLORS.textSecondary,
    },
    saveBtn: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        backgroundColor: COLORS.accent,
        borderRadius: 16,
    },
    saveBtnText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 14,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    accountCard: {
        backgroundColor: COLORS.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.divider,
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
        color: COLORS.textPrimary,
    },
    selectorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    buttonGroup: {
        flexDirection: 'row',
        backgroundColor: COLORS.bg,
        borderRadius: 10,
        padding: 2,
        borderWidth: 1,
        borderColor: COLORS.divider,
    },
    groupBtn: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 8,
    },
    groupBtnActive: {
        backgroundColor: COLORS.card,
        ...SHADOWS.sm,
    },
    groupBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.textMuted,
    },
    groupBtnTextActive: {
        color: COLORS.accent,
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
        backgroundColor: COLORS.bg,
        borderWidth: 1,
        borderColor: COLORS.divider,
    },
    categoryChipActive: {
        backgroundColor: COLORS.accentLight,
        borderColor: COLORS.accentBorder,
    },
    categoryChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    categoryChipTextActive: {
        color: COLORS.accent,
        fontWeight: '700',
    },
});
