import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle, type ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type Typography = ReturnType<typeof useAppTheme>['typography'];

export interface MetaEntry {
    icon?: IoniconsName;
    text: string;
}

interface AccentListCardProps {
    /** 左側色條顏色，預設 primary */
    accentColor?: ColorValue;
    title?: string;
    titleBadge?: React.ReactNode;
    amount?: string;
    amountColor?: ColorValue;
    meta?: MetaEntry[];
    metaTrailing?: React.ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}

export default memo(function AccentListCard({
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
    const strip = accentColor ?? colors.primary;
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
                            <Text style={[styles.amount, { color: amtColor }]} selectable>{amount}</Text>
                        ) : null}
                    </View>
                ) : null}

                {meta && meta.length > 0 ? (
                    <View style={styles.bottomRow}>
                        {meta.map((m, idx) => (
                            <View key={m.icon ? `${m.icon}-${m.text}` : `${m.text}-${idx}`} style={styles.metaItem}>
                                {m.icon ? (
                                    <Ionicons name={m.icon} size={12} color={colors.onSurfaceVariant} />
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
});

const createStyles = (colors: AppColors, typography: Typography) =>
    StyleSheet.create({
        card: {
            flexDirection: 'row',
            ...withContinuousRadius(RADIUS.sm),
            minHeight: 56,
            marginBottom: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.outlineVariant,
            overflow: 'hidden',
            backgroundColor: colors.surfaceContainer,
        },
        cardPressed: {
            backgroundColor: colors.surfaceVariant,
        },
        accentStrip: { width: 3 },
        cardContent: {
            flex: 1,
            paddingVertical: 14,
            paddingHorizontal: 14,
            paddingLeft: 12,
            justifyContent: 'center',
            gap: 6,
        },
        topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
        title: { ...typography.cardTitle, flex: 1 },
        amount: { ...typography.amount, fontSize: 16 },
        bottomRow: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
        metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        metaText: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
    });
