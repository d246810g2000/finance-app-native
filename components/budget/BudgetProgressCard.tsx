
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BudgetStatus, BudgetRule } from '../../types';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

interface BudgetProgressCardProps {
    status: BudgetStatus;
    onEdit: (rule: BudgetRule) => void;
    onDelete: (id: string) => void;
    onClick: (rule: BudgetRule) => void;
}

const getStatusPalettes = (colors: AppColors) => ({
    safe: {
        bar: colors.green,
        barGradient: colors.greenGradient as [string, string],
        accentBorder: colors.green + '30',
        badgeBg: colors.greenLight,
        badgeText: colors.green,
        strip: colors.green,
    },
    warning: {
        bar: colors.yellow,
        barGradient: [colors.yellowLight, colors.yellow] as [string, string],
        accentBorder: colors.yellow + '30',
        badgeBg: colors.yellowLight,
        badgeText: colors.yellow,
        strip: colors.yellow,
    },
    danger: {
        bar: colors.accent,
        barGradient: colors.accentGradientShape as [string, string],
        accentBorder: colors.accent + '30',
        badgeBg: colors.accentLight,
        badgeText: colors.accent,
        strip: colors.accent,
    },
    exceeded: {
        bar: colors.red,
        barGradient: colors.redGradient as [string, string],
        accentBorder: colors.red + '30',
        badgeBg: colors.redLight,
        badgeText: colors.red,
        strip: colors.red,
    },
});

export const BudgetProgressCard: React.FC<BudgetProgressCardProps> = ({ status, onEdit, onDelete, onClick }) => {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const palettes = useMemo(() => getStatusPalettes(colors), [colors]);
    const { rule, spent, remaining, percentage, status: statusType, dailySafeSpend } = status;

    const palette = palettes[statusType] || palettes.safe;
    const barWidth = Math.min(percentage, 100);

    return (
        <Pressable
            onPress={() => onClick(rule)}
            onLongPress={() => onEdit(rule)}
            style={({ pressed }) => [
                styles.card,
                { borderColor: palette.accentBorder },
                pressed && styles.cardPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${rule.category} 預算，已用 ${Math.round(percentage)}%`}
        >
            <View style={[styles.accentStrip, { backgroundColor: palette.strip }]} />

            <View style={styles.cardContent}>
                <View style={styles.topRow}>
                    <Text style={styles.category} numberOfLines={1}>{rule.category}</Text>
                    <View style={[styles.percentBadge, { backgroundColor: palette.badgeBg }]}>
                        <Text style={[styles.percentText, { color: palette.bar }]}>
                            {Math.round(percentage)}%
                        </Text>
                    </View>
                    <Text style={[styles.remainingValue, remaining < 0 && styles.negative]}>
                        ${Math.abs(remaining).toLocaleString()}
                    </Text>
                </View>

                <View style={styles.progressTrack}>
                    <LinearGradient
                        colors={palette.barGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressFill, { width: `${barWidth}%` }]}
                    />
                </View>

                <View style={styles.bottomRow}>
                    <Text style={styles.metaText}>
                        ${spent.toLocaleString()} / ${rule.monthlyLimit.toLocaleString()}
                    </Text>
                    {dailySafeSpend !== undefined && remaining > 0 && (
                        <Text style={[styles.metaText, { color: palette.badgeText }]}>
                            日均 ${dailySafeSpend.toLocaleString()}
                        </Text>
                    )}
                </View>
            </View>
        </Pressable>
    );
};

export const OtherExpensesCard: React.FC<{ amount: number; onClick: () => void }> = ({ amount, onClick }) => {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    return (
        <Pressable
            onPress={onClick}
            style={({ pressed }) => [styles.card, styles.otherCard, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`其他未歸類支出 ${amount.toLocaleString()} 元`}
        >
            <View style={[styles.accentStrip, styles.otherStrip]} />
            <View style={styles.cardContent}>
                <View style={styles.topRow}>
                    <Text style={styles.category} numberOfLines={1}>其他 (未歸類)</Text>
                    <Text style={styles.otherBadge}>未設定</Text>
                </View>
                <View style={styles.bottomRow}>
                    <Text style={styles.metaText}>${amount.toLocaleString()}</Text>
                </View>
            </View>
        </Pressable>
    );
};

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) =>
    StyleSheet.create({
        card: {
            flexDirection: 'row',
            ...withContinuousRadius(RADIUS.lg),
            marginBottom: 10,
            borderWidth: 1,
            overflow: 'hidden',
            backgroundColor: colors.card,
            ...SHADOWS.sm,
        },
        cardPressed: {
            opacity: 0.88,
            transform: [{ scale: 0.98 }],
        },
        otherCard: {
            borderStyle: 'dashed',
            borderColor: colors.border,
            backgroundColor: colors.bg,
        },
        accentStrip: {
            width: 4,
        },
        otherStrip: {
            backgroundColor: colors.textMuted,
        },
        cardContent: {
            flex: 1,
            paddingVertical: 14,
            paddingHorizontal: 14,
            paddingLeft: 12,
        },
        topRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 8,
        },
        category: {
            ...typography.body,
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPrimary,
            letterSpacing: -0.3,
            flex: 1,
        },
        percentBadge: {
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 8,
            marginHorizontal: 8,
        },
        percentText: {
            fontSize: 12,
            fontWeight: '800',
            letterSpacing: -0.3,
        },
        remainingValue: {
            fontSize: 15,
            fontWeight: '800',
            color: colors.textPrimary,
            letterSpacing: -0.3,
        },
        negative: {
            color: colors.red,
        },
        progressTrack: {
            height: 5,
            backgroundColor: colors.divider,
            borderRadius: 3,
            marginBottom: 6,
            overflow: 'hidden',
        },
        progressFill: {
            height: '100%',
            borderRadius: 3,
        },
        bottomRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        metaText: {
            fontSize: 12,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        otherBadge: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textMuted,
            backgroundColor: colors.divider,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
            overflow: 'hidden',
        },
    });
