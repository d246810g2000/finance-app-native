import type { CurrentHolding, PositionMover } from '../services/portfolioService';
import type { StockDividend } from '../services/stockTradeService';

export type InvestmentPnlSplitId = 'profit' | 'loss' | 'flat';

export interface InvestmentPnlSplit {
  id: InvestmentPnlSplitId;
  label: string;
  value: number;
  weight: number;
}

export interface InvestmentPnlSummary {
  /** Market value of holdings that have a latest close. */
  marketValue: number;
  /** Cost of holdings that have a latest close. */
  evaluatedCost: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  evaluatedMarketValue: number;
  profitCount: number;
  profitPnl: number;
  profitMarketValue: number;
  lossCount: number;
  lossPnl: number;
  lossMarketValue: number;
  flatCount: number;
  flatMarketValue: number;
  missingPriceCount: number;
}

export interface InvestmentPnlRow extends CurrentHolding {
  unrealizedPnlPercent?: number;
  dayChange?: number;
  dayChangePercent?: number;
  return5d?: number;
  return20d?: number;
  returnYtd?: number;
  dividendIncome?: number;
}

export interface InvestmentPnlViewModel {
  summary: InvestmentPnlSummary;
  rows: InvestmentPnlRow[];
  topRows: InvestmentPnlRow[];
  splits: InvestmentPnlSplit[];
}

interface BuildInvestmentPnlViewModelInput {
  holdings: CurrentHolding[];
  moversById?: Map<string, PositionMover>;
  periodReturnsById?: Map<string, { return5d?: number; return20d?: number; returnYtd?: number }>;
  dividends?: StockDividend[];
  visibleCount?: number;
}

function signedDividend(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Merge current symbol-level holdings with day movers and rank unrealized impact. */
export function buildInvestmentPnlViewModel({
  holdings,
  moversById = new Map<string, PositionMover>(),
  periodReturnsById = new Map(),
  dividends = [],
  visibleCount = 5,
}: BuildInvestmentPnlViewModelInput): InvestmentPnlViewModel {
  const rows: InvestmentPnlRow[] = holdings
    .filter(holding => holding.shares > 0)
    .map(holding => {
      const mover = moversById.get(holding.id);
      return {
        ...holding,
        unrealizedPnlPercent: holding.unrealizedPnl === undefined || holding.totalCost <= 0
          ? undefined
          : round((holding.unrealizedPnl / holding.totalCost) * 100),
        dayChange: mover?.change,
        dayChangePercent: mover?.changePercent,
        ...periodReturnsById.get(holding.id),
        dividendIncome: dividends
          .filter(dividend => (holding.symbol && dividend.symbol
            ? holding.symbol === dividend.symbol
            : holding.name === dividend.name))
          .reduce((sum, dividend) => sum + dividend.amount, 0),
      };
    });

  const pricedRows = rows.filter(row => row.marketValue !== undefined);
  const profitRows = pricedRows.filter(row => (row.unrealizedPnl || 0) > 0);
  const lossRows = pricedRows.filter(row => (row.unrealizedPnl || 0) < 0);
  const flatRows = pricedRows.filter(row => (row.unrealizedPnl || 0) === 0);

  const marketValue = pricedRows.reduce((sum, row) => sum + (row.marketValue || 0), 0);
  const evaluatedCost = pricedRows.reduce((sum, row) => sum + row.totalCost, 0);
  const unrealizedPnl = pricedRows.reduce((sum, row) => sum + (row.unrealizedPnl || 0), 0);
  const profitPnl = profitRows.reduce((sum, row) => sum + (row.unrealizedPnl || 0), 0);
  const lossPnl = lossRows.reduce((sum, row) => sum + (row.unrealizedPnl || 0), 0);
  const profitMarketValue = profitRows.reduce((sum, row) => sum + (row.marketValue || 0), 0);
  const lossMarketValue = lossRows.reduce((sum, row) => sum + (row.marketValue || 0), 0);
  const flatMarketValue = flatRows.reduce((sum, row) => sum + (row.marketValue || 0), 0);
  const evaluatedMarketValue = profitMarketValue + lossMarketValue + flatMarketValue;
  const missingPriceCount = rows.length - pricedRows.length;

  const summary: InvestmentPnlSummary = {
    marketValue: Math.round(marketValue),
    evaluatedCost: Math.round(evaluatedCost),
    unrealizedPnl: Math.round(unrealizedPnl),
    unrealizedPnlPercent: round(signedDividend(unrealizedPnl, evaluatedCost)),
    evaluatedMarketValue: Math.round(evaluatedMarketValue),
    profitCount: profitRows.length,
    profitPnl: Math.round(profitPnl),
    profitMarketValue: Math.round(profitMarketValue),
    lossCount: lossRows.length,
    lossPnl: Math.round(lossPnl),
    lossMarketValue: Math.round(lossMarketValue),
    flatCount: flatRows.length,
    flatMarketValue: Math.round(flatMarketValue),
    missingPriceCount,
  };

  const rankedRows = rows
    .map(row => ({
      row,
      impact: row.unrealizedPnl === undefined
        ? Number.MIN_SAFE_INTEGER
        : Math.abs(row.unrealizedPnl),
    }))
    .sort((left, right) => (
      right.impact - left.impact
        || (right.row.marketValue ?? right.row.displayValue)
          - (left.row.marketValue ?? left.row.displayValue)
        || left.row.name.localeCompare(right.row.name)
    ))
    .map(item => item.row);

  const splits: InvestmentPnlSplit[] = [
    {
      id: 'profit',
      label: '獲利',
      value: Math.round(profitMarketValue),
      weight: round(signedDividend(profitMarketValue, evaluatedMarketValue)),
    },
    {
      id: 'loss',
      label: '虧損',
      value: Math.round(lossMarketValue),
      weight: round(signedDividend(lossMarketValue, evaluatedMarketValue)),
    },
    {
      id: 'flat',
      label: '平盤',
      value: Math.round(flatMarketValue),
      weight: round(signedDividend(flatMarketValue, evaluatedMarketValue)),
    },
  ];

  return {
    summary,
    rows: rankedRows,
    topRows: rankedRows.slice(0, Math.max(visibleCount, 0)),
    splits,
  };
}
