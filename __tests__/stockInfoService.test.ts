import * as FileSystem from 'expo-file-system/legacy';
import {
  buildStockNameMap,
  createEmptyStockInfoCache,
  loadStockInfoCache,
  syncStockInfo,
} from '../services/stockInfoService';
import { resolveStockSymbol, withResolvedSymbols } from '../services/stockTradeService';
import { StockTrade } from '../services/stockTradeService';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/document/',
  cacheDirectory: '/cache/',
  EncodingType: { UTF8: 'utf8' },
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

const mockedGetInfo = FileSystem.getInfoAsync as jest.Mock;
const mockedRead = FileSystem.readAsStringAsync as jest.Mock;
const mockedWrite = FileSystem.writeAsStringAsync as jest.Mock;

describe('stock info name map', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the newest FinMind row per symbol when building the name map', () => {
    const byName = buildStockNameMap([
      { symbol: '00687B', name: '國泰20年美債', type: 'tpex', date: '2024-12-30' },
      { symbol: '00687B', name: '國泰20年美債', type: 'tpex', date: '2026-08-23' },
      { symbol: '2330', name: '台積電', type: 'twse', date: '2026-08-23' },
    ]);

    expect(byName).toEqual({
      國泰20年美債: '00687B',
      台積電: '2330',
    });
  });

  it('resolves official FinMind names and short-note aliases', () => {
    const byName = { 國泰20年美債: '00687B', 台積電: '2330' };

    expect(resolveStockSymbol('國泰20年美債', byName)).toBe('00687B');
    expect(resolveStockSymbol('國泰美債', byName)).toBe('00687B');
    expect(resolveStockSymbol('美債', byName)).toBe('00687B');
    expect(resolveStockSymbol('台積電', byName)).toBe('2330');
    expect(resolveStockSymbol('未知股票', byName)).toBeUndefined();
  });

  it('enriches trades with resolved symbols', () => {
    const trades: StockTrade[] = [{
      id: '1',
      sourceId: '1',
      date: '20241204',
      side: 'sell',
      name: '國泰美債',
      shares: 2000,
      costPrice: 30.195,
      salePrice: 31.26,
      amount: 62520,
      sourceAmount: 60390,
      account: '股票',
      ownership: 'personal',
      lineNumber: 1,
      note: '',
    }];

    expect(withResolvedSymbols(trades)[0].symbol).toBe('00687B');
  });

  it('falls back to an empty cache when stored data is invalid', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedRead.mockResolvedValue('{not-json');

    await expect(loadStockInfoCache()).resolves.toEqual(createEmptyStockInfoCache());
  });

  it('fetches TaiwanStockInfo and caches the name map', async () => {
    mockedGetInfo.mockResolvedValue({ exists: false });
    mockedWrite.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        msg: 'success',
        data: [
          { stock_id: '00687B', stock_name: '國泰20年美債', type: 'tpex', date: '2026-08-23' },
          { stock_id: '2330', stock_name: '台積電', type: 'twse', date: '2026-08-23' },
        ],
      }),
    }) as any;

    const result = await syncStockInfo({
      today: new Date(2026, 7, 24),
      force: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.updated).toBe(true);
    expect(result.cache.byName).toEqual({
      國泰20年美債: '00687B',
      台積電: '2330',
    });
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous cache when FinMind fails', async () => {
    const existing = {
      version: 1 as const,
      syncedAt: '2026-08-20T00:00:00.000Z',
      byName: { 台積電: '2330' },
    };
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedRead.mockResolvedValue(JSON.stringify(existing));
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    const result = await syncStockInfo({
      today: new Date(2026, 7, 24),
      force: true,
    });

    expect(result.updated).toBe(false);
    expect(result.errors[0]).toContain('offline');
    expect(result.cache.byName).toEqual({ 台積電: '2330' });
  });
});
