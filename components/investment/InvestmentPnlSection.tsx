import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-gifted-charts';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import SectionHeader from '../ui/SectionHeader';
import {
  InvestmentPnlRow,
  InvestmentPnlSplit,
  InvestmentPnlViewModel,
} from '../../viewModels/investmentPnlViewModel';

const TOP_ROW_COUNT = 5;
type SortKey = 'name' | 'dayChange' | 'latestPrice' | 'unrealizedPnl' | 'shares' | 'averageCost' | 'marketValue' | 'return5d' | 'return20d' | 'returnYtd' | 'dividendIncome';
type SortDirection = 'asc' | 'desc';

function formatMoney(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function formatPercent(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function sortValue(row: InvestmentPnlRow, key: SortKey): number | string {
  if (key === 'name') return row.name;
  if (key === 'dayChange') return row.dayChange ?? Number.NEGATIVE_INFINITY;
  if (key === 'latestPrice') return row.latestPrice ?? Number.NEGATIVE_INFINITY;
  if (key === 'unrealizedPnl') return row.unrealizedPnl ?? Number.NEGATIVE_INFINITY;
  if (key === 'shares') return row.shares;
  if (key === 'averageCost') return row.averageCost;
  if (key === 'marketValue') return row.marketValue ?? Number.NEGATIVE_INFINITY;
  return row[key] ?? Number.NEGATIVE_INFINITY;
}

function formatQuotePrice(value?: number): string {
  if (value === undefined) return '—';
  const absolute = Math.abs(value);
  if (absolute >= 1000) return Math.round(value).toLocaleString();
  if (absolute >= 100) return value.toFixed(1);
  if (absolute >= 10) return value.toFixed(2);
  return value.toFixed(3);
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

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  styles,
  wide = false,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  styles: ReturnType<typeof createStyles>;
  wide?: boolean;
}) {
  const active = activeKey === sortKey;
  return (
    <Pressable
      onPress={() => onSort(sortKey)}
      style={[styles.tableHeaderCell, wide && styles.frozenHeaderSortButton]}
      accessibilityRole="button"
      accessibilityLabel={`${label}，${active ? direction === 'asc' ? '升冪' : '降冪' : '未排序'}`}
    >
      <Text style={styles.tableHeaderLabel}>{label}</Text>
      <Ionicons
        name={active ? direction === 'asc' ? 'caret-up' : 'caret-down' : 'swap-vertical-outline'}
        size={11}
        color={active ? styles.tableHeaderActive.color : styles.tableHeaderLabel.color}
      />
    </Pressable>
  );
}

const PnlFrozenCell = React.memo(function PnlFrozenCell({
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

  return (
    <Pressable
      onPress={() => onPress(row)}
      style={({ pressed }) => [styles.frozenCell, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${row.name} ${row.symbol || ''}，${hasPrice ? `市值 ${formatMoney(marketValue)}` : '缺收盤價'}，損益 ${formatMoney(pnl, true)}`}
    >
      <View style={styles.frozenIdentity}>
        <Text style={styles.rowStatus}>現股</Text>
        <Text style={styles.rowName} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.rowSymbol} numberOfLines={1}>{row.symbol || '待補股號'}</Text>
      </View>
    </Pressable>
  );
});

const PnlTableRow = React.memo(function PnlTableRow({
  row,
  colors,
  styles,
  totalMarketValue,
}: {
  row: InvestmentPnlRow;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
  totalMarketValue: number;
}) {
  const pnl = row.unrealizedPnl || 0;
  const hasPrice = row.marketValue !== undefined;
  const valueColor = hasPrice ? pnlColor(pnl, colors) : colors.yellow;

  return (
    <View style={styles.tableRow}>
      <View style={styles.tableCell}>
        <Text style={[styles.tableValue, { color: row.dayChange === undefined ? colors.textMuted : pnlColor(row.dayChange, colors) }]} numberOfLines={1}>
          {row.dayChange === undefined ? '—' : formatMoney(row.dayChange, true)}
        </Text>
        <Text style={[styles.tableSubValue, { color: row.dayChangePercent === undefined ? colors.textMuted : pnlColor(row.dayChangePercent, colors) }]} numberOfLines={1}>
          {row.dayChangePercent === undefined ? '今日' : formatPercent(row.dayChangePercent, true)}
        </Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableValue} numberOfLines={1}>{formatQuotePrice(row.latestPrice)}</Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={[styles.tableValue, { color: valueColor }]} numberOfLines={1}>{hasPrice ? formatMoney(pnl, true) : '—'}</Text>
        <Text style={[styles.tableSubValue, { color: row.unrealizedPnlPercent === undefined ? colors.textMuted : pnlColor(row.unrealizedPnlPercent, colors) }]} numberOfLines={1}>
          {row.unrealizedPnlPercent === undefined ? '無法評價' : formatPercent(row.unrealizedPnlPercent, true)}
        </Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableValue} numberOfLines={1}>{row.shares.toLocaleString()}</Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableValue} numberOfLines={1}>{formatMoney(row.averageCost)}</Text>
        <Text style={styles.tableSubValue} numberOfLines={1}>{formatMoney(row.totalCost)}</Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableValue} numberOfLines={1}>{hasPrice ? formatMoney(row.marketValue ?? 0) : '—'}</Text>
        <Text style={styles.tableSubValue}>{hasPrice && totalMarketValue > 0 ? formatPercent(((row.marketValue || 0) / totalMarketValue) * 100) : '—'}</Text>
      </View>
      {(['return5d', 'return20d', 'returnYtd'] as const).map(key => (
        <View key={key} style={styles.tableCell}>
          <Text style={[styles.tableValue, { color: row[key] === undefined ? colors.textMuted : pnlColor(row[key] || 0, colors) }]} numberOfLines={1}>
            {row[key] === undefined ? '—' : formatPercent(row[key], true)}
          </Text>
        </View>
      ))}
      <View style={styles.tableCell}>
        <Text style={[styles.tableValue, { color: row.dividendIncome ? colors.red : colors.textMuted }]} numberOfLines={1}>
          {formatMoney(row.dividendIncome || 0, true)}
        </Text>
      </View>
    </View>
  );
});

interface InvestmentPnlSectionProps {
  data: InvestmentPnlViewModel;
  onSelectRow: (row: InvestmentPnlRow) => void;
  onOpenMissingPrices: () => void;
}

export default function InvestmentPnlSection({
  data,
  onSelectRow,
  onOpenMissingPrices,
}: InvestmentPnlSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { summary, splits, topRows, rows } = data;
  const [showAllRows, setShowAllRows] = useState(false);
  const visibleRows = showAllRows ? rows : topRows;
  const todayPnl = rows.reduce((total, row) => total + (row.dayChange || 0), 0);
  const todayBase = summary.marketValue - todayPnl;
  const todayPnlPercent = todayBase > 0 ? (todayPnl / todayBase) * 100 : 0;
  const [expandedSummary, setExpandedSummary] = useState<'pnl' | 'value' | null>(null);
  const allocationRows = rows
    .filter(row => row.marketValue !== undefined && row.marketValue > 0)
    .sort((left, right) => (right.marketValue || 0) - (left.marketValue || 0));
  const allocationColors = [colors.blue, colors.yellow, colors.red, colors.green, colors.primary];
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = sortValue(left, sortKey);
      const rightValue = sortValue(right, sortKey);
      const comparison = typeof leftValue === 'string' && typeof rightValue === 'string'
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [rows, sortDirection, sortKey]);
  const tableRows = showAllRows
    ? sortedRows
    : sortKey
      ? sortedRows.slice(0, TOP_ROW_COUNT)
      : visibleRows;
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'name' ? 'asc' : 'desc');
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader
        title="庫存"
        accent={colors.red}
      />

      <View style={[styles.panel, { borderColor: colors.outlineVariant }]}>
        <View style={styles.summaryMetrics}>
          <View style={styles.summaryMetric}>
            <Text style={styles.metricLabel}>今日損益</Text>
            <Text style={[styles.metricValue, { color: pnlColor(todayPnl, colors) }]} numberOfLines={1}>
              {formatMoney(todayPnl, true)}
            </Text>
            <Text style={[styles.metricPercent, { color: pnlColor(todayPnl, colors) }]}>
              {formatPercent(todayPnlPercent, true)}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.summaryMetric}>
            <View style={styles.metricTitleRow}>
              <Text style={styles.metricLabel}>累積損益</Text>
              <Pressable
                onPress={() => setExpandedSummary(expandedSummary === 'pnl' ? null : 'pnl')}
                style={styles.metricToggle}
                accessibilityRole="button"
                accessibilityLabel="展開累積損益明細"
              >
                <Ionicons name={expandedSummary === 'pnl' ? 'chevron-up' : 'pie-chart-outline'} size={14} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.metricValue, { color: pnlColor(summary.unrealizedPnl, colors) }]} numberOfLines={1}>
              {formatMoney(summary.unrealizedPnl, true)}
            </Text>
            <Text style={[styles.metricPercent, { color: pnlColor(summary.unrealizedPnl, colors) }]}>
              {formatPercent(summary.unrealizedPnlPercent, true)}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.summaryMetric}>
            <View style={styles.metricTitleRow}>
              <Text style={styles.metricLabel}>股票市值</Text>
              <Pressable
                onPress={() => setExpandedSummary(expandedSummary === 'value' ? null : 'value')}
                style={styles.metricToggle}
                accessibilityRole="button"
                accessibilityLabel="展開股票市值配置"
              >
                <Ionicons name={expandedSummary === 'value' ? 'chevron-up' : 'pie-chart-outline'} size={14} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.metricValue} numberOfLines={1}>{formatMoney(summary.marketValue)}</Text>
            <Text style={styles.metricPercent}>成本 {formatMoney(summary.evaluatedCost)}</Text>
          </View>
        </View>

        {expandedSummary === 'pnl' ? (
          <View style={[styles.expandedSummary, styles.pnlDistribution]}>
            <View style={styles.pnlChartColumn}>
              <PieChart
                data={splits.filter(split => split.id !== 'flat' && split.value > 0).map(split => ({
                  value: Math.max(split.value, 1),
                  color: splitColor(split.id, colors),
                }))}
                donut
                radius={39}
                innerRadius={25}
              />
              <View style={styles.pnlChartLegend}>
                {splits.filter(split => split.id !== 'flat' && split.value > 0).map(split => (
                  <View key={split.id} style={styles.pnlChartLegendItem}>
                    <View style={[styles.legendDot, { backgroundColor: splitColor(split.id, colors) }]} />
                    <Text style={[styles.pnlChartLegendText, { color: splitColor(split.id, colors) }]}>
                      {formatPercent(split.weight)}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.pnlChartCaption}>盈虧市值佔比</Text>
            </View>
            <View style={styles.pnlDistributionDetails}>
              <View style={[styles.pnlDetailGroup, { borderLeftColor: colors.red }]}>
                <Text style={styles.pnlDetailLabel}>獲利檔數 · <Text style={styles.pnlDetailValue}>{summary.profitCount} 檔</Text></Text>
                <Text style={[styles.pnlDetailAmount, { color: colors.red }]}>獲利金額 · {formatMoney(summary.profitPnl, true)}</Text>
              </View>
              <View style={[styles.pnlDetailGroup, { borderLeftColor: colors.green }]}>
                <Text style={styles.pnlDetailLabel}>虧損檔數 · <Text style={styles.pnlDetailValue}>{summary.lossCount} 檔</Text></Text>
                <Text style={[styles.pnlDetailAmount, { color: colors.green }]}>虧損金額 · {formatMoney(summary.lossPnl, true)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {expandedSummary === 'value' ? (
          <View style={styles.expandedSummary}>
            {allocationRows.length === 0 ? (
              <Text style={styles.emptyText}>目前沒有可估值持股。</Text>
            ) : (
              <View style={styles.allocationExpanded}>
                <View style={styles.allocationChart}>
                  <PieChart
                    data={allocationRows.map((row, index) => ({
                      value: Math.max(Math.round(row.marketValue || 0), 1),
                      color: allocationColors[index % allocationColors.length],
                    }))}
                    donut
                    radius={54}
                    innerRadius={34}
                    centerLabelComponent={() => (
                      <View style={styles.allocationCenter}>
                        <Text style={styles.allocationCenterValue}>{formatMoney(summary.marketValue)}</Text>
                        <Text style={styles.allocationCenterLabel}>股票市值</Text>
                      </View>
                    )}
                  />
                </View>
                <View style={styles.allocationLegendCompact}>
                  {allocationRows.map((row, index) => {
                    const weight = summary.marketValue > 0 ? ((row.marketValue || 0) / summary.marketValue) * 100 : 0;
                    return (
                      <View key={row.id} style={styles.allocationLine}>
                        <View style={[styles.legendDot, { backgroundColor: allocationColors[index % allocationColors.length] }]} />
                        <Text style={styles.expandedLineLabel} numberOfLines={1}>{row.name}</Text>
                        <Text style={styles.expandedLineValue}>{formatPercent(weight)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.rowDivider} />

        {tableRows.length === 0 ? (
          <Text style={styles.emptyText}>沒有可計算未實現損益的持股。</Text>
        ) : (
          <View style={styles.tableShell}>
            <View style={styles.frozenColumn}>
              <View style={styles.frozenHeader}>
                <SortableHeader
                  label="庫存"
                  sortKey="name"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                  styles={styles}
                  wide
                />
              </View>
              {tableRows.map(row => (
                <PnlFrozenCell
                  key={row.id}
                  row={row}
                  onPress={onSelectRow}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              nestedScrollEnabled
              style={styles.scrollTable}
              contentContainerStyle={styles.scrollTableContent}
            >
              <View style={styles.scrollTableInner}>
                <View style={styles.tableHeaderRow}>
                  <SortableHeader label="今日損益" sortKey="dayChange" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label="股價" sortKey="latestPrice" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label={`總損益\n報酬率`} sortKey="unrealizedPnl" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label="股數" sortKey="shares" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label={`均價\n總成本`} sortKey="averageCost" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label="市值" sortKey="marketValue" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label="近5日" sortKey="return5d" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label="近20日" sortKey="return20d" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label="今年以來" sortKey="returnYtd" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                  <SortableHeader label="股息收入" sortKey="dividendIncome" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
                </View>
                {tableRows.map(row => (
                  <PnlTableRow key={row.id} row={row} colors={colors} styles={styles} totalMarketValue={summary.marketValue} />
                ))}
              </View>
            </ScrollView>
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
            onPress={() => setShowAllRows(value => !value)}
            style={({ pressed }) => [styles.allButton, pressed && styles.allButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={showAllRows ? '收合持股' : `查看更多持股，共 ${rows.length} 檔`}
          >
            <Text style={styles.allText}>{showAllRows ? '收合' : '查看更多'}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { marginTop: 14 },
  panel: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    ...withContinuousRadius(RADIUS.sm),
    padding: 12,
    gap: 12,
  },
  summaryMetrics: {
    flexDirection: 'row',
    minHeight: 76,
    paddingVertical: 2,
  },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 6,
    backgroundColor: colors.outlineVariant,
  },
  metricTitleRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricToggle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  metricValue: {
    marginTop: 1,
    fontSize: 20,
    lineHeight: 24,
    color: colors.onSurface,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  metricPercent: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  expandedSummary: {
    paddingTop: 10,
    paddingBottom: 2,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    gap: 6,
  },
  expandedSummaryInfo: { gap: 7 },
  pnlDistribution: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 104,
    gap: 14,
  },
  pnlChartColumn: {
    width: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pnlChartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -2,
  },
  pnlChartLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pnlChartLegendText: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pnlChartCaption: { marginTop: 2, fontSize: 10, color: colors.onSurfaceVariant },
  pnlDistributionDetails: { flex: 1, minWidth: 0, gap: 8 },
  pnlDetailGroup: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    gap: 2,
  },
  pnlDetailLabel: { fontSize: 11, color: colors.onSurfaceVariant, fontWeight: '600' },
  pnlDetailValue: { color: colors.onSurface, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pnlDetailAmount: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  expandedLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
  },
  expandedLine: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
    gap: 7,
  },
  expandedLineLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
  },
  expandedLineValue: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  allocationExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 122,
    gap: 12,
  },
  allocationChart: {
    width: 126,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allocationCenter: { alignItems: 'center' },
  allocationCenterValue: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.onSurface,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  allocationCenterLabel: { fontSize: 9, color: colors.textMuted },
  allocationLegendCompact: { flex: 1, minWidth: 0, gap: 2 },
  allocationBar: {
    flexDirection: 'row',
    height: 8,
    overflow: 'hidden',
    backgroundColor: colors.divider,
    ...withContinuousRadius(RADIUS.full),
  },
  allocationSegment: { height: '100%' },
  allocationLine: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 25,
    gap: 7,
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
  tableShell: {
    flexDirection: 'row',
    minHeight: 44,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  frozenColumn: {
    width: 116,
    zIndex: 2,
    backgroundColor: colors.surfaceContainer,
    borderRightWidth: 2,
    borderRightColor: colors.outlineVariant,
  },
  frozenHeader: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceVariant,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  frozenHeaderSortButton: { width: '100%' },
  frozenCell: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  frozenIdentity: { minWidth: 0, gap: 1 },
  rowStatus: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  rowSymbol: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  tableHeaderText: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  tableHeaderActive: { color: colors.primary },
  scrollTable: { flex: 1 },
  scrollTableContent: { minWidth: 860 },
  scrollTableInner: { width: 860 },
  tableHeaderCell: {
    width: 86,
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  tableHeaderLabel: {
    textAlign: 'right',
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  tableRow: { flexDirection: 'row', minHeight: 64 },
  tableCell: {
    width: 86,
    minHeight: 64,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  tableValue: { fontSize: 13, lineHeight: 17, fontWeight: '800', color: colors.onSurface, fontVariant: ['tabular-nums'] },
  tableSubValue: { marginTop: 1, fontSize: 10, lineHeight: 13, color: colors.textMuted, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rowList: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
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
    minHeight: 44,
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
    minHeight: 44,
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
