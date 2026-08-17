import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { parseFormattedDate } from '../../utils/dateUtils';
import { hapticSelection } from '../../utils/haptics';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export function formatCapsuleDateLabel(dateStr: string): string {
    const d = parseFormattedDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

interface DateCapsuleFilterProps {
    dates: string[];
    /** null = 全部 selected */
    selectedDate: string | null;
    onSelectAll: () => void;
    onSelectDate: (date: string) => void;
}

function Capsule({
    label,
    active,
    onPress,
    styles,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <Pressable
            onPress={() => {
                hapticSelection();
                onPress();
            }}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            style={({ pressed }) => [
                styles.capsule,
                active ? styles.capsuleActive : null,
                pressed && { opacity: 0.88 },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
        >
            <Text style={[styles.capsuleText, active ? styles.capsuleTextActive : null]}>
                {label}
            </Text>
        </Pressable>
    );
}

export default function DateCapsuleFilter({
    dates,
    selectedDate,
    onSelectAll,
    onSelectDate,
}: DateCapsuleFilterProps) {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const allSelected = selectedDate === null;

    return (
        <View style={styles.row} accessibilityRole="tablist" accessibilityLabel="旅遊日期篩選">
            <Capsule label="全部" active={allSelected} onPress={onSelectAll} styles={styles} />

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                style={styles.scroll}
            >
                {dates.map((date) => (
                    <Capsule
                        key={date}
                        label={formatCapsuleDateLabel(date)}
                        active={selectedDate === date}
                        onPress={() => onSelectDate(date)}
                        styles={styles}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

const createStyles = (colors: AppColors) =>
    StyleSheet.create({
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 10,
            gap: 8,
        },
        scroll: { flex: 1 },
        scrollContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
        // 對齊 SortChips：底色寫在基礎樣式，active 再覆蓋
        capsule: {
            paddingHorizontal: 14,
            paddingVertical: 8,
            minHeight: 40,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.surfaceContainer,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.outlineVariant,
            overflow: 'hidden',
            ...withContinuousRadius(RADIUS.full),
        },
        capsuleActive: {
            backgroundColor: colors.primaryContainer,
            borderColor: colors.primaryContainer,
        },
        capsuleText: {
            fontSize: 13,
            fontWeight: '700',
            color: colors.onSurfaceVariant,
            includeFontPadding: false,
        },
        capsuleTextActive: {
            color: colors.onPrimaryContainer,
        },
    });
