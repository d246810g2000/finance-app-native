import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type Typography = ReturnType<typeof useAppTheme>['typography'];

export type SortDirection = 'asc' | 'desc';

export interface SortOption<T extends string> {
    key: T;
    label: string;
}

interface SortChipsProps<T extends string> {
    options: SortOption<T>[];
    activeKey: T;
    direction: SortDirection;
    onChange: (key: T, direction: SortDirection) => void;
    /** 'bar' 會包一層帶背景與底部分隔線的容器（用於固定於頁面頂部的排序列） */
    variant?: 'bar' | 'plain';
}

export default function SortChips<T extends string>({
    options,
    activeKey,
    direction,
    onChange,
    variant = 'plain',
}: SortChipsProps<T>) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    const handlePress = (key: T) => {
        if (key === activeKey) {
            onChange(key, direction === 'asc' ? 'desc' : 'asc');
        } else {
            onChange(key, 'desc');
        }
    };

    const content = (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
        >
            {options.map((opt) => {
                const isActive = opt.key === activeKey;
                const isAsc = direction === 'asc';
                return (
                    <Pressable
                        key={opt.key}
                        onPress={() => handlePress(opt.key)}
                        style={[styles.chip, isActive && styles.chipActive]}
                        android_ripple={{
                            color: isActive ? 'rgba(255,255,255,0.2)' : colors.accent + '20',
                            borderless: false,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`依${opt.label}排序，${isActive ? (isAsc ? '升冪' : '降冪') : '點擊啟用'}`}
                    >
                        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                            {opt.label}
                        </Text>
                        {isActive ? (
                            <Ionicons
                                name={isAsc ? 'chevron-up' : 'chevron-down'}
                                size={14}
                                color={colors.textWhite}
                                style={styles.chipIcon}
                            />
                        ) : null}
                    </Pressable>
                );
            })}
        </ScrollView>
    );

    if (variant === 'bar') {
        return <View style={styles.bar}>{content}</View>;
    }
    return content;
}

const createStyles = (colors: AppColors, typography: Typography) =>
    StyleSheet.create({
        bar: {
            backgroundColor: colors.headerBg,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.cardBorder,
            paddingVertical: 10,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            gap: 8,
        },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            minHeight: 36,
            ...withContinuousRadius(RADIUS.chip),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            overflow: 'hidden',
            elevation: 1,
        },
        chipActive: {
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            elevation: 0,
        },
        chipText: {
            ...typography.chip,
            color: colors.textSecondary,
            includeFontPadding: false,
        },
        chipTextActive: {
            color: colors.textWhite,
        },
        chipIcon: {
            marginLeft: 4,
        },
    });
