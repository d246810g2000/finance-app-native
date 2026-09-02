import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors } from '../../theme';
import { InvestmentPnlRow } from '../../viewModels/investmentPnlViewModel';
import {
  createInvestmentTableStyles,
  FrozenNameCell,
  formatQuotePrice,
  formatTableMoney,
  formatTablePercent,
  InvestmentTableShell,
  SortableTableHeader,
  TABLE_CELL_WIDTH,
  TableDataCell,
  tablePnlColor,
  type SortDirection,
} from './investmentTablePrimitives';

type SortKey = 'symbol' | 'dayChange' | 'latestPrice' | 'unrealizedPnl' | 'shares' | 'averageCost' | 'marketValue' | 'return5d' | 'return20d' | 'returnYtd' | 'dividendIncome';

function sortValue(row: InvestmentPnlRow, key: SortKey): number | string {
  if (key === 'symbol') {
    if (!row.symbol) return `\uffff${row.name}`;
    const numericSymbol = Number(row.symbol);
    return Number.isFinite(numericSymbol) ? numericSymbol : row.symbol;
  }
  if (key === 'dayChange') return row.dayChange ?? Number.NEGATIVE_INFINITY;
  if (key === 'latestPrice') return row.latestPrice ?? Number.NEGATIVE_INFINITY;
  if (key === 'unrealizedPnl') return row.unrealizedPnl ?? Number.NEGATIVE_INFINITY;
  if (key === 'shares') return row.shares;
  if (key === 'averageCost') return row.averageCost;
  if (key === 'marketValue') return row.marketValue ?? Number.NEGATIVE_INFINITY;
  return row[key] ?? Number.NEGATIVE_INFINITY;
}

function HoldingsPnlRowCells({
  row,
  colors,
  styles,
  totalMarketValue,
}: {
  row: InvestmentPnlRow;
  colors: AppColors;
  styles: ReturnType<typeof createInvestmentTableStyles>;
  totalMarketValue: number;
}) {
  const pnl = row.unrealizedPnl || 0;
  const hasPrice = row.marketValue !== undefined;
  const valueColor = hasPrice ? tablePnlColor(pnl, colors) : colors.yellow;

  return (
    <View style={styles.tableRow}>
      <TableDataCell
        styles={styles}
        primary={row.dayChange === undefined ? '—' : formatTableMoney(row.dayChange, true)}
        secondary={row.dayChangePercent === undefined ? '今日' : formatTablePercent(row.dayChangePercent, true)}
        primaryColor={row.dayChange === undefined ? colors.textMuted : tablePnlColor(row.dayChange, colors)}
        secondaryColor={row.dayChangePercent === undefined ? colors.textMuted : tablePnlColor(row.dayChangePercent, colors)}
      />
      <TableDataCell styles={styles} primary={formatQuotePrice(row.latestPrice)} />
      <TableDataCell
        styles={styles}
        primary={hasPrice ? formatTableMoney(pnl, true) : '—'}
        secondary={row.unrealizedPnlPercent === undefined ? '無法評價' : formatTablePercent(row.unrealizedPnlPercent, true)}
        primaryColor={valueColor}
        secondaryColor={row.unrealizedPnlPercent === undefined ? colors.textMuted : tablePnlColor(row.unrealizedPnlPercent, colors)}
      />
      <TableDataCell styles={styles} primary={row.shares.toLocaleString()} />
      <TableDataCell
        styles={styles}
        primary={formatTableMoney(row.averageCost)}
        secondary={formatTableMoney(row.totalCost)}
      />
      <TableDataCell
        styles={styles}
        primary={hasPrice ? formatTableMoney(row.marketValue ?? 0) : '—'}
        secondary={hasPrice && totalMarketValue > 0 ? formatTablePercent(((row.marketValue || 0) / totalMarketValue) * 100) : '—'}
      />
      {(['return5d', 'return20d', 'returnYtd'] as const).map(key => (
        <TableDataCell
          key={key}
          styles={styles}
          primary={row[key] === undefined ? '—' : formatTablePercent(row[key], true)}
          primaryColor={row[key] === undefined ? colors.textMuted : tablePnlColor(row[key] || 0, colors)}
        />
      ))}
      <TableDataCell
        styles={styles}
        primary={formatTableMoney(row.dividendIncome || 0, true)}
        primaryColor={row.dividendIncome ? colors.red : colors.textMuted}
      />
    </View>
  );
}

interface HoldingsPnlTableProps {
  rows: InvestmentPnlRow[];
  totalMarketValue: number;
  onRowPress?: (row: InvestmentPnlRow) => void;
  defaultSortKey?: SortKey;
  defaultSortDirection?: SortDirection;
}

export default function HoldingsPnlTable({
  rows,
  totalMarketValue,
  onRowPress,
  defaultSortKey = 'unrealizedPnl',
  defaultSortDirection = 'desc',
}: HoldingsPnlTableProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createInvestmentTableStyles(colors), [colors]);
  const [sortKey, setSortKey] = useState<SortKey | null>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  const scrollWidth = TABLE_CELL_WIDTH * 10;

  if (rows.length === 0) {
    return <View><Text style={styles.emptyText}>沒有可計算未實現損益的持股。</Text></View>;
  }

  return (
    <InvestmentTableShell
      styles={styles}
      scrollWidth={scrollWidth}
      frozenHeader={(
        <SortableTableHeader
          label="庫存股"
          sortKey="symbol"
          activeKey={sortKey}
          direction={sortDirection}
          onSort={handleSort}
          styles={styles}
          frozen
        />
      )}
      frozenRows={sortedRows.map(row => (
        <FrozenNameCell
          key={row.id}
          name={row.name}
          symbol={row.symbol}
          styles={styles}
          onPress={onRowPress ? () => onRowPress(row) : undefined}
        />
      ))}
      scrollHeader={(
        <View style={styles.tableHeaderRow}>
          <SortableTableHeader label="今日損益" sortKey="dayChange" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="股價" sortKey="latestPrice" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label={`總損益\n報酬率`} sortKey="unrealizedPnl" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="股數" sortKey="shares" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label={`均價\n總成本`} sortKey="averageCost" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="市值" sortKey="marketValue" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="近5日" sortKey="return5d" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="近20日" sortKey="return20d" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="今年以來" sortKey="returnYtd" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="股息收入" sortKey="dividendIncome" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
        </View>
      )}
      scrollRows={sortedRows.map(row => (
        <HoldingsPnlRowCells
          key={row.id}
          row={row}
          colors={colors}
          styles={styles}
          totalMarketValue={totalMarketValue}
        />
      ))}
    />
  );
}
