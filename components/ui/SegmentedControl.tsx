import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { hapticSelection } from '../../utils/haptics';

type SegmentedOption<T extends string> = {
    value: T;
    label: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
};

const Segment = memo(function Segment({
    option,
    isActive,
    isCompact,
    fullWidth,
    styles,
    colors,
    onPress,
}: {
    option: { value: string; label: string; icon?: React.ComponentProps<typeof Ionicons>['name'] };
    isActive: boolean;
    isCompact: boolean;
    fullWidth: boolean;
    styles: ReturnType<typeof createStyles>;
    colors: AppColors;
    onPress: () => void;
}) {
    const scale = useSharedValue(1);

    const segmentAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <Pressable
            onPress={onPress}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPressIn={() => { scale.value = withTiming(0.96, { duration: 100 }); }}
            onPressOut={() => { scale.value = withTiming(1, { duration: 140 }); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.label}
        >
            <Reanimated.View style={[
                styles.segment,
                fullWidth && styles.segmentFull,
                isCompact && styles.segmentCompact,
                isActive && styles.segmentActive,
                segmentAnimStyle,
            ]}>
                <View style={styles.segmentContent}>
                    {option.icon ? (
                        <Ionicons
                            name={option.icon}
                            size={isCompact ? 14 : 15}
                            color={isActive ? colors.onPrimaryContainer : colors.textMuted}
                        />
                    ) : null}
                    <Text style={[styles.label, isCompact && styles.labelCompact, isActive && styles.labelActive]}>
                        {option.label}
                    </Text>
                </View>
            </Reanimated.View>
        </Pressable>
    );
});

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
                    <Segment
                        key={option.value}
                        option={option}
                        isActive={isActive}
                        isCompact={isCompact}
                        fullWidth={fullWidth}
                        styles={styles}
                        colors={colors}
                        onPress={() => {
                            hapticSelection();
                            onChange(option.value);
                        }}
                    />
                );
            })}
        </View>
    );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
    track: {
        flexDirection: 'row',
        alignSelf: 'center',
        alignItems: 'center',
        backgroundColor: colors.surfaceVariant,
        ...withContinuousRadius(RADIUS.full),
        padding: 4,
        gap: 2,
    },
    trackFull: { alignSelf: 'stretch' },
    trackCompact: { alignSelf: 'flex-end' },
    segment: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        ...withContinuousRadius(RADIUS.full),
        minWidth: 64,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentFull: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
    segmentCompact: { minWidth: 0, minHeight: 36, paddingVertical: 6, paddingHorizontal: 10 },
    segmentActive: {
        backgroundColor: colors.primaryContainer,
    },
    segmentContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.onSurfaceVariant,
        letterSpacing: 0,
    },
    labelCompact: { fontSize: 13 },
    labelActive: {
        fontWeight: '700',
        color: colors.onPrimaryContainer,
    },
});
