import type { RawRecord } from '../types';
import {
  deriveStockData,
  StockNoteIssue,
  StockOwnership,
  StockTrade,
  withResolvedSymbols,
} from '../services/stockTradeService';
import {
  buildCurrentHoldings,
  buildPortfolio,
  buildPortfolioInsights,
  type CurrentHolding,
} from '../services/portfolioService';
import {
  filterByDateRange,
  sumRealizedPnl,
} from '../services/investmentFilters';
import {
  getLatestQuotes,
  getPreviousQuotes,
  StockPriceCache,
} from '../services/stockPriceService';
import { StockInfoCache } from '../services/stockInfoService';
import { computeInvestmentAssetTimeline } from '../services/investmentTimelineService';
import { buildInvestmentPnlViewModel } from './investmentPnlViewModel';

export interface InvestmentViewModelInput {
  records: RawRecord[];
  ownership: 'all' | StockOwnership;
  infoCache: StockInfoCache | null;
  priceCache: StockPriceCache | null;
  startDate: Date;
  endDate: Date;
}

export function collectInvestmentSymbols(options: {
  records: RawRecord[];
  ownership: 'all' | StockOwnership;
  byName?: Parameters<typeof withResolvedSymbols>[1];
}): string[] {
  const trades = withResolvedSymbols(deriveStockData(options.records).trades, options.byName);
  return Array.from(new Set(
    trades
      .filter(trade => options.ownership === 'all' || trade.ownership === options.ownership)
      .map(trade => trade.symbol)
      .filter((symbol): symbol is string => Boolean(symbol)),
  ));
}

export function buildInvestmentScreenData(input: InvestmentViewModelInput) {
  const parsed = deriveStockData(input.records);
  const stockData = {
    ...parsed,
    trades: withResolvedSymbols(parsed.trades, input.infoCache?.byName),
  };
  const filteredTrades = input.ownership === 'all'
    ? stockData.trades
    : stockData.trades.filter(trade => trade.ownership === input.ownership);
  const filteredIssues = input.ownership === 'all'
    ? stockData.issues
    : stockData.issues.filter(issue => (
      input.ownership === 'shared'
        ? issue.account === '共享股票帳戶'
        : issue.account !== '共享股票帳戶'
    ));
  const symbols = Array.from(new Set(
    filteredTrades
      .map(trade => trade.symbol)
      .filter((symbol): symbol is string => Boolean(symbol)),
  ));
  const quotes = input.priceCache ? getLatestQuotes(input.priceCache, symbols) : {};
  const previousQuotes = input.priceCache ? getPreviousQuotes(input.priceCache, symbols) : {};
  const portfolio = buildPortfolio(filteredTrades, quotes);
  const insights = buildPortfolioInsights(
    portfolio.positions,
    portfolio.realizedTrades,
    previousQuotes,
  );
  const rangeRealizedTrades = filterByDateRange(portfolio.realizedTrades, input.startDate, input.endDate);
  const periodRealizedPnl = sumRealizedPnl(rangeRealizedTrades);
  const rangeFilteredTrades = filterByDateRange(filteredTrades, input.startDate, input.endDate)
    .sort((a, b) => b.date.localeCompare(a.date) || b.lineNumber - a.lineNumber);
  const moverByPositionId = new Map(insights.movers.map(mover => [mover.id, mover]));
  const currentHoldings = buildCurrentHoldings(portfolio.positions);
  const pnl = buildInvestmentPnlViewModel({
    holdings: currentHoldings,
    moversById: moverByPositionId,
  });

  return {
    currentHoldings,
    filteredIssues,
    filteredTrades,
    hasStockData: stockData.trades.length > 0 || stockData.issues.length > 0,
    insights,
    assetTimeline: computeInvestmentAssetTimeline(filteredTrades, quotes),
    moverByPositionId,
    portfolio,
    rangeFilteredTrades,
    rangeRealizedTrades,
    periodRealizedPnl,
    pnl,
    stockData,
    symbols,
  };
}
