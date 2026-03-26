import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../../theme';
import { ACCOUNT_CATEGORIES } from '../../constants';

interface AccountSettingsModalProps {
    visible: boolean;
    onClose: () => void;
    excludedAccounts: string[];
    onSave: (newExcludedAccounts: string[]) => void;
}

export default function AccountSettingsModal({ visible, onClose, excludedAccounts, onSave }: AccountSettingsModalProps) {
    const [localExcluded, setLocalExcluded] = useState<Set<string>>(new Set(excludedAccounts));

    // Reset local state when modal opens
    React.useEffect(() => {
        if (visible) {
            setLocalExcluded(new Set(excludedAccounts));
        }
    }, [visible, excludedAccounts]);

    const toggleAccount = (accountName: string) => {
        setLocalExcluded(prev => {
            const next = new Set(prev);
            if (next.has(accountName)) {
                next.delete(accountName);
            } else {
                next.add(accountName);
            }
            return next;
        });
    };

    const handleSave = () => {
        onSave(Array.from(localExcluded));
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
            <BlurView intensity={30} tint="dark" style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <Animated.View entering={FadeInDown.springify()} style={styles.modalContent}>
                    <View style={styles.dragHandle} />

                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>帳戶顯示設定</Text>
                            <Text style={styles.subtitle}>被排除的帳戶將不會計入總資產、收入與支出</Text>
                        </View>
                        <Pressable onPress={handleSave} style={styles.saveBtn}>
                            <Text style={styles.saveBtnText}>儲存</Text>
                        </Pressable>
                    </View>

                    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                        {Object.entries(ACCOUNT_CATEGORIES).map(([category, accounts]) => {
                            if (accounts.length === 0) return null;

                            return (
                                <View key={category} style={styles.categoryBlock}>
                                    <Text style={styles.categoryTitle}>{category}</Text>
                                    <View style={styles.accountList}>
                                        {accounts.map((account, index) => {
                                            const isExcluded = localExcluded.has(account);
                                            const isLast = index === accounts.length - 1;

                                            return (
                                                <View key={account} style={[styles.accountRow, !isLast && styles.borderBottom]}>
                                                    <Text style={[styles.accountName, isExcluded && styles.accountNameExcluded]}>
                                                        {account}
                                                    </Text>
                                                    <Switch
                                                        value={!isExcluded}
                                                        onValueChange={() => toggleAccount(account)}
                                                        trackColor={{ false: COLORS.border, true: COLORS.green }}
                                                        thumbColor="#fff"
                                                        ios_backgroundColor={COLORS.border}
                                                    />
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            );
                        })}
                    </ScrollView>
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
        height: '85%',
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
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: COLORS.accentLight,
        borderRadius: 16,
    },
    saveBtnText: {
        color: COLORS.accent,
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
    categoryBlock: {
        marginBottom: 24,
    },
    categoryTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.textMuted,
        marginBottom: 8,
        marginLeft: 8,
    },
    accountList: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.divider,
        overflow: 'hidden',
    },
    accountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    borderBottom: {
        borderBottomWidth: 1,
        borderBottomColor: COLORS.divider,
    },
    accountName: {
        fontSize: 16,
        fontWeight: '500',
        color: COLORS.textPrimary,
    },
    accountNameExcluded: {
        color: COLORS.textMuted,
        textDecorationLine: 'line-through',
    },
});
