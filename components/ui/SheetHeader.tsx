import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { AppColors, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';

type Typography = ReturnType<typeof useAppTheme>['typography'];

interface SheetHeaderProps {
    title: string;
    subtitle?: string;
    onClose?: () => void;
    closeLabel?: string;
    /** 自訂右側內容（提供時取代預設關閉鈕） */
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
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
            backgroundColor: colors.card,
        },
        textCol: { flex: 1 },
        title: { ...typography.h3, letterSpacing: -0.3 },
        subtitle: { ...typography.caption, marginTop: 4 },
        closeBtn: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: colors.accentLight,
            ...withContinuousRadius(16),
            borderWidth: 1,
            borderColor: colors.accentBorder,
        },
        closeBtnPressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
        closeBtnText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
    });
