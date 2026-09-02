import {
  StockDividend,
  StockOwnership,
  StockTrade,
  roundStockPrincipal,
} from './stockTradeService';
import { StockPriceQuote } from './stockPriceService';

export interface StockLot {
  id: string;
  name: string;
  symbol?: string;
  account: string;
  ownership: StockOwnership;
  shares: number;
  purchasePrice: number;
  date: string;
}

export interface StockPosition {
  id: string;
  name: string;
  symbol?: string;
  account: string;
  ownership: StockOwnership;
  shares: number;
  averageCost: number;
  totalCost: number;
  latestPrice?: number;
  latestPriceDate?: string;
  marketValue?: number;
  unrealizedPnl?: number;
  unrealizedPnlPercent?: number;
}

export interface StockRealizedTrade {
  id: string;
  kind: 'sell' | 'dividend';
  name: string;
  symbol?: string;
  account: string;
  ownership: StockOwnership;
  date: string;
  shares: number;
  costPrice: number;
  salePrice: number;
  dividendPerShare?: number;
  pnl: number;
}

export interface PortfolioResult {
  positions: StockPosition[];
  realizedTrades: StockRealizedTrade[];
  realizedPnl: number;
}

export interface PositionMover {
  id: string;
  name: string;
  symbol?: string;
  shares: number;
  previousClose: number;
  currentClose: number;
  change: number;
  changePercent: number;
  date?: string;
}

export interface AllocationItem {
  id: string;
  name: string;
  value: number;
  weight: number;
}

export interface PortfolioInsights {
  totalMarketValue: number;
  totalCost: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  totalReturnRate: number;
  dayPnl: number;
  dayPnlPercent: number;
  dayAdvances: number;
  dayDeclines: number;
  dayFlat: number;
  dayValuedAt?: string;
  movers: PositionMover[];
  allocation: AllocationItem[];
  accountAllocation: AllocationItem[];
  top1Weight: number;
  top3Weight: number;
  concentrationStatus: 'balanced' | 'watch' | 'high';
  missingPrices: StockPosition[];
  bestPosition?: StockPosition;
  worstPosition?: StockPosition;
}

export interface CurrentHolding {
  id: string;
  name: string;
  symbol?: string;
  shares: number;
  totalCost: number;
  averageCost: number;
  latestPrice?: number;
  latestPriceDate?: string;
  /** Present only when every underlying account lot has a current close. */
  marketValue?: number;
  unrealizedPnl?: number;
  displayValue: number;
}

function groupKey(trade: StockTrade): string {
  return [trade.ownership, trade.account, trade.name].join('¦');
}

function sortTrades(trades: StockTrade[]): StockTrade[] {
  return [...trades].sort((a, b) => (
    a.date.localeCompare(b.date) || a.lineNumber - b.lineNumber
  ));
}

function buildPosition(
  key: string,
  lots: StockLot[],
  quotes: Record<string, StockPriceQuote>,
): StockPosition {
  const shares = lots.reduce((sum, lot) => sum + lot.shares, 0);
  const totalCost = lots.reduce(
    (sum, lot) => sum + roundStockPrincipal(lot.purchasePrice, lot.shares),
    0,
  );
  const first = lots[0];
  const quote = first.symbol ? quotes[first.symbol] : undefined;
  const marketValue = quote ? quote.close * shares : undefined;
  const unrealizedPnl = marketValue === undefined ? undefined : marketValue - totalCost;

  return {
    id: key,
    name: first.name,
    symbol: first.symbol,
    account: first.account,
    ownership: first.ownership,
    shares,
    averageCost: shares > 0 ? totalCost / shares : 0,
    totalCost,
    latestPrice: quote?.close,
    latestPriceDate: quote?.date,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent: unrealizedPnl === undefined || totalCost === 0
      ? undefined
      : (unrealizedPnl / totalCost) * 100,
  };
}

function positionValue(position: StockPosition): number {
  return position.marketValue ?? position.totalCost;
}

function positionMergeKey(position: StockPosition): string {
  return position.symbol || `name:${position.name}`;
}

function positionDisplayName(position: StockPosition): string {
  return position.symbol ? `${position.name} ${position.symbol}` : position.name;
}

/** Merge account-level FIFO positions into one current balance per tradable symbol. */
export function buildCurrentHoldings(positions: StockPosition[]): CurrentHolding[] {
  const groups = new Map<string, StockPosition[]>();

  positions.forEach(position => {
    if (position.shares <= 0) return;
    const key = positionMergeKey(position);
    groups.set(key, [...(groups.get(key) || []), position]);
  });

  return Array.from(groups.entries()).map(([id, parts]) => {
    const shares = parts.reduce((sum, position) => sum + position.shares, 0);
    const totalCost = parts.reduce((sum, position) => sum + position.totalCost, 0);
    const fullyPriced = parts.every(position => position.marketValue !== undefined);
    const marketValue = fullyPriced
      ? parts.reduce((sum, position) => sum + (position.marketValue || 0), 0)
      : undefined;
    const priced = parts.find(position => position.latestPrice !== undefined);
    const latestPriceDate = parts
      .map(position => position.latestPriceDate)
      .filter((date): date is string => Boolean(date))
      .sort()
      .pop();

    return {
      id,
      name: parts[0].name,
      symbol: parts[0].symbol,
      shares,
      totalCost,
      averageCost: shares > 0 ? totalCost / shares : 0,
      latestPrice: priced?.latestPrice,
      latestPriceDate,
      marketValue,
      unrealizedPnl: marketValue === undefined ? undefined : marketValue - totalCost,
      displayValue: marketValue ?? totalCost,
    };
  }).sort((a, b) => b.displayValue - a.displayValue || a.name.localeCompare(b.name));
}

/** Merge personal + shared lots of the same symbol for overview allocation. */
function buildAllocation(
  positions: StockPosition[],
  totalValue: number,
  maxItems = 4,
): AllocationItem[] {
  if (totalValue <= 0) return [];

  const merged = new Map<string, { name: string; value: number }>();
  positions.forEach(position => {
    const key = positionMergeKey(position);
    const existing = merged.get(key);
    const value = positionValue(position);
    if (existing) {
      existing.value += value;
    } else {
      merged.set(key, { name: positionDisplayName(position), value });
    }
  });

  const ranked = Array.from(merged.entries())
    .map(([id, item]) => ({
      id,
      name: item.name,
      value: item.value,
      weight: (item.value / totalValue) * 100,
    }))
    .sort((a, b) => b.value - a.value);

  const visible = ranked.slice(0, maxItems);
  const otherValue = ranked.slice(maxItems).reduce((sum, item) => sum + item.value, 0);
  if (otherValue > 0) {
    visible.push({
      id: '__other__',
      name: '其他',
      value: otherValue,
      weight: (otherValue / totalValue) * 100,
    });
  }
  return visible;
}

function mergeMoversBySymbol(
  positions: StockPosition[],
  previousQuotes: Record<string, StockPriceQuote>,
): PositionMover[] {
  const moverMap = new Map<string, PositionMover>();

  positions.forEach(position => {
    const previous = position.symbol ? previousQuotes[position.symbol] : undefined;
    if (!previous || position.latestPrice === undefined) return;

    const change = (position.latestPrice - previous.close) * position.shares;
    const changePercent = previous.close > 0
      ? ((position.latestPrice - previous.close) / previous.close) * 100
      : 0;
    const key = positionMergeKey(position);
    const existing = moverMap.get(key);

    if (existing) {
      existing.shares += position.shares;
      existing.change += change;
      return;
    }

    moverMap.set(key, {
      id: key,
      name: position.name,
      symbol: position.symbol,
      shares: position.shares,
      previousClose: previous.close,
      currentClose: position.latestPrice,
      change,
      changePercent,
      date: position.latestPriceDate,
    });
  });

  return Array.from(moverMap.values())
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/** Build portfolio-level insight suitable for daily close data and FIFO lots. */
export function buildPortfolioInsights(
  positions: StockPosition[],
  realizedTrades: StockRealizedTrade[],
  previousQuotes: Record<string, StockPriceQuote> = {},
): PortfolioInsights {
  const totalMarketValue = positions.reduce((sum, position) => sum + positionValue(position), 0);
  const totalCost = positions.reduce((sum, position) => sum + position.totalCost, 0);
  const unrealizedPnl = positions.reduce((sum, position) => sum + (position.unrealizedPnl || 0), 0);
  const realizedPnl = realizedTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const realizedCost = realizedTrades.reduce(
    (sum, trade) => sum + roundStockPrincipal(trade.costPrice, trade.shares),
    0,
  );
  const totalInvestedCost = totalCost + realizedCost;

  const movers = mergeMoversBySymbol(positions, previousQuotes);
  const dayPnl = movers.reduce((sum, mover) => sum + mover.change, 0);
  const previousValue = movers.reduce(
    (sum, mover) => sum + mover.previousClose * mover.shares,
    0,
  );
  const dates = positions
    .map(position => position.latestPriceDate)
    .filter((date): date is string => Boolean(date))
    .sort();

  const accountMap = new Map<string, number>();
  positions.forEach(position => {
    accountMap.set(
      position.account,
      (accountMap.get(position.account) || 0) + positionValue(position),
    );
  });
  const accountAllocation = Array.from(accountMap.entries())
    .map(([account, value]) => ({
      id: account,
      name: account,
      value,
      weight: totalMarketValue > 0 ? (value / totalMarketValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const mergedBySymbol = buildAllocation(positions, totalMarketValue, positions.length);
  const top1Weight = mergedBySymbol[0]?.weight ?? 0;
  const top3Weight = mergedBySymbol
    .filter(item => item.id !== '__other__')
    .slice(0, 3)
    .reduce((sum, item) => sum + item.weight, 0);

  const positionsWithPnl = positions.filter(
    position => position.unrealizedPnl !== undefined,
  );
  const bestPosition = positionsWithPnl.length > 0
    ? [...positionsWithPnl].sort(
      (a, b) => (b.unrealizedPnl || 0) - (a.unrealizedPnl || 0),
    )[0]
    : undefined;
  const worstPosition = positionsWithPnl.length > 0
    ? [...positionsWithPnl].sort(
      (a, b) => (a.unrealizedPnl || 0) - (b.unrealizedPnl || 0),
    )[0]
    : undefined;

  return {
    totalMarketValue,
    totalCost,
    unrealizedPnl,
    realizedPnl,
    totalPnl: unrealizedPnl + realizedPnl,
    totalReturnRate: totalInvestedCost > 0
      ? ((unrealizedPnl + realizedPnl) / totalInvestedCost) * 100
      : 0,
    dayPnl,
    dayPnlPercent: previousValue > 0 ? (dayPnl / previousValue) * 100 : 0,
    dayAdvances: movers.filter(mover => mover.change > 0).length,
    dayDeclines: movers.filter(mover => mover.change < 0).length,
    dayFlat: movers.filter(mover => mover.change === 0).length,
    dayValuedAt: dates[dates.length - 1],
    movers,
    allocation: buildAllocation(positions, totalMarketValue, 4),
    accountAllocation,
    top1Weight,
    top3Weight,
    concentrationStatus: top1Weight >= 40 || top3Weight >= 75
      ? 'high'
      : top1Weight >= 25 || top3Weight >= 55
        ? 'watch'
        : 'balanced',
    missingPrices: positions.filter(position => position.marketValue === undefined),
    bestPosition,
    worstPosition,
  };
}

/** Build current holdings and realized P&L using FIFO matching (+ cash dividends). */
export function buildPortfolio(
  inputTrades: StockTrade[],
  quotes: Record<string, StockPriceQuote> = {},
  dividends: StockDividend[] = [],
): PortfolioResult {
  const lotsByGroup = new Map<string, StockLot[]>();
  const realizedTrades: StockRealizedTrade[] = [];

  sortTrades(inputTrades).forEach(trade => {
    const key = groupKey(trade);
    const lots = lotsByGroup.get(key) || [];
    lotsByGroup.set(key, lots);

    if (trade.side === 'buy') {
      if (!trade.purchasePrice) return;
      lots.push({
        id: trade.id,
        name: trade.name,
        symbol: trade.symbol,
        account: trade.account,
        ownership: trade.ownership,
        shares: trade.shares,
        purchasePrice: trade.purchasePrice,
        date: trade.date,
      });
      return;
    }

    if (!trade.costPrice || !trade.salePrice) return;

    let remaining = trade.shares;
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.shares);
      lot.shares -= matched;
      remaining -= matched;
      if (lot.shares <= 0) lots.shift();
    }

    realizedTrades.push({
      id: trade.id,
      kind: 'sell',
      name: trade.name,
      symbol: trade.symbol,
      account: trade.account,
      ownership: trade.ownership,
      date: trade.date,
      shares: trade.shares,
      costPrice: trade.costPrice,
      salePrice: trade.salePrice,
      pnl: roundStockPrincipal(trade.salePrice, trade.shares)
        - roundStockPrincipal(trade.costPrice, trade.shares),
    });
  });

  dividends.forEach(dividend => {
    realizedTrades.push({
      id: dividend.id,
      kind: 'dividend',
      name: dividend.name,
      symbol: dividend.symbol,
      account: dividend.account,
      ownership: dividend.ownership,
      date: dividend.date,
      shares: dividend.shares,
      costPrice: 0,
      salePrice: dividend.dividendPerShare,
      dividendPerShare: dividend.dividendPerShare,
      pnl: dividend.amount,
    });
  });

  const positions = Array.from(lotsByGroup.entries())
    .filter(([, lots]) => lots.length > 0)
    .map(([key, lots]) => buildPosition(key, lots, quotes))
    .sort((a, b) => {
      const marketA = a.marketValue ?? -Infinity;
      const marketB = b.marketValue ?? -Infinity;
      return marketA !== marketB ? marketB - marketA : a.name.localeCompare(b.name);
    });

  return {
    positions,
    realizedTrades: realizedTrades.sort((a, b) => b.date.localeCompare(a.date)),
    realizedPnl: realizedTrades.reduce((sum, trade) => sum + trade.pnl, 0),
  };
}
