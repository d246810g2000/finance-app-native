
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BudgetStatus, BudgetRule } from '../../types';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../../theme';
import { LinearGradient } from 'expo-linear-gradient';

interface BudgetProgressCardProps {
    status: BudgetStatus;
    onEdit: (rule: BudgetRule) => void;
    onDelete: (id: string) => void;
    onClick: (rule: BudgetRule) => void;
}

// Status color palettes — each status gets a curated color set
const STATUS_PALETTES = {
    safe: {
        bar: '#10B981',
        barGradient: ['#34D399', '#10B981'] as [string, string],
        accentBg: 'rgba(16, 185, 129, 0.06)',
        accentBorder: 'rgba(16, 185, 129, 0.18)',
        badgeBg: 'rgba(16, 185, 129, 0.10)',
        badgeText: '#059669',
        strip: '#10B981',
    },
    warning: {
        bar: '#F59E0B',
        barGradient: ['#FCD34D', '#F59E0B'] as [string, string],
        accentBg: 'rgba(245, 158, 11, 0.06)',
        accentBorder: 'rgba(245, 158, 11, 0.18)',
        badgeBg: 'rgba(245, 158, 11, 0.10)',
        badgeText: '#D97706',
        strip: '#F59E0B',
    },
    danger: {
        bar: '#F97316',
        barGradient: ['#FDBA74', '#F97316'] as [string, string],
        accentBg: 'rgba(249, 115, 22, 0.06)',
        accentBorder: 'rgba(249, 115, 22, 0.18)',
        badgeBg: 'rgba(249, 115, 22, 0.10)',
        badgeText: '#EA580C',
        strip: '#F97316',
    },
    exceeded: {
        bar: '#EF4444',
        barGradient: ['#FCA5A5', '#EF4444'] as [string, string],
        accentBg: 'rgba(239, 68, 68, 0.06)',
        accentBorder: 'rgba(239, 68, 68, 0.18)',
        badgeBg: 'rgba(239, 68, 68, 0.10)',
        badgeText: '#DC2626',
        strip: '#EF4444',
    },
};

export const BudgetProgressCard: React.FC<BudgetProgressCardProps> = ({ status, onEdit, onDelete, onClick }) => {
    const { rule, spent, remaining, percentage, status: statusType, dailySafeSpend } = status;

    const palette = STATUS_PALETTES[statusType] || STATUS_PALETTES.safe;
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
        >
            {/* Left accent strip */}
            <View style={[styles.accentStrip, { backgroundColor: palette.strip }]} />

            <View style={styles.cardContent}>
                {/* Row 1: Category + Percentage + Remaining */}
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

                {/* Row 2: Progress bar */}
                <View style={styles.progressTrack}>
                    <LinearGradient
                        colors={palette.barGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressFill, { width: `${barWidth}%` }]}
                    />
                </View>

                {/* Row 3: Spent info + daily safe — emoji prefix style like travel/project */}
                <View style={styles.bottomRow}>
                    <Text style={styles.metaText}>
                        💰 ${spent.toLocaleString()} / ${rule.monthlyLimit.toLocaleString()}
                    </Text>
                    {dailySafeSpend !== undefined && remaining > 0 && (
                        <Text style={[styles.metaText, { color: palette.badgeText }]}>
                            💡 ${dailySafeSpend.toLocaleString()}/日
                        </Text>
                    )}
                </View>
            </View>
        </Pressable>
    );
};

export const OtherExpensesCard: React.FC<{ amount: number; onClick: () => void }> = ({ amount, onClick }) => {
    return (
        <Pressable
            onPress={onClick}
            style={({ pressed }) => [styles.card, styles.otherCard, pressed && styles.cardPressed]}
        >
            <View style={[styles.accentStrip, styles.otherStrip]} />
            <View style={styles.cardContent}>
                <View style={styles.topRow}>
                    <Text style={styles.category} numberOfLines={1}>其他 (未歸類)</Text>
                    <Text style={styles.otherBadge}>未設定</Text>
                </View>
                <View style={styles.bottomRow}>
                    <Text style={styles.metaText}>💰 ${amount.toLocaleString()}</Text>
                </View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        borderRadius: 14,
        marginBottom: 10,
        borderWidth: 1,
        overflow: 'hidden',
        backgroundColor: COLORS.card,
        ...SHADOWS.sm,
    },
    cardPressed: {
        opacity: 0.88,
        transform: [{ scale: 0.98 }],
    },
    otherCard: {
        borderStyle: 'dashed',
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg,
    },
    accentStrip: {
        width: 4,
    },
    otherStrip: {
        backgroundColor: COLORS.textMuted,
    },
    cardContent: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 14,
        paddingLeft: 12,
    },

    // Top row: category + percent badge + remaining
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    category: {
        fontSize: 15,
        fontWeight: '700',
        color: COLORS.textPrimary,
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
        color: COLORS.textPrimary,
        letterSpacing: -0.3,
    },
    negative: {
        color: COLORS.red,
    },

    // Progress bar — thin
    progressTrack: {
        height: 5,
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: 3,
        marginBottom: 6,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },

    // Bottom row: meta text — emoji prefix style matching travel/project
    bottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    metaText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },

    // Other badge
    otherBadge: {
        fontSize: 11,
        fontWeight: '600',
        color: COLORS.textMuted,
        backgroundColor: COLORS.divider,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        overflow: 'hidden',
    },
});
