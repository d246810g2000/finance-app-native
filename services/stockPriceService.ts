import * as FileSystem from 'expo-file-system/legacy';

export interface StockPriceQuote {
  symbol: string;
  date: string;
  close: number;
}

export interface StockPriceCache {
  version: 1 | 2;
  syncedAt: string | null;
  prices: Record<string, Record<string, number>>;
}

export interface StockPriceSyncResult {
  cache: StockPriceCache;
  errors: string[];
  updatedSymbols: string[];
}

const CACHE_FILE_NAME = 'stock_daily_prices.json';
const API_BASE = 'https://api.finmindtrade.com/api/v4/data';

export function createEmptyStockPriceCache(): StockPriceCache {
  return { version: 2, syncedAt: null, prices: {} };
}

function cacheUri(): string {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  return `${base || ''}${CACHE_FILE_NAME}`;
}

export function toCacheDate(value: Date): string {
  return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, '0')}${String(value.getDate()).padStart(2, '0')}`;
}

function toApiDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function isCache(value: unknown): value is StockPriceCache {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StockPriceCache>;
  return (candidate.version === 1 || candidate.version === 2)
    && typeof candidate.prices === 'object'
    && candidate.prices !== null;
}

export function mergeStockPriceCache(
  cache: StockPriceCache,
  quotes: StockPriceQuote[],
  syncedAt = new Date(),
): StockPriceCache {
  const prices = { ...cache.prices };

  quotes.forEach(quote => {
    if (!quote.symbol || !/^\d{8}$/.test(quote.date) || !Number.isFinite(quote.close) || quote.close <= 0) return;
    prices[quote.symbol] = {
      ...(prices[quote.symbol] || {}),
      [quote.date]: quote.close,
    };
  });

  return {
    version: 2,
    syncedAt: syncedAt.toISOString(),
    prices,
  };
}

export async function loadStockPriceCache(): Promise<StockPriceCache> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(cacheUri());
    if (!fileInfo.exists) return createEmptyStockPriceCache();

    const raw = await FileSystem.readAsStringAsync(cacheUri(), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw);
    return isCache(parsed) ? parsed : createEmptyStockPriceCache();
  } catch (error) {
    console.warn('Failed to load stock price cache', error);
    return createEmptyStockPriceCache();
  }
}

async function saveStockPriceCache(cache: StockPriceCache): Promise<void> {
  await FileSystem.writeAsStringAsync(cacheUri(), JSON.stringify(cache), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export function getLatestQuotes(
  cache: StockPriceCache,
  symbols: string[],
  today = new Date(),
): Record<string, StockPriceQuote> {
  const maxDate = toCacheDate(today);
  const result: Record<string, StockPriceQuote> = {};

  symbols.forEach(symbol => {
    const dates = Object.keys(cache.prices[symbol] || {})
      .filter(date => date <= maxDate)
      .sort();
    const latest = dates[dates.length - 1];
    if (!latest) return;

    result[symbol] = {
      symbol,
      date: latest,
      close: cache.prices[symbol][latest],
    };
  });

  return result;
}

export function getPreviousQuotes(
  cache: StockPriceCache,
  symbols: string[],
  today = new Date(),
): Record<string, StockPriceQuote> {
  const maxDate = toCacheDate(today);
  const result: Record<string, StockPriceQuote> = {};

  symbols.forEach(symbol => {
    const dates = Object.keys(cache.prices[symbol] || {})
      .filter(date => date <= maxDate)
      .sort();
    const previous = dates[dates.length - 2];
    if (!previous) return;

    result[symbol] = {
      symbol,
      date: previous,
      close: cache.prices[symbol][previous],
    };
  });

  return result;
}

async function fetchSymbolPrices(symbol: string, startDate: Date): Promise<StockPriceQuote[]> {
  const url = `${API_BASE}?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(symbol)}&start_date=${toApiDate(startDate)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json();
  if (payload?.status !== 200 || payload?.msg !== 'success' || !Array.isArray(payload.data)) {
    throw new Error(payload?.msg || 'FinMind 回應失敗');
  }

  return payload.data
    .map((row: any) => ({
      symbol: String(row.stock_id || symbol),
      date: String(row.date || '').replace(/-/g, ''),
      close: Number(row.close),
    }))
    .filter((quote: StockPriceQuote) => (
      /^\d{8}$/.test(quote.date) && Number.isFinite(quote.close) && quote.close > 0
    ));
}

/** Get the latest quote, or the quote `pointsAgo` trading observations earlier. */
export function getTradingPointQuote(
  cache: StockPriceCache,
  symbol: string,
  pointsAgo: number,
  today = new Date(),
): StockPriceQuote | undefined {
  const maxDate = toCacheDate(today);
  const dates = Object.keys(cache.prices[symbol] || {})
    .filter(date => date <= maxDate)
    .sort();
  const date = dates[dates.length - 1 - Math.max(0, pointsAgo)];
  if (!date) return undefined;

  return { symbol, date, close: cache.prices[symbol][date] };
}

/** Get the last close on or before the prior year end, for year-to-date return. */
export function getYearStartQuote(
  cache: StockPriceCache,
  symbol: string,
  today = new Date(),
): StockPriceQuote | undefined {
  const year = today.getFullYear();
  const maxDate = `${year - 1}1231`;
  const dates = Object.keys(cache.prices[symbol] || {})
    .filter(date => date <= maxDate)
    .sort();
  const date = dates[dates.length - 1];
  if (!date) return undefined;

  return { symbol, date, close: cache.prices[symbol][date] };
}

export async function syncStockPrices(
  symbols: string[],
  options: { days?: number; today?: Date; force?: boolean } = {},
): Promise<StockPriceSyncResult> {
  const today = options.today || new Date();
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
  let cache = await loadStockPriceCache();
  const sameDay = Boolean(cache.syncedAt && toCacheDate(new Date(cache.syncedAt)) === toCacheDate(today));
  // Version 1 caches used the old short sync window. Refresh once with the longer
  // window so period returns have enough history.
  const needsHistoryBackfill = cache.version < 2;

  if (
    !options.force
    && !needsHistoryBackfill
    && sameDay
    && uniqueSymbols.every(symbol => Object.keys(cache.prices[symbol] || {}).length > 0)
  ) {
    return { cache, errors: [], updatedSymbols: [] };
  }

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (options.days || 400));
  const errors: string[] = [];
  const updatedSymbols: string[] = [];
  const quotes: StockPriceQuote[] = [];

  for (const symbol of uniqueSymbols) {
    try {
      const symbolQuotes = await fetchSymbolPrices(symbol, startDate);
      quotes.push(...symbolQuotes);
      if (symbolQuotes.length > 0) updatedSymbols.push(symbol);
    } catch (error: any) {
      errors.push(`${symbol}: ${error?.message || '同步失敗'}`);
    }
  }

  cache = mergeStockPriceCache(cache, quotes, today);
  try {
    await saveStockPriceCache(cache);
  } catch (error: any) {
    errors.push(`快取寫入失敗: ${error?.message || '未知錯誤'}`);
  }

  return { cache, errors, updatedSymbols };
}
