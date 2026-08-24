import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import SectionHeader from '../ui/SectionHeader';
import type { CurrentHolding } from '../../services/portfolioService';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

interface InvestmentTimelineSectionProps {
  holdings: CurrentHolding[];
  onOpenHolding: (holding: CurrentHolding) => void;
}

export default function InvestmentTimelineSection({
  holdings,
  onOpenHolding,
}: InvestmentTimelineSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (holdings.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="目前投資資產" accent={colors.primary} style={styles.sectionHeader} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardScroll}
      >
        {holdings.map(holding => (
          <Pressable
            key={holding.id}
            style={styles.card}
            onPress={() => onOpenHolding(holding)}
            accessibilityRole="button"
            accessibilityLabel={`${holding.name}，目前市值 ${holding.displayValue} 元`}
          >
            <Text style={styles.cardName} numberOfLines={1}>
              {holding.name}{holding.symbol ? ` ${holding.symbol}` : ''}
            </Text>
            <Text style={styles.cardAmount}>
              {formatMoney(holding.displayValue)}
            </Text>
            <Text style={styles.cardMeta}>
              {holding.shares.toLocaleString()} 股 ·{' '}
              {holding.latestPrice ? `@$${formatMoney(holding.latestPrice)}` : '無報價'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { marginTop: 4 },
  sectionHeader: { marginBottom: 2 },
  cardScroll: { gap: 10, paddingTop: 8, paddingBottom: 4 },
  card: {
    minWidth: 112,
    backgroundColor: colors.surfaceContainer,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    minHeight: 88,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  cardMeta: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
});
