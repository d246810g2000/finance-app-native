import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { withContinuousRadius } from '../../theme';

type HeaderMenuIcon = 'menu' | 'back';

interface HeaderMenuButtonProps {
    onPress: () => void;
    icon?: HeaderMenuIcon;
    accessibilityLabel?: string;
}

export default function HeaderMenuButton({
    onPress,
    icon = 'menu',
    accessibilityLabel = '開啟選單',
}: HeaderMenuButtonProps) {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <Pressable
            onPress={onPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
        >
            <Ionicons
                name={icon === 'back' ? 'chevron-back' : 'menu'}
                size={icon === 'back' ? 22 : 20}
                color={colors.textPrimary}
            />
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
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            ...withContinuousRadius(20),
            ...Platform.select({
                android: { elevation: 1 },
                default: {},
            }),
        },
        buttonPressed: {
            opacity: 0.8,
            transform: [{ scale: 0.96 }],
        },
    });
