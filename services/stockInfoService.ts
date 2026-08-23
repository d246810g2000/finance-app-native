import * as FileSystem from 'expo-file-system/legacy';

export interface StockInfoRow {
  symbol: string;
  name: string;
  type?: string;
  date?: string;
}

export interface StockInfoCache {
  version: 1;
  syncedAt: string | null;
  /** Official FinMind stock_name → stock_id */
  byName: Record<string, string>;
}

export interface StockInfoSyncResult {
  cache: StockInfoCache;
  errors: string[];
  updated: boolean;
}

const CACHE_FILE_NAME = 'stock_info.json';
const API_BASE = 'https://api.finmindtrade.com/api/v4/data';

export function createEmptyStockInfoCache(): StockInfoCache {
  return { version: 1, syncedAt: null, byName: {} };
}

function cacheUri(): string {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  return `${base || ''}${CACHE_FILE_NAME}`;
}

function toCacheDate(value: Date): string {
  return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, '0')}${String(value.getDate()).padStart(2, '0')}`;
}

function isCache(value: any): value is StockInfoCache {
  return Boolean(value)
    && value.version === 1
    && typeof value.byName === 'object'
    && value.byName !== null;
}

/** Prefer the newest FinMind row per stock_id, then map each stock_name → stock_id. */
export function buildStockNameMap(rows: StockInfoRow[]): Record<string, string> {
  const latestBySymbol = new Map<string, StockInfoRow>();

  rows.forEach(row => {
    if (!row.symbol || !row.name) return;
    const previous = latestBySymbol.get(row.symbol);
    if (!previous || String(row.date || '') >= String(previous.date || '')) {
      latestBySymbol.set(row.symbol, row);
    }
  });

  const byName: Record<string, string> = {};
  latestBySymbol.forEach(row => {
    byName[row.name] = row.symbol;
  });
  return byName;
}

export async function loadStockInfoCache(): Promise<StockInfoCache> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(cacheUri());
    if (!fileInfo.exists) return createEmptyStockInfoCache();

    const raw = await FileSystem.readAsStringAsync(cacheUri(), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw);
    return isCache(parsed) ? parsed : createEmptyStockInfoCache();
  } catch (error) {
    console.warn('Failed to load stock info cache', error);
    return createEmptyStockInfoCache();
  }
}

async function saveStockInfoCache(cache: StockInfoCache): Promise<void> {
  await FileSystem.writeAsStringAsync(cacheUri(), JSON.stringify(cache), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

async function fetchTaiwanStockInfo(): Promise<StockInfoRow[]> {
  const url = `${API_BASE}?dataset=TaiwanStockInfo`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json();
  if (payload?.status !== 200 || payload?.msg !== 'success' || !Array.isArray(payload.data)) {
    throw new Error(payload?.msg || 'FinMind 回應失敗');
  }

  return payload.data
    .map((row: any) => ({
      symbol: String(row.stock_id || '').trim(),
      name: String(row.stock_name || '').trim(),
      type: String(row.type || '').trim() || undefined,
      date: String(row.date || '').trim() || undefined,
    }))
    .filter((row: StockInfoRow) => Boolean(row.symbol && row.name));
}

/** Refresh the TaiwanStockInfo name→symbol map (free FinMind dataset). */
export async function syncStockInfo(
  options: { today?: Date; force?: boolean } = {},
): Promise<StockInfoSyncResult> {
  const today = options.today || new Date();
  let cache = await loadStockInfoCache();
  const sameDay = Boolean(cache.syncedAt && toCacheDate(new Date(cache.syncedAt)) === toCacheDate(today));
  const hasData = Object.keys(cache.byName).length > 0;

  if (!options.force && sameDay && hasData) {
    return { cache, errors: [], updated: false };
  }

  const errors: string[] = [];
  try {
    const rows = await fetchTaiwanStockInfo();
    cache = {
      version: 1,
      syncedAt: today.toISOString(),
      byName: buildStockNameMap(rows),
    };
    await saveStockInfoCache(cache);
    return { cache, errors, updated: true };
  } catch (error: any) {
    errors.push(`股票清單: ${error?.message || '同步失敗'}`);
    return { cache, errors, updated: false };
  }
}
