import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';

interface InvestmentDrillHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  colors: AppColors;
}

/** Inline drill-down header used when leaving overview for a list panel. */
export default function InvestmentDrillHeader({
  title,
  subtitle,
  onBack,
  colors,
}: InvestmentDrillHeaderProps) {
  const styles = createStyles(colors);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}
        accessibilityRole="button"
        accessibilityLabel="返回總覽"
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>總覽</Text>
      </Pressable>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceVariant,
    ...withContinuousRadius(RADIUS.full),
  },
  backPressed: { opacity: 0.75 },
  backText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
});
