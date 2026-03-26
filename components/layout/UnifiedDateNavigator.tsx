import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../../theme';

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
    return (
        <View style={styles.outerContainer}>
            {leftNode && <View style={styles.sideNodeLeft}>{leftNode}</View>}
            <View style={styles.container}>
                <Pressable
                    style={({ pressed }) => [styles.arrowBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.9 }] }]}
                    onPress={onPrev}
                >
                    <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
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
                >
                    <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
                </Pressable>
            </View>
            {rightNode && <View style={styles.sideNodeRight}>{rightNode}</View>}
        </View>
    );
}

const styles = StyleSheet.create({
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
        backgroundColor: COLORS.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        paddingHorizontal: 4,
        paddingVertical: 4,
        ...SHADOWS.sm,
    },
    arrowBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
    },
    dateDisplay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 8,
    },
    centerTextContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateText: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    subText: {
        ...TYPOGRAPHY.caption,
        marginTop: 2,
    }
});
