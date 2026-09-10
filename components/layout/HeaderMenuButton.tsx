import React, { useMemo } from 'react';
import AppPressable from '../ui/AppPressable';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { RADIUS, withContinuousRadius } from '../../theme';

type HeaderMenuIcon = 'menu' | 'back';

interface HeaderMenuButtonProps {
    onPress: () => void;
    icon?: HeaderMenuIcon;
    accessibilityLabel?: string;
}

export default function HeaderMenuButton({
    onPress,
    icon = 'menu',
    accessibilityLabel = '開啟更多',
}: HeaderMenuButtonProps) {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <AppPressable
            onPress={onPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.button}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
        >
            <Ionicons
                name={icon === 'back' ? 'chevron-back' : 'menu'}
                size={icon === 'back' ? 22 : 20}
                color={colors.onSurface}
            />
        </AppPressable>
    );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
    StyleSheet.create({
        button: {
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceVariant,
            ...withContinuousRadius(RADIUS.full),
        },
    });
