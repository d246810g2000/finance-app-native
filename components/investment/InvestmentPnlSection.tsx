import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import SectionHeader from '../ui/SectionHeader';
import {
  InvestmentPnlRow,
  InvestmentPnlSplit,
  InvestmentPnlViewModel,
} from '../../viewModels/investmentPnlViewModel';

const TOP_ROW_COUNT = 4;

function formatDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`;
  }
  return value;
}

function formatMoney(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function formatPercent(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Taiwan market convention: gains red, losses green. */
function pnlColor(value: number, colors: AppColors): string {
  return value >= 0 ? colors.red : colors.green;
}

function splitColor(id: InvestmentPnlSplit['id'], colors: AppColors): string {
  if (id === 'profit') return colors.red;
  if (id === 'loss') return colors.green;
  return colors.divider;
}

const PnlRow = React.memo(function PnlRow({
  row,
  onPress,
  colors,
  styles,
}: {
  row: InvestmentPnlRow;
  onPress: (row: InvestmentPnlRow) => void;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const pnl = row.unrealizedPnl || 0;
  const marketValue = row.marketValue;
  const hasPrice = marketValue !== undefined;
  const accessibilityLabel = [
    `${row.name} ${row.symbol || ''}`,
    hasPrice
      ? `市值 ${formatMoney(marketValue)}`
      : '缺收盤價',
    `未實現損益 ${formatMoney(pnl, true)}`,
    row.unrealizedPnlPercent !== undefined
      ? `報酬率 ${formatPercent(row.unrealizedPnlPercent, true)}`
      : undefined,
  ].filter(Boolean).join('，');

  return (
    <Pressable
      onPress={() => onPress(row)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.rowIdentity}>
        <Text style={styles.rowName} numberOfLines={1}>
          {row.name}
          {row.symbol ? ` ${row.symbol}` : ''}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {row.shares.toLocaleString()} 股 ·{' '}
          {hasPrice
            ? `收盤 $${row.latestPrice?.toFixed(2)} · ${row.latestPriceDate ? formatDate(row.latestPriceDate) : '—'}`
            : '缺收盤價'}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          市值 {formatMoney(row.marketValue ?? row.displayValue)} · 成本 {formatMoney(row.totalCost)}
        </Text>
      </View>
      <View style={styles.rowValues}>
        <Text
          style={[styles.rowPnl, { color: hasPrice ? pnlColor(pnl, colors) : colors.yellow }]}
          selectable
        >
          {hasPrice ? formatMoney(pnl, true) : '—'}
        </Text>
        <Text
          style={[
            styles.rowSubPnl,
            {
              color: row.unrealizedPnlPercent === undefined
                ? colors.textMuted
                : pnlColor(row.unrealizedPnlPercent, colors),
            },
          ]}
        >
          {row.unrealizedPnlPercent === undefined
            ? '無法評價'
            : formatPercent(row.unrealizedPnlPercent, true)}
        </Text>
        {row.dayChange !== undefined ? (
          <Text
            style={[styles.rowDayChange, { color: pnlColor(row.dayChange, colors) }]}
            numberOfLines={1}
          >
            今日 {formatMoney(row.dayChange, true)}
            {row.dayChangePercent !== undefined
              ? ` · ${formatPercent(row.dayChangePercent, true)}`
              : ''}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
});

interface InvestmentPnlSectionProps {
  data: InvestmentPnlViewModel;
  onSelectRow: (row: InvestmentPnlRow) => void;
  onOpenHoldings: () => void;
  onOpenMissingPrices: () => void;
}

export default function InvestmentPnlSection({
  data,
  onSelectRow,
  onOpenHoldings,
  onOpenMissingPrices,
}: InvestmentPnlSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { summary, splits, topRows, rows } = data;
  const visibleSplits = splits.filter(split => split.value > 0);
  const hasPricedHoldings = summary.missingPriceCount < rows.length;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="未實現損益"
        accent={colors.red}
        trailing={(
          <Pressable onPress={onOpenHoldings} hitSlop={8}>
            <Text style={styles.trailing}>
              全部持股 · {rows.length} 檔
            </Text>
          </Pressable>
        )}
      />

      <View style={[styles.panel, { borderColor: colors.outlineVariant }]}>
        <View style={styles.headline}>
          <View style={styles.headlineMain}>
            <Text style={styles.headlineLabel}>目前未實現</Text>
            <Text
              style={[styles.headlineValue, { color: pnlColor(summary.unrealizedPnl, colors) }]}
              selectable
            >
              {formatMoney(summary.unrealizedPnl, true)}
            </Text>
            <Text style={styles.headlineMeta}>
              報酬率 {formatPercent(summary.unrealizedPnlPercent, true)} · 市值 {formatMoney(summary.marketValue)}
            </Text>
          </View>
          <View style={styles.headlineBadge}>
            <Text style={styles.headlineBadgeValue}>{rows.length}</Text>
            <Text style={styles.headlineBadgeLabel}>檔持股</Text>
          </View>
        </View>

        {hasPricedHoldings ? (
          <>
            <View style={styles.splitBar}>
              {visibleSplits.map(split => (
                <View
                  key={split.id}
                  style={[styles.splitFill, {
                    width: `${split.weight}%`,
                    backgroundColor: splitColor(split.id, colors),
                  }]}
                />
              ))}
            </View>
            <View style={styles.splitLegend}>
              {splits.map(split => (
                <View key={split.id} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: splitColor(split.id, colors) }]} />
                  <Text style={styles.legendText}>
                    {split.label} {formatPercent(split.weight)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>目前沒有可評價持股。</Text>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>獲利</Text>
            <Text style={[styles.statValue, { color: colors.red }]}>
              {summary.profitCount} 檔
            </Text>
            <Text style={[styles.statMeta, { color: colors.red }]} selectable>
              {formatMoney(summary.profitPnl, true)}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>虧損</Text>
            <Text style={[styles.statValue, { color: colors.green }]}>
              {summary.lossCount} 檔
            </Text>
            <Text style={[styles.statMeta, { color: colors.green }]} selectable>
              {formatMoney(summary.lossPnl, true)}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>平盤</Text>
            <Text style={styles.statValue}>{summary.flatCount} 檔</Text>
            <Text style={styles.statMeta}>{formatMoney(summary.flatMarketValue)}</Text>
          </View>
        </View>

        <View style={styles.rowDivider} />

        {topRows.length === 0 ? (
          <Text style={styles.emptyText}>沒有可計算未實現損益的持股。</Text>
        ) : (
          <View style={styles.rowList}>
            {topRows.map(row => (
              <PnlRow
                key={row.id}
                row={row}
                onPress={onSelectRow}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        )}

        {summary.missingPriceCount > 0 ? (
          <Pressable
            onPress={onOpenMissingPrices}
            style={({ pressed }) => [styles.missingButton, pressed && styles.missingButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={`缺收盤價 ${summary.missingPriceCount} 檔，查看明細`}
          >
            <Ionicons name="alert-circle-outline" size={16} color={colors.yellow} />
            <Text style={styles.missingText}>
              缺收盤價 {summary.missingPriceCount} 檔，未計入損益
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {rows.length > TOP_ROW_COUNT ? (
          <Pressable
            onPress={onOpenHoldings}
            style={({ pressed }) => [styles.allButton, pressed && styles.allButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={`查看全部持股 ${rows.length} 檔`}
          >
            <Text style={styles.allText}>查看全部 · {rows.length} 檔</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onOpenHoldings}
            style={({ pressed }) => [styles.allButton, pressed && styles.allButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={`查看全部持股 ${rows.length} 檔`}
          >
            <Text style={styles.allText}>查看全部持股</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { marginTop: 14 },
  trailing: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  panel: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    ...withContinuousRadius(RADIUS.sm),
    padding: 12,
    gap: 12,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headlineMain: { flex: 1, minWidth: 0 },
  headlineLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  headlineValue: {
    marginTop: 3,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  headlineMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  headlineBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceVariant,
    ...withContinuousRadius(RADIUS.sm),
  },
  headlineBadgeValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  headlineBadgeLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  splitBar: {
    flexDirection: 'row',
    height: 10,
    overflow: 'hidden',
    backgroundColor: colors.divider,
    ...withContinuousRadius(RADIUS.full),
  },
  splitFill: { height: '100%' },
  splitLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    ...withContinuousRadius(RADIUS.full),
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.surfaceVariant,
    ...withContinuousRadius(RADIUS.sm),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    backgroundColor: colors.outlineVariant,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  statValue: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    color: colors.onSurface,
  },
  statMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
  rowList: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingVertical: 7,
  },
  rowPressed: { opacity: 0.72 },
  rowIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  rowMeta: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  rowValues: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rowPnl: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rowSubPnl: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowDayChange: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  missingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceVariant,
    ...withContinuousRadius(RADIUS.xs),
  },
  missingButtonPressed: { backgroundColor: colors.statePressed },
  missingText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  allButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 40,
  },
  allButtonPressed: { opacity: 0.72 },
  allText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
