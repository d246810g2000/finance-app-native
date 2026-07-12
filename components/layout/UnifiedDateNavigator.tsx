import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

interface UnifiedDateNavigatorProps {
    dateLabel: string;
    subLabel?: string;
    onPrev: () => void;
    onNext: () => void;
    onCenterPress: () => void;
    leftNode?: React.ReactNode;
    rightNode?: React.ReactNode;
}

export default function UnifiedDateNavigator({
    dateLabel,
    subLabel,
    onPrev,
    onNext,
    onCenterPress,
    leftNode,
    rightNode
}: UnifiedDateNavigatorProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    return (
        <View style={styles.outerContainer}>
            {leftNode && <View style={styles.sideNodeLeft}>{leftNode}</View>}
            <View style={styles.container}>
                <Pressable
                    style={({ pressed }) => [styles.arrowBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.9 }] }]}
                    onPress={onPrev}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                    <Ionicons name="chevron-back" size={20} color={colors.accent} />
                </Pressable>

                <Pressable
                    style={({ pressed }) => [styles.dateDisplay, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
                    onPress={onCenterPress}
                >
                    <View style={styles.centerTextContainer}>
                        <Text style={styles.dateText}>{dateLabel}</Text>
                        {!!subLabel && <Text style={styles.subText}>{subLabel}</Text>}
                    </View>
                </Pressable>

                <Pressable
                    style={({ pressed }) => [styles.arrowBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.9 }] }]}
                    onPress={onNext}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                    <Ionicons name="chevron-forward" size={20} color={colors.accent} />
                </Pressable>
            </View>
            {rightNode && <View style={styles.sideNodeRight}>{rightNode}</View>}
        </View>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    outerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        gap: 8,
    },
    sideNodeLeft: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    sideNodeRight: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.card,
        ...withContinuousRadius(RADIUS.md),
        borderWidth: 1,
        borderColor: colors.cardBorder,
        paddingHorizontal: 4,
        paddingVertical: 4,
        ...SHADOWS.sm,
    },
    arrowBtn: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        ...withContinuousRadius(RADIUS.sm),
    },
    dateDisplay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
        ...withContinuousRadius(RADIUS.sm),
    },
    centerTextContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    subText: {
        ...typography.caption,
        marginTop: 2,
    }
});
