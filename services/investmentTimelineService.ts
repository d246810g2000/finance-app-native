import { StockTrade, roundStockPrincipal } from './stockTradeService';
import type { StockPriceQuote } from './stockPriceService';

export const PORTFOLIO_TIMELINE_ID = '__portfolio__';

export type InvestmentTimelineMonth = {
  month: string;
  netFlow: number;
  cumulative: number;
};

export type InvestmentTimeline = {
  id: string;
  name: string;
  symbol?: string;
  totalNetInvested: number;
  tradeCount: number;
  firstDate: string;
  lastDate: string;
  monthSpan: number;
  monthlyAccumulation: InvestmentTimelineMonth[];
};

export type InvestmentAssetTimelinePoint = {
  month: string;
  value: number;
};

function formatYmdDisplay(ymd: string): string {
  if (!ymd || ymd.length < 8) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
}

function ymdToMonth(ymd: string): string | null {
  if (ymd.length < 6) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
}

function dateToMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthSpanFromDates(first: string, last: string): number {
  if (first.length < 6 || last.length < 6) return 1;
  const fy = parseInt(first.slice(0, 4), 10);
  const fm = parseInt(first.slice(4, 6), 10);
  const ly = parseInt(last.slice(0, 4), 10);
  const lm = parseInt(last.slice(4, 6), 10);
  return Math.max(1, (ly - fy) * 12 + (lm - fm) + 1);
}

/** Group timeline cards by symbol (falls back to name when symbol missing). */
export function timelineStockKey(trade: StockTrade): string {
  return trade.symbol || `name:${trade.name}`;
}

function nextMonth(month: string): string {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (monthIndex === 11) return `${year + 1}-01`;
  return `${year}-${String(monthIndex + 2).padStart(2, '0')}`;
}

function compareTrades(left: StockTrade, right: StockTrade): number {
  return left.date.localeCompare(right.date)
    || left.lineNumber - right.lineNumber
    || left.id.localeCompare(right.id);
}

function tradeUnitPrice(trade: StockTrade): number | undefined {
  return trade.side === 'buy' ? trade.purchasePrice : trade.salePrice;
}

/** Positive = capital in (buy), negative = capital out at cost (sell). */
export function tradeNetFlow(trade: StockTrade): number | null {
  if (trade.side === 'buy') {
    if (!trade.purchasePrice) return null;
    return roundStockPrincipal(trade.purchasePrice, trade.shares);
  }
  if (!trade.costPrice) return null;
  return -roundStockPrincipal(trade.costPrice, trade.shares);
}

export function tradesInTimelineMonth(
  trades: StockTrade[],
  timelineId: string,
  monthKey: string,
): StockTrade[] {
  const scoped = timelineId === PORTFOLIO_TIMELINE_ID
    ? trades
    : trades.filter(trade => timelineStockKey(trade) === timelineId);

  return scoped.filter(trade => ymdToMonth(trade.date) === monthKey);
}

/**
 * Value each month's share balance at the latest close. Account-level balances are
 * clamped at zero because CSV exports may omit lots that existed before the export.
 */
export function computeInvestmentAssetTimeline(
  inputTrades: StockTrade[],
  quotes: Record<string, StockPriceQuote> = {},
  throughDate?: Date,
): InvestmentAssetTimelinePoint[] {
  const trades = inputTrades
    .filter(trade => ymdToMonth(trade.date) !== null)
    .sort(compareTrades);
  if (trades.length === 0) return [];

  const prices = new Map<string, number>();
  [...trades].reverse().forEach(trade => {
    const price = tradeUnitPrice(trade);
    if (price && price > 0 && !prices.has(timelineStockKey(trade))) {
      prices.set(timelineStockKey(trade), price);
    }
  });
  Object.values(quotes).forEach(quote => {
    if (quote.symbol && quote.close > 0) prices.set(quote.symbol, quote.close);
  });

  const tradesByMonth = new Map<string, StockTrade[]>();
  const months: string[] = [];
  trades.forEach(trade => {
    const month = ymdToMonth(trade.date)!;
    if (tradesByMonth.size === 0 || month.localeCompare(months[months.length - 1]) > 0) {
      months.push(month);
    }
    tradesByMonth.set(month, [...(tradesByMonth.get(month) || []), trade]);
  });

  const firstMonth = months[0];
  const tradeLastMonth = months[months.length - 1];
  const requestedLastMonth = throughDate ? dateToMonth(throughDate) : tradeLastMonth;
  const lastMonth = requestedLastMonth.localeCompare(tradeLastMonth) > 0
    ? requestedLastMonth
    : tradeLastMonth;
  const balances = new Map<string, { symbolKey: string; shares: number }>();
  const timeline: InvestmentAssetTimelinePoint[] = [];

  for (let month = firstMonth; month.localeCompare(lastMonth) <= 0; month = nextMonth(month)) {
    tradesByMonth.get(month)?.forEach(trade => {
      const groupKey = [trade.ownership, trade.account, timelineStockKey(trade)].join('¦');
      const balance = balances.get(groupKey) || { symbolKey: timelineStockKey(trade), shares: 0 };
      balance.shares += trade.side === 'buy' ? trade.shares : -trade.shares;
      balances.set(groupKey, balance);
    });

    balances.forEach(balance => {
      if (balance.shares < 0) balance.shares = 0;
    });

    const value = Array.from(balances.values()).reduce((sum, balance) => {
      if (balance.shares <= 0) return sum;
      return sum + balance.shares * (prices.get(balance.symbolKey) || 0);
    }, 0);

    timeline.push({ month, value: Math.round(value) });
  }

  return timeline;
}

function buildTimeline(
  id: string,
  name: string,
  symbol: string | undefined,
  trades: StockTrade[],
): InvestmentTimeline | null {
  const validTrades = trades.filter(trade => tradeNetFlow(trade) !== null);
  if (validTrades.length === 0) return null;

  const byMonth: Record<string, number> = {};
  const dates: string[] = [];

  validTrades.forEach(trade => {
    const month = ymdToMonth(trade.date);
    if (!month) return;
    byMonth[month] = (byMonth[month] || 0) + (tradeNetFlow(trade) || 0);
    if (trade.date.length >= 8) dates.push(trade.date);
  });

  const sortedMonths = Object.keys(byMonth).sort();
  if (sortedMonths.length === 0) return null;

  let cumulative = 0;
  const monthlyAccumulation = sortedMonths.map(month => {
    cumulative += byMonth[month];
    return {
      month,
      netFlow: Math.round(byMonth[month]),
      cumulative: Math.round(cumulative),
    };
  });

  const sortedDates = [...dates].sort();
  const first = sortedDates[0] || '';
  const last = sortedDates[sortedDates.length - 1] || '';

  return {
    id,
    name,
    symbol,
    totalNetInvested: Math.round(cumulative),
    tradeCount: validTrades.length,
    firstDate: formatYmdDisplay(first),
    lastDate: formatYmdDisplay(last),
    monthSpan: monthSpanFromDates(first, last),
    monthlyAccumulation,
  };
}

/** Build portfolio-wide and per-symbol net-invested timelines (full history). */
export function computeInvestmentTimelines(trades: StockTrade[]): InvestmentTimeline[] {
  const portfolio = buildTimeline(PORTFOLIO_TIMELINE_ID, '投資組合', undefined, trades);

  const groups = new Map<string, StockTrade[]>();
  trades.forEach(trade => {
    const key = timelineStockKey(trade);
    const list = groups.get(key) || [];
    list.push(trade);
    groups.set(key, list);
  });

  const stockTimelines = Array.from(groups.entries())
    .map(([key, groupTrades]) => {
      const first = groupTrades[0];
      const label = first.symbol ? `${first.name} ${first.symbol}` : first.name;
      return buildTimeline(key, label, first.symbol, groupTrades);
    })
    .filter((timeline): timeline is InvestmentTimeline => !!timeline)
    .filter(timeline => timeline.monthSpan >= 2 || timeline.tradeCount >= 2)
    .sort((a, b) => b.totalNetInvested - a.totalNetInvested)
    .slice(0, 6);

  const result: InvestmentTimeline[] = [];
  if (portfolio && portfolio.monthlyAccumulation.length > 0) {
    result.push(portfolio);
  }
  result.push(...stockTimelines);
  return result;
}
