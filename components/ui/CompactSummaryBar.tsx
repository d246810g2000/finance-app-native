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
                    {idx > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.metric}>
                        <Text style={styles.text}>{item.label}</Text>
                        <Text style={styles.value}>{item.value}</Text>
                    </View>
                </React.Fragment>
            ))}
        </View>
    );
}

const createStyles = (colors: AppColors) =>
    StyleSheet.create({
        row: {
            flexDirection: 'row',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            backgroundColor: colors.card,
            marginHorizontal: 16,
            marginTop: 12,
            paddingVertical: 13,
            paddingHorizontal: 12,
            ...withContinuousRadius(RADIUS.lg),
            borderWidth: 1,
            borderColor: colors.cardBorder,
            ...SHADOWS.sm,
        },
        metric: { flex: 1, alignItems: 'center', gap: 3 },
        text: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
        value: { color: colors.textPrimary, fontWeight: '800', fontSize: 17, letterSpacing: -0.3 },
        divider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: colors.divider },
    });
