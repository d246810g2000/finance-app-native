import React, { useMemo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, type ColorValue } from 'react-native';
import { AppColors } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type Typography = ReturnType<typeof useAppTheme>['typography'];

interface SectionHeaderProps {
    title: string;
    accent?: ColorValue;
    trailing?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * 區塊標題：左側 tonal 指示條 + 標題文字。
 */
export default function SectionHeader({ title, accent, trailing, style }: SectionHeaderProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    return (
        <View style={[styles.row, style]}>
            <View style={[styles.dot, { backgroundColor: accent ?? colors.primary }]} />
            <Text style={styles.title}>{title}</Text>
            {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
    );
}

const createStyles = (colors: AppColors, typography: Typography) =>
    StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, minHeight: 28, gap: 10 },
        dot: { width: 4, height: 18, borderRadius: 2 },
        title: { ...typography.sectionTitle, flex: 1 },
        trailing: { marginLeft: 4 },
    });
