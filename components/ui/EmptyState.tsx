import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, SHADOWS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import IconCircle from './IconCircle';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface EmptyStateProps {
    icon: IoniconsName;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    colors?: AppColors;
}

export default function EmptyState({
    icon,
    title,
    description,
    actionLabel,
    onAction,
    colors: colorsProp,
}: EmptyStateProps) {
    const { colors: themeColors, typography } = useAppTheme();
    const colors = colorsProp ?? themeColors;
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    return (
        <View style={styles.container}>
            <View style={styles.iconWrap}>
                <IconCircle
                    name={icon}
                    color={colors.accent}
                    backgroundColor={colors.accentLight}
                    size={72}
                    iconSize={32}
                />
            </View>
            <Text style={styles.title}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
            {actionLabel && onAction ? (
                <Pressable
                    onPress={onAction}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={actionLabel}
                >
                    <Text style={styles.actionText}>{actionLabel}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            paddingVertical: 64,
            paddingHorizontal: 36,
        },
        iconWrap: {
            marginBottom: 20,
            ...SHADOWS.sm,
            ...withContinuousRadius(36),
        },
        title: {
            ...typography.h3,
            marginBottom: 8,
            textAlign: 'center',
            letterSpacing: -0.3,
        },
        description: {
            ...typography.body,
            color: colors.textMuted,
            textAlign: 'center',
            lineHeight: 22,
            maxWidth: 280,
        },
        actionBtn: {
            marginTop: 24,
            paddingHorizontal: 24,
            paddingVertical: 14,
            backgroundColor: colors.accent,
            ...withContinuousRadius(RADIUS.md),
            ...SHADOWS.sm,
        },
        actionBtnPressed: {
            opacity: 0.9,
            transform: [{ scale: 0.98 }],
        },
        actionText: {
            color: colors.textWhite,
            fontWeight: '700',
            fontSize: 15,
            letterSpacing: -0.2,
        },
    });
