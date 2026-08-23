import { StockTrade } from './stockTradeService';

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

function formatYmdDisplay(ymd: string): string {
  if (!ymd || ymd.length < 8) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
}

function ymdToMonth(ymd: string): string | null {
  if (ymd.length < 6) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
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

/** Positive = capital in (buy), negative = capital out at cost (sell). */
export function tradeNetFlow(trade: StockTrade): number | null {
  if (trade.side === 'buy') {
    if (!trade.purchasePrice) return null;
    return trade.purchasePrice * trade.shares;
  }
  if (!trade.costPrice) return null;
  return -(trade.costPrice * trade.shares);
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
