import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import IconCircle from '../ui/IconCircle';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type Typography = ReturnType<typeof useAppTheme>['typography'];

export type HealthCheckVariant = 'success' | 'yellow' | 'red' | 'new';

interface HealthCheckCardProps {
    variant: HealthCheckVariant;
    title: string;
    description: string;
    badge?: string;
    onPress?: () => void;
    actionLabel?: string;
    style?: StyleProp<ViewStyle>;
}

function getVariantMeta(variant: HealthCheckVariant, colors: AppColors) {
    switch (variant) {
        case 'success':
            return {
                accent: colors.green,
                iconBg: colors.greenLight,
                icon: 'checkmark-circle' as IoniconsName,
                border: colors.green + '28',
            };
        case 'red':
            return {
                accent: colors.red,
                iconBg: colors.redLight,
                icon: 'alert-circle' as IoniconsName,
                border: colors.red + '28',
            };
        case 'new':
            return {
                accent: colors.accent,
                iconBg: colors.accentLight,
                icon: 'sparkles' as IoniconsName,
                border: colors.accentBorder,
            };
        case 'yellow':
        default:
            return {
                accent: colors.yellow,
                iconBg: colors.yellowLight,
                icon: 'warning' as IoniconsName,
                border: colors.yellow + '40',
            };
    }
}

export default function HealthCheckCard({
    variant,
    title,
    description,
    badge,
    onPress,
    actionLabel = '查看大額明細',
    style,
}: HealthCheckCardProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const meta = getVariantMeta(variant, colors);
    const isInteractive = !!onPress;

    const content = (
        <>
            <View style={[styles.accentStrip, { backgroundColor: meta.accent }]} />
            <View style={styles.body}>
                <IconCircle
                    name={meta.icon}
                    color={meta.accent}
                    backgroundColor={meta.iconBg}
                    size={40}
                    iconSize={22}
                />
                <View style={styles.textCol}>
                    <View style={styles.titleRow}>
                        <Text style={styles.title} numberOfLines={2}>{title}</Text>
                        {badge ? (
                            <View style={[styles.badge, { backgroundColor: meta.iconBg, borderColor: meta.border }]}>
                                <Text style={[styles.badgeText, { color: meta.accent }]}>{badge}</Text>
                            </View>
                        ) : null}
                    </View>
                    <Text style={styles.description}>{description}</Text>
                    {isInteractive ? (
                        <View style={styles.actionRow}>
                            <Text style={[styles.actionText, { color: meta.accent }]}>{actionLabel}</Text>
                            <Ionicons name="chevron-forward" size={14} color={meta.accent} />
                        </View>
                    ) : null}
                </View>
            </View>
        </>
    );

    if (isInteractive) {
        return (
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    styles.card,
                    { borderColor: meta.border },
                    pressed && styles.cardPressed,
                    style,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${title}，${description}`}
            >
                {content}
            </Pressable>
        );
    }

    return (
        <View style={[styles.card, { borderColor: meta.border }, style]}>
            {content}
        </View>
    );
}

const createStyles = (colors: AppColors, typography: Typography) =>
    StyleSheet.create({
        card: {
            flexDirection: 'row',
            backgroundColor: colors.card,
            borderWidth: 1,
            ...withContinuousRadius(RADIUS.md),
            overflow: 'hidden',
            ...SHADOWS.sm,
        },
        cardPressed: {
            opacity: 0.9,
            transform: [{ scale: 0.99 }],
        },
        accentStrip: {
            width: 4,
        },
        body: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
            paddingVertical: 14,
            paddingHorizontal: 14,
            paddingLeft: 12,
        },
        textCol: {
            flex: 1,
            minWidth: 0,
        },
        titleRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
        },
        title: {
            ...typography.cardTitle,
            flex: 1,
            includeFontPadding: false,
        },
        badge: {
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 8,
            borderWidth: 1,
            flexShrink: 0,
        },
        badgeText: {
            fontSize: 11,
            fontWeight: '800',
            letterSpacing: 0.2,
            includeFontPadding: false,
        },
        description: {
            ...typography.bodySm,
            lineHeight: 18,
            color: colors.textSecondary,
        },
        actionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginTop: 10,
        },
        actionText: {
            fontSize: 12,
            fontWeight: '700',
            includeFontPadding: false,
        },
    });
