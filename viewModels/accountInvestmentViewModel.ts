import type { RawRecord } from '../types';
import {
  deriveStockData,
  SECURITIES_ACCOUNTS,
  withResolvedDividendSymbols,
  withResolvedSymbols,
} from '../services/stockTradeService';
import { buildPortfolio, type StockPosition } from '../services/portfolioService';
import { getLatestQuotes, type StockPriceCache } from '../services/stockPriceService';
import type { StockInfoCache } from '../services/stockInfoService';
import { convertAmountToTwd } from '../services/core/parsing';

export type AccountInvestmentStatus =
  | 'synced'
  | 'partial_prices'
  | 'missing_cost'
  | 'mismatch';

export interface AccountInvestmentSummary {
  account: string;
  /** Incoming transfer amount recorded in the account ledger. */
  principal: number;
  /** Cost basis of positions that are still held. */
  holdingCost: number;
  marketValue?: number;
  unrealizedPnl?: number;
  unrealizedPnlPercent?: number;
  realizedPnl: number;
  positions: StockPosition[];
  pricedPositionCount: number;
  positionCount: number;
  latestPriceDate?: string;
  status: AccountInvestmentStatus;
  discrepancy?: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds account-level investment data without using the symbol-level holdings
 * shown by the investment overview. This keeps one account's figures auditable.
 */
export function buildAccountInvestmentSummary({
  records,
  account,
  priceCache,
  infoCache,
}: {
  records: RawRecord[];
  account: string;
  priceCache?: StockPriceCache | null;
  infoCache?: StockInfoCache | null;
}): AccountInvestmentSummary | null {
  if (!SECURITIES_ACCOUNTS.includes(account)) return null;

  const parsed = deriveStockData(records);
  const trades = withResolvedSymbols(parsed.trades, infoCache?.byName)
    .filter(trade => trade.account === account);
  const dividends = withResolvedDividendSymbols(parsed.dividends, infoCache?.byName)
    .filter(dividend => dividend.account === account);

  const symbols = Array.from(new Set([
    ...trades.map(trade => trade.symbol),
    ...dividends.map(dividend => dividend.symbol),
  ].filter((symbol): symbol is string => Boolean(symbol))));
  const quotes = priceCache ? getLatestQuotes(priceCache, symbols) : {};
  const portfolio = buildPortfolio(trades, quotes, dividends);
  const positions = portfolio.positions.filter(position => position.shares > 0);

  // The ledger's incoming transfers are the user's invested principal. Stock
  // income (sales/dividends) is intentionally excluded from this figure.
  const principal = records
    .filter(record => (
      record['收款(轉入)'] === account
      && String(record['分類'] || record['主類別'] || '') === '轉帳'
    ))
    .reduce((sum, record) => sum + Math.abs(convertAmountToTwd(record['金額'], record['幣別'])), 0);

  if (positions.length === 0 && principal === 0) return null;

  const priced = positions.filter(position => position.marketValue !== undefined);
  const holdingCost = positions.reduce((sum, position) => sum + position.totalCost, 0);
  const marketValue = priced.length === positions.length
    ? priced.reduce((sum, position) => sum + (position.marketValue || 0), 0)
    : undefined;
  const unrealizedPnl = marketValue === undefined ? undefined : marketValue - holdingCost;
  const latestPriceDate = priced
    .map(position => position.latestPriceDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .pop();
  const discrepancy = round(principal - holdingCost);
  const hasMismatch = Math.abs(discrepancy) >= 1;
  const status: AccountInvestmentStatus = positions.length === 0
    ? 'missing_cost'
    : hasMismatch
      ? 'mismatch'
      : priced.length < positions.length
        ? 'partial_prices'
        : 'synced';

  return {
    account,
    principal: Math.round(principal),
    holdingCost: Math.round(holdingCost),
    marketValue: marketValue === undefined ? undefined : Math.round(marketValue),
    unrealizedPnl: unrealizedPnl === undefined ? undefined : Math.round(unrealizedPnl),
    unrealizedPnlPercent: unrealizedPnl === undefined || holdingCost <= 0
      ? undefined
      : round((unrealizedPnl / holdingCost) * 100),
    realizedPnl: Math.round(portfolio.realizedPnl),
    positions,
    pricedPositionCount: priced.length,
    positionCount: positions.length,
    latestPriceDate,
    status,
    discrepancy: hasMismatch ? discrepancy : undefined,
  };
}
