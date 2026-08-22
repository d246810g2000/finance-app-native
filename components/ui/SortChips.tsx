import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { hapticSelection } from '../../utils/haptics';

type Typography = ReturnType<typeof useAppTheme>['typography'];

export type SortDirection = 'asc' | 'desc';

export interface SortOption<T extends string> {
    key: T;
    label: string;
}

const SortChip = memo(function SortChip({
    label,
    isActive,
    isAsc,
    styles,
    colors,
    onPress,
}: {
    label: string;
    isActive: boolean;
    isAsc: boolean;
    styles: ReturnType<typeof createStyles>;
    colors: AppColors;
    onPress: () => void;
}) {
    const scale = useSharedValue(1);

    const chipAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <Pressable
            onPress={onPress}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            onPressIn={() => { scale.value = withTiming(0.96, { duration: 100 }); }}
            onPressOut={() => { scale.value = withTiming(1, { duration: 140 }); }}
            android_ripple={{ color: colors.statePressed, borderless: false }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`依${label}排序，${isActive ? (isAsc ? '升冪' : '降冪') : '點擊啟用'}`}
        >
            <Reanimated.View style={[
                styles.chip,
                isActive && styles.chipActive,
                chipAnimStyle,
            ]}>
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {label}
                </Text>
                {isActive ? (
                    <Ionicons
                        name={isAsc ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={colors.onPrimaryContainer}
                        style={styles.chipIcon}
                    />
                ) : null}
            </Reanimated.View>
        </Pressable>
    );
});

interface SortChipsProps<T extends string> {
    options: SortOption<T>[];
    activeKey: T;
    direction: SortDirection;
    onChange: (key: T, direction: SortDirection) => void;
    variant?: 'bar' | 'plain';
}

export default function SortChips<T extends string>({
    options,
    activeKey,
    direction,
    onChange,
    variant = 'plain',
}: SortChipsProps<T>) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    const handlePress = (key: T) => {
        hapticSelection();
        if (key === activeKey) {
            onChange(key, direction === 'asc' ? 'desc' : 'asc');
        } else {
            onChange(key, 'desc');
        }
    };

    const content = (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
        >
            {options.map((opt) => (
                <SortChip
                    key={opt.key}
                    label={opt.label}
                    isActive={opt.key === activeKey}
                    isAsc={direction === 'asc'}
                    styles={styles}
                    colors={colors}
                    onPress={() => handlePress(opt.key)}
                />
            ))}
        </ScrollView>
    );

    if (variant === 'bar') {
        return <View style={styles.bar}>{content}</View>;
    }
    return content;
}

const createStyles = (colors: AppColors, typography: Typography) =>
    StyleSheet.create({
        bar: {
            backgroundColor: colors.surface,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.outlineVariant,
            paddingVertical: 10,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            gap: 8,
        },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            minHeight: 40,
            ...withContinuousRadius(RADIUS.full),
            backgroundColor: colors.surfaceContainer,
            borderWidth: 1,
            borderColor: colors.outlineVariant,
            overflow: 'hidden',
        },
        chipActive: {
            backgroundColor: colors.primaryContainer,
            borderColor: colors.primaryContainer,
        },
        chipText: {
            ...typography.chip,
            color: colors.onSurfaceVariant,
            includeFontPadding: false,
        },
        chipTextActive: {
            color: colors.onPrimaryContainer,
        },
        chipIcon: {
            marginLeft: 4,
        },
    });
