import React, { useMemo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

export interface SummaryItem {
    label: string;
    value: string;
}

interface CompactSummaryBarProps {
    items: SummaryItem[];
    style?: StyleProp<ViewStyle>;
}

/**
 * 精簡摘要列：卡片式的「標籤 值 | 標籤 值」單列，供 project / travel 頁頂部使用。
 */
export default function CompactSummaryBar({ items, style }: CompactSummaryBarProps) {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={[styles.row, style]}>
            {items.map((item, idx) => (
                <React.Fragment key={item.label}>
                    {idx > 0 ? <Text style={styles.divider}>|</Text> : null}
                    <Text style={styles.text}>
                        {item.label} <Text style={styles.value}>{item.value}</Text>
                    </Text>
                </React.Fragment>
            ))}
        </View>
    );
}

const createStyles = (colors: AppColors) =>
    StyleSheet.create({
        row: {
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.card,
            marginHorizontal: 16,
            marginTop: 12,
            paddingVertical: 14,
            paddingHorizontal: 20,
            ...withContinuousRadius(RADIUS.lg),
            borderWidth: 1,
            borderColor: colors.cardBorder,
            ...SHADOWS.sm,
        },
        text: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
        value: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
        divider: { color: colors.divider, marginHorizontal: 14, fontSize: 12 },
    });
