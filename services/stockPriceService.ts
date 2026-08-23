import * as FileSystem from 'expo-file-system/legacy';

export interface StockPriceQuote {
  symbol: string;
  date: string;
  close: number;
}

export interface StockPriceCache {
  version: 1;
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
  return { version: 1, syncedAt: null, prices: {} };
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

function isCache(value: any): value is StockPriceCache {
  return Boolean(value)
    && value.version === 1
    && typeof value.prices === 'object'
    && value.prices !== null;
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
    version: 1,
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

/** Refresh daily closes; a failed symbol keeps its existing cached prices. */
export async function syncStockPrices(
  symbols: string[],
  options: { days?: number; today?: Date; force?: boolean } = {},
): Promise<StockPriceSyncResult> {
  const today = options.today || new Date();
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
  let cache = await loadStockPriceCache();
  const sameDay = Boolean(cache.syncedAt && toCacheDate(new Date(cache.syncedAt)) === toCacheDate(today));

  if (!options.force && sameDay && uniqueSymbols.every(symbol => Object.keys(cache.prices[symbol] || {}).length > 0)) {
    return { cache, errors: [], updatedSymbols: [] };
  }

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (options.days || 45));
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
