import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, RADIUS, SHADOWS, withContinuousRadius } from '../../theme';
import { InvestmentPnlRow } from '../../viewModels/investmentPnlViewModel';
import {
  formatQuotePrice,
  formatTableMoney,
  formatTablePercent,
  tablePnlColor,
} from './investmentTablePrimitives';

const TILE_GAP = 10;
const HORIZONTAL_GUTTER = 32;

interface HoldingsPickGridProps {
  rows: InvestmentPnlRow[];
  onSelect: (row: InvestmentPnlRow) => void;
}

function HoldingTile({
  row,
  colors,
  styles,
  tileWidth,
  onPress,
}: {
  row: InvestmentPnlRow;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
  tileWidth: number;
  onPress: () => void;
}) {
  const pnl = row.unrealizedPnl ?? 0;
  const hasPrice = row.marketValue !== undefined;
  const pnlColor = hasPrice ? tablePnlColor(pnl, colors) : colors.yellow;
  const pnlAmount = hasPrice ? formatTableMoney(pnl, true) : '無法評價';
  const pnlPercent = hasPrice && row.unrealizedPnlPercent !== undefined
    ? formatTablePercent(row.unrealizedPnlPercent, true)
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { width: tileWidth },
        pressed && styles.tilePressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${row.name} ${row.symbol || ''} ${pnlAmount} ${pnlPercent || ''}`}
    >
      <View style={styles.leftCol}>
        <Text style={styles.tileSymbol} numberOfLines={1}>
          {row.symbol || '—'}
        </Text>
        <Text style={styles.tileName} numberOfLines={1}>{row.name}</Text>
      </View>
      <View style={styles.rightCol}>
        <Text style={styles.tilePrice} numberOfLines={1}>
          {hasPrice ? formatQuotePrice(row.latestPrice) : '—'}
        </Text>
        <Text style={[styles.tilePnlAmount, { color: pnlColor }]} numberOfLines={1}>
          {pnlAmount}
        </Text>
        {pnlPercent ? (
          <Text style={[styles.tilePnlPercent, { color: pnlColor }]} numberOfLines={1}>
            {pnlPercent}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** 券商自選股方格：左標的、右報價與損益，2×N 獨立卡片。 */
export default function HoldingsPickGrid({ rows, onSelect }: HoldingsPickGridProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = Math.floor((windowWidth - HORIZONTAL_GUTTER - TILE_GAP) / 2);

  if (rows.length === 0) {
    return <Text style={styles.emptyText}>沒有可計算未實現損益的持股。</Text>;
  }

  return (
    <View style={styles.grid}>
      {rows.map(row => (
        <HoldingTile
          key={row.id}
          row={row}
          colors={colors}
          styles={styles}
          tileWidth={tileWidth}
          onPress={() => onSelect(row)}
        />
      ))}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    minHeight: 88,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.md),
    ...SHADOWS.sm,
  },
  tilePressed: {
    backgroundColor: colors.surfaceVariant,
    opacity: 0.92,
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 3,
  },
  rightCol: {
    width: '46%',
    maxWidth: 120,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  tileSymbol: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  tileName: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  tilePrice: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  tilePnlAmount: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  tilePnlPercent: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  emptyText: {
    paddingVertical: 20,
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
});
