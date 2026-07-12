import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type Typography = ReturnType<typeof useAppTheme>['typography'];

export interface MetaEntry {
    icon?: IoniconsName;
    text: string;
}

interface AccentListCardProps {
    /** 左側色條顏色，預設 accent */
    accentColor?: string;
    /** 標題（主要文字），未提供則不渲染 topRow，可改用 children */
    title?: string;
    /** 標題與金額之間的徽章（例如記錄頁的類別 badge） */
    titleBadge?: React.ReactNode;
    /** 尾端金額（已格式化字串） */
    amount?: string;
    /** 金額顏色，預設等於 accentColor */
    amountColor?: string;
    /** 底部 meta 資訊（icon + 文字） */
    meta?: MetaEntry[];
    /** meta 列尾端附加內容（例如記錄描述） */
    metaTrailing?: React.ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
    accessibilityLabel?: string;
    /** 額外覆蓋卡片外層樣式（例如 records 的 marginHorizontal） */
    style?: StyleProp<ViewStyle>;
    /** bottomRow 之後附加內容（例如 travel 的分佈條、日期列） */
    children?: React.ReactNode;
}

export default function AccentListCard({
    accentColor,
    title,
    titleBadge,
    amount,
    amountColor,
    meta,
    metaTrailing,
    onPress,
    onLongPress,
    accessibilityLabel,
    style,
    children,
}: AccentListCardProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const strip = accentColor ?? colors.accent;
    const amtColor = amountColor ?? strip;

    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            disabled={!onPress && !onLongPress}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={accessibilityLabel}
        >
            <View style={[styles.accentStrip, { backgroundColor: strip }]} />
            <View style={styles.cardContent}>
                {title !== undefined ? (
                    <View style={styles.topRow}>
                        <Text style={styles.title} numberOfLines={1}>{title}</Text>
                        {titleBadge}
                        {amount !== undefined ? (
                            <Text style={[styles.amount, { color: amtColor }]}>{amount}</Text>
                        ) : null}
                    </View>
                ) : null}

                {meta && meta.length > 0 ? (
                    <View style={styles.bottomRow}>
                        {meta.map((m, idx) => (
                            <View key={idx} style={styles.metaItem}>
                                {m.icon ? (
                                    <Ionicons name={m.icon} size={12} color={colors.textMuted} />
                                ) : null}
                                <Text style={styles.metaText}>{m.text}</Text>
                            </View>
                        ))}
                        {metaTrailing}
                    </View>
                ) : null}

                {children}
            </View>
        </Pressable>
    );
}

const createStyles = (colors: AppColors, typography: Typography) =>
    StyleSheet.create({
        card: {
            flexDirection: 'row',
            ...withContinuousRadius(RADIUS.md),
            marginBottom: 10,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            overflow: 'hidden',
            backgroundColor: colors.card,
            ...SHADOWS.sm,
        },
        cardPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
        accentStrip: { width: 4 },
        cardContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, paddingLeft: 12 },
        topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
        title: { ...typography.cardTitle, flex: 1 },
        amount: { ...typography.amount },
        bottomRow: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
        metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        metaText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    });
