import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StockPosition, StockRealizedTrade } from '../../services/portfolioService';
import { StockOwnership, StockTrade } from '../../services/stockTradeService';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { InvestmentPnlRow } from '../../viewModels/investmentPnlViewModel';
import RealizedTradesTable from './RealizedTradesTable';
import StockTradesTable from './StockTradesTable';
import { formatQuotePrice } from './investmentTablePrimitives';

export function buildPositionDetailFromHolding(
  holding: InvestmentPnlRow,
  positions: StockPosition[],
  filteredTrades: StockTrade[],
  realizedTrades: StockRealizedTrade[],
) {
  const relatedPositions = positions.filter(position => (
    (position.symbol || `name:${position.name}`) === holding.id
  ));
  const matchesHolding = (item: { name: string; symbol?: string }) => (
    holding.symbol ? item.symbol === holding.symbol : item.name === holding.name
  );
  const ownership: StockOwnership = relatedPositions.every(position => position.ownership === 'shared')
    ? 'shared'
    : 'personal';

  const position: StockPosition = {
    id: holding.id,
    name: holding.name,
    symbol: holding.symbol,
    account: relatedPositions.length === 1
      ? relatedPositions[0].account
      : `${relatedPositions.length} 個帳戶`,
    ownership,
    shares: holding.shares,
    averageCost: holding.averageCost,
    totalCost: holding.totalCost,
    latestPrice: holding.latestPrice,
    latestPriceDate: holding.latestPriceDate,
    marketValue: holding.marketValue,
    unrealizedPnl: holding.unrealizedPnl,
    unrealizedPnlPercent: holding.totalCost > 0 && holding.unrealizedPnl !== undefined
      ? (holding.unrealizedPnl / holding.totalCost) * 100
      : undefined,
  };

  return {
    position,
    buys: filteredTrades.filter(trade => trade.side === 'buy' && matchesHolding(trade)),
    sells: realizedTrades.filter(matchesHolding),
    pnlMetrics: holding,
  };
}

function formatMoney(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function formatPercent(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function pnlColor(value: number, colors: AppColors): string {
  return value >= 0 ? colors.red : colors.green;
}

interface PositionDetailPanelProps {
  position: StockPosition;
  buys: StockTrade[];
  sells: StockRealizedTrade[];
  pnlMetrics?: InvestmentPnlRow;
}

export default function PositionDetailPanel({
  position,
  buys,
  sells,
  pnlMetrics,
}: PositionDetailPanelProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const unrealized = position.unrealizedPnl ?? 0;
  const unrealizedColor = position.unrealizedPnl === undefined
    ? colors.textMuted
    : pnlColor(unrealized, colors);
  const dayChange = pnlMetrics?.dayChange;
  const dayChangePercent = pnlMetrics?.dayChangePercent;
  const dayColor = dayChange === undefined ? colors.textMuted : pnlColor(dayChange, colors);

  return (
    <View style={styles.root}>
      <View style={styles.quoteBoard}>
        <View style={styles.quoteIdentity}>
          <Text style={styles.quoteSymbol}>{position.symbol || '—'}</Text>
          <Text style={styles.quoteName} numberOfLines={1}>{position.name}</Text>
        </View>
        <Text style={styles.quotePrice} selectable>
          {position.latestPrice !== undefined ? formatQuotePrice(position.latestPrice) : '—'}
        </Text>
        <Text style={[styles.quoteDayChange, { color: dayColor }]}>
          {dayChange === undefined
            ? '今日 —'
            : `${formatMoney(dayChange, true)} ${dayChangePercent !== undefined ? `(${formatPercent(dayChangePercent, true)})` : ''}`}
        </Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>股數</Text>
            <Text style={styles.metricValue}>{position.shares.toLocaleString()}</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>均價</Text>
            <Text style={styles.metricValue}>${position.averageCost.toFixed(2)}</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>市值</Text>
            <Text style={styles.metricValue}>
              {position.marketValue === undefined ? '—' : formatMoney(position.marketValue)}
            </Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>成本</Text>
            <Text style={styles.metricValue}>{formatMoney(position.totalCost)}</Text>
          </View>
        </View>
        <View style={styles.pnlStrip}>
          <Text style={styles.pnlStripLabel}>未實現損益</Text>
          <Text style={[styles.pnlStripValue, { color: unrealizedColor }]} selectable>
            {position.unrealizedPnl === undefined
              ? '—'
              : `${formatMoney(position.unrealizedPnl, true)}${position.unrealizedPnlPercent !== undefined ? ` (${formatPercent(position.unrealizedPnlPercent, true)})` : ''}`}
          </Text>
        </View>
        <Text style={styles.quoteAccount} numberOfLines={1}>{position.account}</Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>庫存明細 · {buys.length} 筆</Text>
        <View style={styles.tablePanel}>
          <StockTradesTable
            variant="position"
            trades={buys}
            emptyMessage="尚無買入紀錄。"
          />
        </View>
      </View>

      {sells.length > 0 ? (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>賣出／股息明細 · {sells.length} 筆</Text>
          <View style={styles.tablePanel}>
            <RealizedTradesTable
              variant="position"
              trades={sells}
              emptyMessage="尚無賣出或股息紀錄。"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { gap: 14 },
  quoteBoard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    padding: 14,
    gap: 6,
    ...withContinuousRadius(RADIUS.md),
  },
  quoteIdentity: { gap: 2 },
  quoteSymbol: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  quoteName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  quotePrice: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  quoteDayChange: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricsGrid: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  metricCell: { flex: 1, alignItems: 'center', gap: 2 },
  metricLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  pnlStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  pnlStripLabel: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant },
  pnlStripValue: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  quoteAccount: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sectionBlock: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.onSurfaceVariant },
  tablePanel: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.sm),
    overflow: 'hidden',
  },
});
