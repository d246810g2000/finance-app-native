import React, { useMemo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { AppColors } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type Typography = ReturnType<typeof useAppTheme>['typography'];

interface SectionHeaderProps {
    title: string;
    /** 左側色條顏色，預設 accent */
    accent?: string;
    /** 右側附加內容（例如操作連結） */
    trailing?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * 區塊標題：左側 4px 色條 + 標題文字，供各頁區塊使用。
 */
export default function SectionHeader({ title, accent, trailing, style }: SectionHeaderProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    return (
        <View style={[styles.row, style]}>
            <View style={[styles.dot, { backgroundColor: accent ?? colors.accent }]} />
            <Text style={styles.title}>{title}</Text>
            {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
    );
}

const createStyles = (colors: AppColors, typography: Typography) =>
    StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
        dot: { width: 4, height: 18, borderRadius: 2, marginRight: 10 },
        title: { ...typography.sectionTitle, flex: 1 },
        trailing: { marginLeft: 12 },
    });
