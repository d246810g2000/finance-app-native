import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, SHADOWS, withContinuousRadius } from '../../theme';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

interface TravelHighlightCardProps {
    title: string;
    icon: IonName;
    iconColor: string;
    primary: string;
    secondary?: string;
    amount: string;
    colors: AppColors;
    onPress?: () => void;
    /** Stories 圖不顯示 chevron */
    showChevron?: boolean;
    compact?: boolean;
}

/**
 * 最大筆消費 / 花最多的一天 — 穩定橫列：左資訊、右金額
 */
export default function TravelHighlightCard({
    title,
    icon,
    iconColor,
    primary,
    secondary,
    amount,
    colors,
    onPress,
    showChevron = true,
    compact = false,
}: TravelHighlightCardProps) {
    const styles = createStyles(colors, compact);

    const body = (
        <View style={[styles.card, !compact && SHADOWS.sm]}>
            <View style={styles.header}>
                <View style={[styles.iconWrap, { backgroundColor: `${iconColor}22` }]}>
                    <Ionicons name={icon} size={compact ? 14 : 16} color={iconColor} />
                </View>
                <Text style={styles.title}>{title}</Text>
                {showChevron && onPress ? (
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
                ) : null}
            </View>
            <View style={styles.body}>
                <View style={styles.left}>
                    <Text style={styles.primary} numberOfLines={1}>{primary}</Text>
                    {secondary ? (
                        <Text style={styles.secondary} numberOfLines={1}>{secondary}</Text>
                    ) : null}
                </View>
                <Text style={styles.amount}>{amount}</Text>
            </View>
        </View>
    );

    if (!onPress) return body;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [pressed ? { opacity: 0.9 } : null]}
            accessibilityRole="button"
            accessibilityLabel={title}
        >
            {body}
        </Pressable>
    );
}

const createStyles = (colors: AppColors, compact: boolean) =>
    StyleSheet.create({
        card: {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            padding: compact ? 12 : 16,
            ...withContinuousRadius(RADIUS.lg),
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: compact ? 8 : 10,
        },
        iconWrap: {
            width: compact ? 26 : 28,
            height: compact ? 26 : 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
        },
        title: {
            flex: 1,
            fontSize: compact ? 12 : 13,
            fontWeight: '700',
            color: colors.textSecondary,
        },
        chevron: { marginLeft: 4 },
        body: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        left: {
            flex: 1,
            minWidth: 0,
            marginRight: 12,
        },
        primary: {
            fontSize: compact ? 14 : 15,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        secondary: {
            fontSize: compact ? 11 : 12,
            color: colors.textMuted,
            marginTop: 2,
        },
        amount: {
            fontSize: compact ? 15 : 16,
            fontWeight: '800',
            color: colors.textPrimary,
            letterSpacing: -0.3,
        },
    });
