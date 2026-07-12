import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AppColors, RADIUS, SHADOWS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type SegmentedOption<T extends string> = {
    value: T;
    label: string;
};

interface SegmentedControlProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    colors?: AppColors;
    accessibilityLabel?: string;
}

export default function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    colors: colorsProp,
    accessibilityLabel,
}: SegmentedControlProps<T>) {
    const { colors: themeColors } = useAppTheme();
    const colors = colorsProp ?? themeColors;
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View
            style={styles.container}
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
                            isActive && styles.segmentActive,
                            pressed && styles.segmentPressed,
                        ]}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={option.label}
                    >
                        <Text style={[styles.label, isActive && styles.labelActive]}>
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignSelf: 'center',
        backgroundColor: colors.card,
        ...withContinuousRadius(RADIUS.md),
        padding: 4,
        gap: 4,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        ...SHADOWS.sm,
    },
    segment: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        ...withContinuousRadius(RADIUS.sm),
        minWidth: 72,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentActive: {
        backgroundColor: colors.accentLight,
        borderWidth: 1,
        borderColor: colors.accentBorder,
    },
    segmentPressed: {
        opacity: 0.85,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textMuted,
        letterSpacing: 0.5,
    },
    labelActive: {
        fontWeight: '700',
        color: colors.accent,
    },
});
