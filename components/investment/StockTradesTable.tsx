import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { StockTrade, StockOwnership } from '../../services/stockTradeService';
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
  type SortDirection,
} from './investmentTablePrimitives';

const OWNERSHIP_LABELS: Record<StockOwnership, string> = {
  personal: '個人',
  shared: '共享',
};

const SIDE_LABELS: Record<string, string> = {
  buy: '買入',
  sell: '賣出',
  dividend: '股息',
  corporate_action: '配股',
};

type SortKey = 'symbol' | 'date' | 'amount' | 'shares' | 'side' | 'price';

function sortValue(trade: StockTrade, key: SortKey): number | string {
  if (key === 'symbol') {
    if (!trade.symbol) return `\uffff${trade.name}`;
    const numericSymbol = Number(trade.symbol);
    return Number.isFinite(numericSymbol) ? numericSymbol : trade.symbol;
  }
  if (key === 'date') return trade.date;
  if (key === 'amount') return trade.amount;
  if (key === 'side') return trade.side;
  if (key === 'price') return trade.purchasePrice ?? trade.salePrice ?? 0;
  return trade.shares;
}

function TradeTableRow({
  trade,
  colors,
  styles,
  positionMode,
}: {
  trade: StockTrade;
  colors: AppColors;
  styles: ReturnType<typeof createInvestmentTableStyles>;
  positionMode: boolean;
}) {
  const isBuy = trade.side === 'buy';
  const priceText = isBuy
    ? (trade.purchasePrice ? `$${trade.purchasePrice.toFixed(2)}` : '—')
    : (trade.costPrice && trade.salePrice
      ? `$${trade.costPrice.toFixed(2)}→$${trade.salePrice.toFixed(2)}`
      : trade.salePrice ? `$${trade.salePrice.toFixed(2)}` : '—');

  if (positionMode) {
    return (
      <View style={styles.tableRow}>
        <TableDataCell styles={styles} primary={priceText} />
        <TableDataCell styles={styles} primary={trade.shares.toLocaleString()} />
        <TableDataCell
          styles={styles}
          primary={formatTableMoney(trade.amount, !isBuy)}
          primaryColor={colors.onSurface}
        />
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
        primary={SIDE_LABELS[trade.side] || trade.side}
        primaryColor={isBuy ? colors.red : colors.green}
      />
      <TableDataCell
        styles={styles}
        primary={formatTableMoney(trade.amount, !isBuy)}
        primaryColor={colors.onSurface}
      />
      <TableDataCell styles={styles} primary={trade.shares.toLocaleString()} />
      <TableDataCell styles={styles} primary={priceText} wide />
      <TableDataCell styles={styles} primary={OWNERSHIP_LABELS[trade.ownership]} />
    </View>
  );
}

interface StockTradesTableProps {
  trades: StockTrade[];
  variant?: 'portfolio' | 'position';
  emptyMessage?: string;
}

export default function StockTradesTable({
  trades,
  variant = 'portfolio',
  emptyMessage = '此區間沒有有效交易紀錄。',
}: StockTradesTableProps) {
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
    ? TABLE_CELL_WIDTH * 2 + (TABLE_CELL_WIDTH + 16)
    : (TABLE_CELL_WIDTH + 16) * 2 + TABLE_CELL_WIDTH * 4;

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
          <SortableTableHeader label="買進價" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="股數" sortKey="shares" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="金額" sortKey="amount" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <TableHeaderLabel label="帳戶" styles={styles} wide />
        </View>
      ) : (
        <View style={styles.tableHeaderRow}>
          <SortableTableHeader label="日期" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} wide />
          <SortableTableHeader label="方向" sortKey="side" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="金額" sortKey="amount" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="股數" sortKey="shares" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} />
          <SortableTableHeader label="價格" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={handleSort} styles={styles} wide />
          <TableHeaderLabel label="歸屬" styles={styles} />
        </View>
      )}
      scrollRows={sortedTrades.map(trade => (
        <TradeTableRow
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
