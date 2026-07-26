import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, SHADOWS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type SegmentedOption<T extends string> = {
    value: T;
    label: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
};

interface SegmentedControlProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    colors?: AppColors;
    accessibilityLabel?: string;
    variant?: 'default' | 'filter' | 'view';
    fullWidth?: boolean;
}

export default function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    colors: colorsProp,
    accessibilityLabel,
    variant = 'default',
    fullWidth = false,
}: SegmentedControlProps<T>) {
    const { colors: themeColors } = useAppTheme();
    const colors = colorsProp ?? themeColors;
    const styles = useMemo(() => createStyles(colors), [colors]);
    const isCompact = variant === 'filter' || variant === 'view';

    return (
        <View
            style={[
                styles.track,
                fullWidth && styles.trackFull,
                isCompact && styles.trackCompact,
            ]}
            accessibilityRole="tablist"
            accessibilityLabel={accessibilityLabel}
        >
            {options.map((option) => {
                const isActive = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        style={({ pressed }) => [
                            styles.segment,
                            fullWidth && styles.segmentFull,
                            isCompact && styles.segmentCompact,
                            isActive && styles.segmentActive,
                            pressed ? { opacity: 0.85, transform: [{ scale: 0.97 }] } : null,
                        ]}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={option.label}
                    >
                        <View style={styles.segmentContent}>
                            {option.icon ? (
                                <Ionicons
                                    name={option.icon}
                                    size={isCompact ? 14 : 15}
                                    color={isActive ? colors.accent : colors.textMuted}
                                />
                            ) : null}
                            <Text style={[styles.label, isCompact && styles.labelCompact, isActive && styles.labelActive]}>
                                {option.label}
                            </Text>
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
    // iOS-style segmented track: one shared rail, segments sit flush with a small inset.
    track: {
        flexDirection: 'row',
        alignSelf: 'center',
        alignItems: 'center',
        backgroundColor: colors.bg,
        ...withContinuousRadius(RADIUS.md),
        padding: 3,
        gap: 2,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    trackFull: { alignSelf: 'stretch' },
    trackCompact: { alignSelf: 'flex-end' },
    segment: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        ...withContinuousRadius(RADIUS.sm),
        minWidth: 64,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    segmentFull: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
    segmentCompact: { minWidth: 0, minHeight: 36, paddingVertical: 6, paddingHorizontal: 10 },
    segmentActive: {
        backgroundColor: colors.card,
        borderColor: colors.cardBorder,
        ...SHADOWS.sm,
    },
    segmentContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textMuted,
        letterSpacing: 0,
    },
    labelCompact: { fontSize: 13 },
    labelActive: {
        fontWeight: '700',
        color: colors.accent,
    },
});
