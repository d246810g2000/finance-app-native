import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

/** handle 列高度：marginTop 12 + bar 5 + marginBottom 8 */
export const BOTTOM_SHEET_HANDLE_HEIGHT = 25;

interface BottomSheetProps {
    children: React.ReactNode;
    style?: ViewStyle;
    contentStyle?: ViewStyle;
    showHandle?: boolean;
    maxHeight?: `${number}%` | number;
}

export default function BottomSheet({
    children,
    style,
    contentStyle,
    showHandle = true,
    maxHeight = '90%',
}: BottomSheetProps) {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const sheetMaxHeight = typeof maxHeight === 'string'
        ? windowHeight * (parseFloat(maxHeight) / 100)
        : maxHeight;

    return (
        <View
            style={[
                styles.sheet,
                { maxHeight: sheetMaxHeight, paddingBottom: insets.bottom + 16 },
                style,
            ]}
        >
            {showHandle && <View style={styles.handleBar} />}
            <View style={[styles.content, contentStyle]}>
                {children}
            </View>
        </View>
    );
}

/** 計算 BottomSheet 內 ScrollView 可用高度（需扣除 handle、固定 header、safe area） */
export function useBottomSheetScrollHeight(fixedHeaderHeight: number, maxRatio = 0.9) {
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const sheetMax = windowHeight * maxRatio;
    return sheetMax - BOTTOM_SHEET_HANDLE_HEIGHT - fixedHeaderHeight - insets.bottom - 16;
}

const createStyles = (colors: AppColors) => StyleSheet.create({
    sheet: {
        width: '100%',
        backgroundColor: colors.bg,
        borderTopLeftRadius: RADIUS.xl,
        borderTopRightRadius: RADIUS.xl,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 12,
    },
    handleBar: {
        width: 40,
        height: 5,
        backgroundColor: colors.border,
        borderRadius: 3,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    content: {
        width: '100%',
    },
});
