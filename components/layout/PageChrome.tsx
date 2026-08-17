import React, { useMemo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';

interface PageChromeProps {
    children: React.ReactNode;
    zIndex?: number;
    style?: StyleProp<ViewStyle>;
}

/**
 * 固定於列表頁頂部的容器：surface 層級、內距、底部分隔線（tonal，無重陰影）。
 */
export default function PageChrome({ children, zIndex = 10, style }: PageChromeProps) {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return <View style={[styles.chrome, { zIndex }, style]}>{children}</View>;
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
    StyleSheet.create({
        chrome: {
            backgroundColor: colors.surfaceContainer,
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 8,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.outlineVariant,
        },
    });
