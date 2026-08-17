import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

/** handle 列高度：marginTop 12 + bar 4 + marginBottom 8 */
export const BOTTOM_SHEET_HANDLE_HEIGHT = 24;

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

export function useBottomSheetScrollHeight(fixedHeaderHeight: number, maxRatio = 0.9) {
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const sheetMax = windowHeight * maxRatio;
    return sheetMax - BOTTOM_SHEET_HANDLE_HEIGHT - fixedHeaderHeight - insets.bottom - 16;
}

const createStyles = (colors: AppColors) => StyleSheet.create({
    sheet: {
        width: '100%',
        backgroundColor: colors.surfaceContainer,
        ...withContinuousRadius(RADIUS.sheet),
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderTopLeftRadius: RADIUS.sheet,
        borderTopRightRadius: RADIUS.sheet,
        overflow: 'hidden',
    },
    handleBar: {
        width: 32,
        height: 4,
        backgroundColor: colors.outline,
        borderRadius: RADIUS.full,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    content: {
        width: '100%',
    },
});
