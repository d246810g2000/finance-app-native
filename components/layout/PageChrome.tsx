import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';

interface PageChromeProps {
    children: React.ReactNode;
    /** 提高 zIndex 以容納浮出的下拉選單（例如記錄頁的檢視模式切換） */
    zIndex?: number;
    style?: StyleProp<ViewStyle>;
}

/**
 * 固定於列表頁頂部的容器：統一背景、內距、底部分隔線與平台陰影。
 * 用於包裹 DateRangeSelector / UnifiedDateNavigator 等日期導航列。
 */
export default function PageChrome({ children, zIndex = 10, style }: PageChromeProps) {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return <View style={[styles.chrome, { zIndex }, style]}>{children}</View>;
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
    StyleSheet.create({
        chrome: {
            backgroundColor: colors.headerBg,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.cardBorder,
            ...Platform.select({
                android: { elevation: 2 },
                ios: {
                    shadowColor: '#0F172A',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 6,
                },
                default: {},
            }),
        },
    });
