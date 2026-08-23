import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

export interface SummaryItem {
    label: string;
    value: string;
    onPress?: () => void;
}

interface CompactSummaryBarProps {
    items: SummaryItem[];
    style?: StyleProp<ViewStyle>;
}

/**
 * 精簡摘要列：surfaceContainer 上的「標籤 值」單列。
 */
export default function CompactSummaryBar({ items, style }: CompactSummaryBarProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    return (
        <View style={[styles.row, style]}>
            {items.map((item, idx) => (
                <React.Fragment key={item.label}>
                    {idx > 0 ? <View style={styles.divider} /> : null}
                    {item.onPress ? (
                        <Pressable
                            style={({ pressed }) => [styles.metric, pressed && styles.metricPressed]}
                            onPress={item.onPress}
                            accessibilityRole="button"
                            accessibilityLabel={`${item.label} ${item.value}`}
                        >
                            <Text style={styles.text}>{item.label}</Text>
                            <Text style={[styles.value, styles.valueLink]} selectable>{item.value}</Text>
                        </Pressable>
                    ) : (
                        <View style={styles.metric}>
                            <Text style={styles.text}>{item.label}</Text>
                            <Text style={styles.value} selectable>{item.value}</Text>
                        </View>
                    )}
                </React.Fragment>
            ))}
        </View>
    );
}

const createStyles = (
    colors: AppColors,
    typography: ReturnType<typeof useAppTheme>['typography'],
) =>
    StyleSheet.create({
        row: {
            flexDirection: 'row',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            backgroundColor: colors.surfaceContainer,
            marginHorizontal: 16,
            marginTop: 12,
            paddingVertical: 14,
            paddingHorizontal: 12,
            ...withContinuousRadius(RADIUS.md),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.outlineVariant,
            gap: 4,
        },
        metric: { flex: 1, alignItems: 'center', gap: 4 },
        metricPressed: { opacity: 0.72 },
        text: { ...typography.labelMedium, color: colors.onSurfaceVariant },
        value: {
            ...typography.amount,
            color: colors.onSurface,
            fontSize: 17,
        },
        valueLink: { color: colors.primary },
        divider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.outlineVariant },
    });
