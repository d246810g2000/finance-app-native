import type { RawRecord } from '../types';
import {
  deriveStockData,
  StockNoteIssue,
  StockOwnership,
  StockTrade,
  withResolvedDividendSymbols,
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
import { SHARED_ACCOUNTS } from '../constants';

export interface InvestmentViewModelInput {
  records: RawRecord[];
  ownership: 'all' | StockOwnership;
  account?: string | null;
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
  const parsed = deriveStockData(options.records);
  const trades = withResolvedSymbols(parsed.trades, options.byName)
    .filter(trade => options.ownership === 'all' || trade.ownership === options.ownership);
  const dividends = withResolvedDividendSymbols(parsed.dividends, options.byName)
    .filter(dividend => options.ownership === 'all' || dividend.ownership === options.ownership);
  return Array.from(new Set(
    [
      ...trades.map(trade => trade.symbol),
      ...dividends.map(dividend => dividend.symbol),
    ].filter((symbol): symbol is string => Boolean(symbol)),
  ));
}

export function buildInvestmentScreenData(input: InvestmentViewModelInput) {
  const parsed = deriveStockData(input.records);
  const stockData = {
    ...parsed,
    trades: withResolvedSymbols(parsed.trades, input.infoCache?.byName),
    dividends: withResolvedDividendSymbols(parsed.dividends, input.infoCache?.byName),
  };
  const filteredTrades = input.ownership === 'all'
    ? stockData.trades
    : stockData.trades.filter(trade => trade.ownership === input.ownership);
  const filteredDividends = input.ownership === 'all'
    ? stockData.dividends
    : stockData.dividends.filter(dividend => dividend.ownership === input.ownership);
  const accountTrades = input.account
    ? filteredTrades.filter(trade => trade.account === input.account)
    : filteredTrades;
  const accountDividends = input.account
    ? filteredDividends.filter(dividend => dividend.account === input.account)
    : filteredDividends;
  const ownershipIssues = input.ownership === 'all'
    ? stockData.issues
    : stockData.issues.filter(issue => {
      const isShared = SHARED_ACCOUNTS.includes(issue.account)
        || issue.account === '共享股票帳戶';
      return input.ownership === 'shared' ? isShared : !isShared;
    });
  const filteredIssues = input.account
    ? ownershipIssues.filter(issue => issue.account === input.account)
    : ownershipIssues;
  const symbols = Array.from(new Set(
    [
      ...accountTrades.map(trade => trade.symbol),
      ...accountDividends.map(dividend => dividend.symbol),
    ].filter((symbol): symbol is string => Boolean(symbol)),
  ));
  const quotes = input.priceCache ? getLatestQuotes(input.priceCache, symbols) : {};
  const previousQuotes = input.priceCache ? getPreviousQuotes(input.priceCache, symbols) : {};
  const portfolio = buildPortfolio(accountTrades, quotes, accountDividends);
  const insights = buildPortfolioInsights(
    portfolio.positions,
    portfolio.realizedTrades,
    previousQuotes,
  );
  const rangeRealizedTrades = filterByDateRange(portfolio.realizedTrades, input.startDate, input.endDate);
  const periodRealizedPnl = sumRealizedPnl(rangeRealizedTrades);
  const rangeFilteredTrades = filterByDateRange(accountTrades, input.startDate, input.endDate)
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
    filteredTrades: accountTrades,
    filteredDividends: accountDividends,
    hasStockData: accountTrades.length > 0
      || accountDividends.length > 0
      || filteredIssues.length > 0,
    insights,
    assetTimeline: computeInvestmentAssetTimeline(accountTrades, quotes),
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
