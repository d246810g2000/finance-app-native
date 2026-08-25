import { StockRealizedTrade } from './portfolioService';
import { StockTrade } from './stockTradeService';

/** Format a local calendar date as YYYYMMDD (matches AndroMoney trade dates). */
export function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function createDefaultInvestmentDateRange(today = new Date()): { startDate: Date; endDate: Date } {
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

export function inDateRange(ymd: string, startDate: Date, endDate: Date): boolean {
  const startYmd = toYmd(startDate);
  const endYmd = toYmd(endDate);
  return ymd >= startYmd && ymd <= endYmd;
}

export function filterByDateRange<T extends { date: string }>(
  items: T[],
  startDate: Date,
  endDate: Date,
): T[] {
  return items.filter(item => inDateRange(item.date, startDate, endDate));
}

export function sumRealizedPnl(trades: StockRealizedTrade[]): number {
  return trades.reduce((sum, trade) => sum + trade.pnl, 0);
}

export function matchesPosition(
  trade: StockTrade | StockRealizedTrade,
  position: { name: string; account: string; ownership: string },
): boolean {
  if ('kind' in trade && trade.kind === 'dividend') {
    return trade.name === position.name && trade.ownership === position.ownership;
  }
  return trade.name === position.name
    && trade.account === position.account
    && trade.ownership === position.ownership;
}
