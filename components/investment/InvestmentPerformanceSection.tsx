import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import SegmentedControl from '../ui/SegmentedControl';
import {
  INVESTMENT_PERFORMANCE_PERIODS,
  InvestmentPerformancePeriodId,
  InvestmentPerformanceRow,
  InvestmentPerformanceViewModel,
} from '../../viewModels/investmentPerformanceViewModel';

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

function pnlColor(value: number, colors: AppColors): string {
  return value >= 0 ? colors.red : colors.green;
}

const PerformanceRow = React.memo(function PerformanceRow({
  row,
  onPress,
  colors,
  styles,
}: {
  row: InvestmentPerformanceRow;
  onPress: (row: InvestmentPerformanceRow) => void;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const changePercent = row.changePercent;
  const available = changePercent !== undefined;
  const change = row.marketValueChange || 0;
  const accessibilityLabel = [
    `${row.name} ${row.symbol || ''}`,
    available
      ? `期間變化 ${formatPercent(changePercent, true)}，${formatMoney(change, true)}`
      : '缺歷史收盤價',
  ].join('，');

  return (
    <Pressable
      onPress={() => onPress(row)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {row.name}
          {row.symbol ? ` ${row.symbol}` : ''}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {available
            ? `${row.shares.toLocaleString()} 股 · $${row.baselinePrice?.toFixed(2)} → $${row.currentPrice?.toFixed(2)}`
            : `${row.shares.toLocaleString()} 股 · 缺歷史收盤價`}
        </Text>
        {available && row.baselineDate && row.currentDate ? (
          <Text style={styles.dateRange} numberOfLines={1}>
            {formatDate(row.baselineDate)} → {formatDate(row.currentDate)}
          </Text>
        ) : null}
      </View>
      <Text
        style={[styles.value, { color: available ? pnlColor(change, colors) : colors.yellow }]}
        selectable
      >
        {available ? formatPercent(changePercent, true) : '—'}
      </Text>
      <Text
        style={[styles.subValue, { color: available ? pnlColor(change, colors) : colors.textMuted }]}
        selectable
      >
        {available ? formatMoney(change, true) : '無法評價'}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
});

interface InvestmentPerformanceSectionProps {
  data: InvestmentPerformanceViewModel;
  period: InvestmentPerformancePeriodId;
  onPeriodChange: (period: InvestmentPerformancePeriodId) => void;
  onSelectRow: (row: InvestmentPerformanceRow) => void;
  onOpenHoldings: () => void;
}

export default function InvestmentPerformanceSection({
  data,
  period,
  onPeriodChange,
  onSelectRow,
  onOpenHoldings,
}: InvestmentPerformanceSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { summary, topRows, rows } = data;
  const hasData = rows.length > 0;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>期間表現</Text>
        <Pressable onPress={onOpenHoldings} hitSlop={8}>
          <Text style={styles.trailing}>全部持股 · {rows.length} 檔</Text>
        </Pressable>
      </View>

      <View style={[styles.panel, { borderColor: colors.outlineVariant }]}>
        <SegmentedControl
          fullWidth
          value={period}
          onChange={onPeriodChange}
          options={INVESTMENT_PERFORMANCE_PERIODS.map(option => ({
            value: option.id,
            label: option.label,
          }))}
          accessibilityLabel="選擇期間表現"
        />

        {!hasData ? (
          <Text style={styles.emptyText}>尚無可評估持股。</Text>
        ) : (
          <>
            <View style={styles.summary}>
              <View style={styles.summaryMain}>
                <Text style={styles.summaryLabel}>{data.periodLabel}市值變化</Text>
                <Text
                  style={[styles.summaryValue, { color: pnlColor(summary.marketValueChange, colors) }]}
                  selectable
                >
                  {formatMoney(summary.marketValueChange, true)}
                </Text>
                <Text style={styles.summaryMeta}>
                  {formatPercent(summary.changePercent, true)}
                  {' · '}
                  {summary.availableCount}/{rows.length} 檔可評價
                </Text>
              </View>
              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeValue}>{formatMoney(summary.currentMarketValue)}</Text>
                <Text style={styles.summaryBadgeLabel}>目前市值</Text>
              </View>
            </View>

            <View style={styles.rowDivider} />

            {topRows.length === 0 ? (
              <Text style={styles.emptyText}>這個期間缺少可比較收盤價。</Text>
            ) : (
              <View style={styles.rowList}>
                {topRows.map(row => (
                  <PerformanceRow
                    key={row.id}
                    row={row}
                    onPress={onSelectRow}
                    colors={colors}
                    styles={styles}
                  />
                ))}
              </View>
            )}

            {summary.unavailableCount > 0 ? (
              <View style={styles.notice}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.yellow} />
                <Text style={styles.noticeText}>
                  {summary.unavailableCount} 檔缺少期間基準價
                </Text>
              </View>
            ) : null}
          </>
        )}

        <Text style={styles.note}>
          以目前持股與歷史收盤估算，未調整期間買賣與股利。
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { marginTop: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onSurface,
  },
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
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  summaryValue: {
    marginTop: 3,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  summaryMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  summaryBadge: {
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surfaceVariant,
    ...withContinuousRadius(RADIUS.sm),
  },
  summaryBadgeValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  summaryBadgeLabel: {
    marginTop: 2,
    fontSize: 10,
    color: colors.textMuted,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
  rowList: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingVertical: 6,
  },
  rowPressed: { opacity: 0.72 },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  meta: {
    marginTop: 2,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  dateRange: {
    marginTop: 1,
    fontSize: 10,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  value: {
    minWidth: 68,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  subValue: {
    minWidth: 68,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
