import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type Typography = ReturnType<typeof useAppTheme>['typography'];

interface SheetHeaderProps {
    title: string;
    subtitle?: string;
    onClose?: () => void;
    closeLabel?: string;
    trailing?: React.ReactNode;
    titleNumberOfLines?: number;
    style?: StyleProp<ViewStyle>;
}

/**
 * 底部彈窗共用頭部：左側標題 / 副標題 + 右側關閉鈕，底部帶分隔線。
 */
export default function SheetHeader({
    title,
    subtitle,
    onClose,
    closeLabel = '關閉',
    trailing,
    titleNumberOfLines = 1,
    style,
}: SheetHeaderProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

    return (
        <View style={[styles.header, style]}>
            <View style={styles.textCol}>
                <Text style={styles.title} numberOfLines={titleNumberOfLines}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {trailing ?? (onClose ? (
                <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={closeLabel}
                    hitSlop={8}
                >
                    <Text style={styles.closeBtnText}>{closeLabel}</Text>
                </Pressable>
            ) : null)}
        </View>
    );
}

const createStyles = (colors: AppColors, typography: Typography) =>
    StyleSheet.create({
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 16,
            gap: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.outlineVariant,
            backgroundColor: colors.surfaceContainer,
            minHeight: 56,
        },
        textCol: { flex: 1, gap: 2 },
        title: { ...typography.titleMedium, fontSize: 18, fontWeight: '700' },
        subtitle: { ...typography.labelMedium },
        closeBtn: {
            minHeight: 40,
            paddingHorizontal: 16,
            paddingVertical: 8,
            justifyContent: 'center',
            backgroundColor: colors.primaryContainer,
            ...withContinuousRadius(RADIUS.full),
        },
        closeBtnPressed: { opacity: 0.85 },
        closeBtnText: { color: colors.onPrimaryContainer, fontWeight: '700', fontSize: 14 },
    });
