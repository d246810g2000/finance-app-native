import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { StockRealizedTrade } from '../../services/portfolioService';
import { StockOwnership } from '../../services/stockTradeService';
import { AppColors } from '../../theme';
import {
  createInvestmentTableStyles,
  FrozenDateCell,
  FrozenNameCell,
  formatTableDate,
  formatTableMoney,
  InvestmentTableShell,
  SortableTableHeader,
  TableHeaderLabel,
  TABLE_CELL_WIDTH,
  TableDataCell,
  tablePnlColor,
  type SortDirection,
} from './investmentTablePrimitives';

const OWNERSHIP_LABELS: Record<StockOwnership, string> = {
  personal: '個人',
  shared: '共享',
};

type SortKey = 'symbol' | 'date' | 'pnl' | 'shares' | 'kind' | 'price';

function sortValue(trade: StockRealizedTrade, key: SortKey): number | string {
  if (key === 'symbol') {
    if (!trade.symbol) return `\uffff${trade.name}`;
    const numericSymbol = Number(trade.symbol);
    return Number.isFinite(numericSymbol) ? numericSymbol : trade.symbol;
  }
  if (key === 'date') return trade.date;
  if (key === 'pnl') return trade.pnl;
  if (key === 'shares') return trade.shares;
  if (key === 'kind') return trade.kind === 'dividend' ? 0 : 1;
  if (key === 'price') return trade.salePrice;
  return trade.shares;
}

function RealizedTableRow({
  trade,
  colors,
  styles,
  positionMode,
}: {
  trade: StockRealizedTrade;
  colors: AppColors;
  styles: ReturnType<typeof createInvestmentTableStyles>;
  positionMode: boolean;
}) {
  const isDividend = trade.kind === 'dividend';
  const dps = trade.dividendPerShare ?? trade.salePrice;

  if (positionMode) {
    return (
      <View style={styles.tableRow}>
        <TableDataCell
          styles={styles}
          primary={isDividend ? '股息' : '賣出'}
          primaryColor={isDividend ? colors.yellow : colors.onSurface}
        />
        <TableDataCell
          styles={styles}
          primary={formatTableMoney(trade.pnl, true)}
          primaryColor={tablePnlColor(trade.pnl, colors)}
        />
        <TableDataCell
          styles={styles}
          primary={isDividend
            ? `$${dps}`
            : `$${trade.costPrice.toFixed(2)}→$${trade.salePrice.toFixed(2)}`}
          secondary={isDividend ? `每股 × ${trade.shares.toLocaleString()}` : undefined}
          wide
        />
        <TableDataCell styles={styles} primary={trade.shares.toLocaleString()} />
        <TableDataCell
          styles={styles}
          primary={trade.account}
          secondary={OWNERSHIP_LABELS[trade.ownership]}
          wide
        />
      </View>
    );
  }

  return (
    <View style={styles.tableRow}>
      <TableDataCell styles={styles} primary={formatTableDate(trade.date)} wide />
      <TableDataCell
        styles={styles}
        primary={isDividend ? '股息' : '賣出'}
        primaryColor={isDividend ? colors.yellow : colors.onSurface}
      />
      <TableDataCell
        styles={styles}
        primary={formatTableMoney(trade.pnl, true)}
        primaryColor={tablePnlColor(trade.pnl, colors)}
      />
      <TableDataCell
        styles={styles}
        primary={isDividend
          ? `$${dps}`
          : `$${trade.costPrice.toFixed(2)}→$${trade.salePrice.toFixed(2)}`}
        secondary={isDividend ? `每股 × ${trade.shares.toLocaleString()}` : undefined}
        wide
      />
      <TableDataCell styles={styles} primary={trade.shares.toLocaleString()} />
      <TableDataCell
        styles={styles}
        primary={trade.account}
        secondary={OWNERSHIP_LABELS[trade.ownership]}
        wide
      />
    </View>
  );
}

interface RealizedTradesTableProps {
  trades: StockRealizedTrade[];
  variant?: 'portfolio' | 'position';
  emptyMessage?: string;
}

export default function RealizedTradesTable({
  trades,
  variant = 'portfolio',
  emptyMessage = '此區間沒有賣出了結紀錄。',
}: RealizedTradesTableProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createInvestmentTableStyles(colors), [colors]);
  const positionMode = variant === 'position';
  const [sortKey, setSortKey] = useState<SortKey | null>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedTrades = useMemo(() => {
    if (!sortKey) return trades;
    return [...trades].sort((left, right) => {
      const leftValue = sortValue(left, sortKey);
      const rightValue = sortValue(right, sortKey);
      const comparison = typeof leftValue === 'string' && typeof rightValue === 'string'
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [trades, sortDirection, sortKey]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  const scrollWidth = positionMode
    ? TABLE_CELL_WIDTH * 2 + (TABLE_CELL_WIDTH + 16) * 3
    : (TABLE_CELL_WIDTH + 16) * 3 + TABLE_CELL_WIDTH * 3;

  if (trades.length === 0) {
    return <Text style={styles.emptyText}>{emptyMessage}</Text>;
  }

  return (
    <InvestmentTableShell
      styles={styles}
      scrollWidth={scrollWidth}
      frozenHeader={positionMode ? (
        <SortableTableHeader
          label="日期"
          sortKey="date"
          activeKey={sortKey}
          direction={sortDirection}
          onSort={handleSort}
          styles={styles}
          frozen
        />
      ) : (
        <SortableTableHeader
          label="標的"
          sortKey="symbol"
          activeKey={sortKey}
          direction={sortDirection}
          onSort={handleSort}
          styles={styles}
          frozen
        />
      )}
      frozenRows={positionMode
        ? sortedTrades.map(trade => (
          <FrozenDateCell key={trade.id} date={trade.date} styles={styles} />
        ))
        : sortedTrades.map(trade => (
          <FrozenNameCell
            key={trade.id}
            name={trade.name}
            symbol={trade.symbol}
            styles={styles}
          />
        ))}
      scrollHeader={positionMode ? (
        <View style={styles.tableHeaderRow}>
          <TableHeaderLabel label="類型" styles={styles} />
          <SortableTableHeader label="損益" sortKey="pnl" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="成交價" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} wide />
          <SortableTableHeader label="股數" sortKey="shares" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <TableHeaderLabel label="帳戶" styles={styles} wide />
        </View>
      ) : (
        <View style={styles.tableHeaderRow}>
          <SortableTableHeader label="日期" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} wide />
          <TableHeaderLabel label="類型" styles={styles} />
          <SortableTableHeader label="損益" sortKey="pnl" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="成交價" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} wide />
          <SortableTableHeader label="股數" sortKey="shares" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <TableHeaderLabel label="帳戶" styles={styles} wide />
        </View>
      )}
      scrollRows={sortedTrades.map(trade => (
        <RealizedTableRow
          key={trade.id}
          trade={trade}
          colors={colors}
          styles={styles}
          positionMode={positionMode}
        />
      ))}
    />
  );
}
