import type { CurrentHolding, PositionMover, StockPosition } from '../services/portfolioService';
import {
  getTradingPointQuote,
  getFirstTradingYearQuote,
  StockPriceCache,
} from '../services/stockPriceService';

export type InvestmentPerformancePeriodId = '1d' | '5d' | '20d' | 'ytd';

export interface InvestmentPerformancePeriod {
  id: InvestmentPerformancePeriodId;
  label: string;
}

export const INVESTMENT_PERFORMANCE_PERIODS: InvestmentPerformancePeriod[] = [
  { id: '1d', label: '近1日' },
  { id: '5d', label: '近5日' },
  { id: '20d', label: '近20日' },
  { id: 'ytd', label: '今年' },
];

export interface InvestmentPerformanceRow {
  id: string;
  name: string;
  symbol?: string;
  shares: number;
  currentPrice?: number;
  currentDate?: string;
  baselinePrice?: number;
  baselineDate?: string;
  changePercent?: number;
  marketValueChange?: number;
  currentMarketValue?: number;
}

export interface InvestmentPerformanceSummary {
  currentMarketValue: number;
  baselineMarketValue: number;
  marketValueChange: number;
  changePercent: number;
  availableCount: number;
  unavailableCount: number;
}

export interface InvestmentPerformanceViewModel {
  period: InvestmentPerformancePeriodId;
  periodLabel: string;
  rows: InvestmentPerformanceRow[];
  topRows: InvestmentPerformanceRow[];
  summary: InvestmentPerformanceSummary;
}

export type InvestmentHoldingSortId = 'pnl' | 'day' | 'market' | 'return';

export interface InvestmentHoldingSortOption {
  id: InvestmentHoldingSortId;
  label: string;
}

export const INVESTMENT_HOLDING_SORT_OPTIONS: InvestmentHoldingSortOption[] = [
  { id: 'pnl', label: '總損益' },
  { id: 'day', label: '今日' },
  { id: 'market', label: '市值' },
  { id: 'return', label: '報酬率' },
];

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function signedDividend(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function baselineQuote(
  cache: StockPriceCache,
  period: InvestmentPerformancePeriodId,
  symbol: string,
  today: Date,
) {
  if (period === 'ytd') return getFirstTradingYearQuote(cache, symbol, today);
  const pointsAgo = period === '1d' ? 1 : period === '5d' ? 4 : 19;
  return getTradingPointQuote(cache, symbol, pointsAgo, today);
}

/** Compare current closes with an earlier trading point for the current share balance. */
export function buildInvestmentPerformanceViewModel(options: {
  holdings: CurrentHolding[];
  priceCache: StockPriceCache | null;
  period: InvestmentPerformancePeriodId;
  today?: Date;
  visibleCount?: number;
}): InvestmentPerformanceViewModel {
  const { holdings, priceCache, period, today = new Date(), visibleCount = 4 } = options;
  const periodLabel = INVESTMENT_PERFORMANCE_PERIODS.find(item => item.id === period)?.label || '';

  const rows = holdings
    .filter(holding => holding.shares > 0)
    .map(holding => {
      if (!priceCache || !holding.symbol) {
        return {
          id: holding.id,
          name: holding.name,
          symbol: holding.symbol,
          shares: holding.shares,
        };
      }

      const current = getTradingPointQuote(priceCache, holding.symbol, 0, today);
      const baseline = baselineQuote(priceCache, period, holding.symbol, today);
      if (!current || !baseline) {
        return {
          id: holding.id,
          name: holding.name,
          symbol: holding.symbol,
          shares: holding.shares,
        };
      }

      const currentMarketValue = current.close * holding.shares;
      const baselineMarketValue = baseline.close * holding.shares;
      const marketValueChange = currentMarketValue - baselineMarketValue;

      return {
        id: holding.id,
        name: holding.name,
        symbol: holding.symbol,
        shares: holding.shares,
        currentPrice: current.close,
        currentDate: current.date,
        baselinePrice: baseline.close,
        baselineDate: baseline.date,
        changePercent: round(signedDividend(marketValueChange, baselineMarketValue)),
        marketValueChange: Math.round(marketValueChange),
        currentMarketValue: Math.round(currentMarketValue),
      };
    });

  const available = rows.filter(row => row.changePercent !== undefined);
  const currentMarketValue = available.reduce((sum, row) => sum + (row.currentMarketValue || 0), 0);
  const baselineMarketValue = available.reduce(
    (sum, row) => sum + (row.baselinePrice || 0) * row.shares,
    0,
  );
  const marketValueChange = currentMarketValue - baselineMarketValue;

  const ranked = [...rows].sort((left, right) => {
    const leftValue = left.changePercent === undefined
      ? Number.NEGATIVE_INFINITY
      : Math.abs(left.changePercent);
    const rightValue = right.changePercent === undefined
      ? Number.NEGATIVE_INFINITY
      : Math.abs(right.changePercent);
    return rightValue - leftValue || left.name.localeCompare(right.name);
  });

  return {
    period,
    periodLabel,
    rows: ranked,
    topRows: ranked.slice(0, Math.max(visibleCount, 0)),
    summary: {
      currentMarketValue: Math.round(currentMarketValue),
      baselineMarketValue: Math.round(baselineMarketValue),
      marketValueChange: Math.round(marketValueChange),
      changePercent: round(signedDividend(marketValueChange, baselineMarketValue)),
      availableCount: available.length,
      unavailableCount: rows.length - available.length,
    },
  };
}

function sortValuedFirst<T extends { name: string }>(
  values: T[],
  read: (item: T) => number | undefined,
  direction: 'asc' | 'desc',
) {
  const valued = values.filter(item => read(item) !== undefined);
  const missing = values.filter(item => read(item) === undefined);
  const factor = direction === 'asc' ? 1 : -1;
  valued.sort((left, right) => factor * ((read(left) || 0) - (read(right) || 0)) || left.name.localeCompare(right.name));
  return [...valued, ...missing];
}

/** Sort account-level positions for the holdings drill-down. */
export function sortInvestmentPositions(
  positions: StockPosition[],
  moversById: Map<string, PositionMover>,
  sortId: InvestmentHoldingSortId,
  direction: 'asc' | 'desc',
): StockPosition[] {
  const positionKey = (position: StockPosition) => position.symbol || `name:${position.name}`;

  if (sortId === 'day') {
    const values = positions.map(position => ({
      position,
      name: position.name,
      dayChange: moversById.get(positionKey(position))?.change,
    }));
    return sortValuedFirst(values, item => item.dayChange, direction).map(item => item.position);
  }

  const readers: Record<Exclude<InvestmentHoldingSortId, 'day'>, (position: StockPosition) => number | undefined> = {
    pnl: position => position.unrealizedPnl,
    market: position => position.marketValue,
    return: position => position.unrealizedPnlPercent,
  };

  return sortValuedFirst(positions, readers[sortId], direction);
}
