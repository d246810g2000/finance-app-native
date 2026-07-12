import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { withContinuousRadius } from '../../theme';

interface HeaderSearchButtonProps {
    onPress: () => void;
}

export default function HeaderSearchButton({ onPress }: HeaderSearchButtonProps) {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <Pressable
            onPress={onPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="搜尋記錄"
        >
            <Ionicons name="search" size={20} color={colors.accent} />
        </Pressable>
    );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
    StyleSheet.create({
        button: {
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentLight,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            ...withContinuousRadius(20),
            elevation: 1,
        },
        buttonPressed: {
            opacity: 0.8,
            transform: [{ scale: 0.96 }],
        },
    });
