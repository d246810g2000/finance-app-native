import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';

interface InvestmentDrillHeaderProps {
  title: string;
  onBack: () => void;
  colors: AppColors;
  trailing?: string;
}

/** Inline drill-down header used when leaving overview for a list panel. */
export default function InvestmentDrillHeader({
  title,
  onBack,
  colors,
  trailing,
}: InvestmentDrillHeaderProps) {
  const styles = createStyles(colors);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}
        accessibilityRole="button"
        accessibilityLabel="返回總覽"
        hitSlop={6}
      >
        <Ionicons name="chevron-back" size={22} color={colors.primary} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {trailing ? <Text style={styles.trailing} numberOfLines={1}>{trailing}</Text> : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceVariant,
    ...withContinuousRadius(RADIUS.full),
  },
  backPressed: { opacity: 0.75 },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '800',
    color: colors.onSurface,
  },
  trailing: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
