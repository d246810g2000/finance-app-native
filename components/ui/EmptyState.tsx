import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
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
                    color={colors.primary}
                    backgroundColor={colors.primaryContainer}
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
            paddingVertical: 72,
            paddingHorizontal: 36,
            gap: 8,
        },
        iconWrap: {
            marginBottom: 10,
            ...withContinuousRadius(36),
            backgroundColor: colors.primaryContainer,
        },
        title: {
            ...typography.titleMedium,
            fontSize: 18,
            textAlign: 'center',
        },
        description: {
            ...typography.body,
            color: colors.onSurfaceVariant,
            textAlign: 'center',
            lineHeight: 22,
            maxWidth: 280,
        },
        actionBtn: {
            marginTop: 20,
            minHeight: 48,
            paddingHorizontal: 24,
            justifyContent: 'center',
            backgroundColor: colors.primary,
            ...withContinuousRadius(RADIUS.full),
        },
        actionBtnPressed: {
            opacity: 0.9,
        },
        actionText: {
            color: colors.onPrimary,
            fontWeight: '700',
            fontSize: 15,
            letterSpacing: -0.2,
        },
    });
