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
const dateIndexCache = new WeakMap<StockPriceCache, Map<string, string[]>>();

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

function getDateIndex(cache: StockPriceCache, symbol: string): string[] {
  let index = dateIndexCache.get(cache);
  if (!index) {
    index = new Map<string, string[]>();
    dateIndexCache.set(cache, index);
  }
  const cachedDates = index.get(symbol);
  if (cachedDates) return cachedDates;
  const dates = Object.keys(cache.prices[symbol] || {}).sort();
  index.set(symbol, dates);
  return dates;
}

function datesOnOrBefore(cache: StockPriceCache, symbol: string, maxDate: string): string[] {
  return getDateIndex(cache, symbol).filter(date => date <= maxDate);
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
    const dates = datesOnOrBefore(cache, symbol, maxDate);
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
    const dates = datesOnOrBefore(cache, symbol, maxDate);
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

async function fetchSymbolPrices(
  symbol: string,
  startDate: Date,
  options: { timeoutMs: number; retries: number },
): Promise<StockPriceQuote[]> {
  const url = `${API_BASE}?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(symbol)}&start_date=${toApiDate(startDate)}`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
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
    } catch (error) {
      lastError = error instanceof Error && error.name === 'AbortError'
        ? new Error(`請求逾時（${options.timeoutMs}ms）`)
        : error;
      if (attempt < options.retries) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('同步失敗');
}

/** Get the latest quote, or the quote `pointsAgo` trading observations earlier. */
export function getTradingPointQuote(
  cache: StockPriceCache,
  symbol: string,
  pointsAgo: number,
  today = new Date(),
): StockPriceQuote | undefined {
  const maxDate = toCacheDate(today);
  const dates = datesOnOrBefore(cache, symbol, maxDate);
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
  const dates = datesOnOrBefore(cache, symbol, maxDate);
  const date = dates[dates.length - 1];
  if (!date) return undefined;

  return { symbol, date, close: cache.prices[symbol][date] };
}

/** Get the first available trading close in the current calendar year. */
export function getFirstTradingYearQuote(
  cache: StockPriceCache,
  symbol: string,
  today = new Date(),
): StockPriceQuote | undefined {
  const year = today.getFullYear();
  const minDate = `${year}0101`;
  const maxDate = toCacheDate(today);
  const dates = getDateIndex(cache, symbol)
    .filter(date => date >= minDate && date <= maxDate);
  const date = dates[0];
  if (!date) return undefined;

  return { symbol, date, close: cache.prices[symbol][date] };
}

export async function syncStockPrices(
  symbols: string[],
  options: {
    days?: number;
    today?: Date;
    force?: boolean;
    concurrency?: number;
    timeoutMs?: number;
    retries?: number;
  } = {},
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

  const workerCount = Math.max(1, Math.min(options.concurrency || 4, uniqueSymbols.length || 1));
  let cursor = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < uniqueSymbols.length) {
      const symbol = uniqueSymbols[cursor];
      cursor += 1;
      try {
        const symbolQuotes = await fetchSymbolPrices(symbol, startDate, {
          timeoutMs: Math.max(1000, options.timeoutMs || 15000),
          retries: Math.max(0, options.retries ?? 1),
        });
        quotes.push(...symbolQuotes);
        if (symbolQuotes.length > 0) updatedSymbols.push(symbol);
      } catch (error: any) {
        errors.push(`${symbol}: ${error?.message || '同步失敗'}`);
      }
    }
  });
  await Promise.all(workers);

  cache = mergeStockPriceCache(cache, quotes, today);
  try {
    await saveStockPriceCache(cache);
  } catch (error: any) {
    errors.push(`快取寫入失敗: ${error?.message || '未知錯誤'}`);
  }

  return { cache, errors, updatedSymbols };
}
