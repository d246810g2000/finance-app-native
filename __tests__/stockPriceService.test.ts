import * as FileSystem from 'expo-file-system/legacy';
import {
  createEmptyStockPriceCache,
  getLatestQuotes,
  getPreviousQuotes,
  loadStockPriceCache,
  mergeStockPriceCache,
  syncStockPrices,
} from '../services/stockPriceService';

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

describe('stock price cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('merges quotes without losing existing dates', () => {
    const merged = mergeStockPriceCache(createEmptyStockPriceCache(), [
      { symbol: '2330', date: '20260810', close: 1000 },
    ], new Date(2026, 7, 20));

    const mergedAgain = mergeStockPriceCache(merged, [
      { symbol: '2330', date: '20260811', close: 1010 },
    ], new Date(2026, 7, 21));

    expect(mergedAgain.prices['2330']).toEqual({
      '20260810': 1000,
      '20260811': 1010,
    });
  });

  it('returns the latest quote on or before today', () => {
    const cache = mergeStockPriceCache(createEmptyStockPriceCache(), [
      { symbol: '2330', date: '20260810', close: 1000 },
      { symbol: '2330', date: '20260820', close: 1010 },
      { symbol: '2330', date: '20260830', close: 1020 },
    ]);

    const quotes = getLatestQuotes(cache, ['2330'], new Date(2026, 7, 21));
    expect(quotes['2330']).toEqual({ symbol: '2330', date: '20260820', close: 1010 });
  });

  it('returns the previous trading quote', () => {
    const cache = mergeStockPriceCache(createEmptyStockPriceCache(), [
      { symbol: '2330', date: '20260818', close: 990 },
      { symbol: '2330', date: '20260819', close: 1000 },
      { symbol: '2330', date: '20260820', close: 1010 },
    ]);

    const quotes = getPreviousQuotes(cache, ['2330'], new Date(2026, 7, 20));
    expect(quotes['2330']).toEqual({ symbol: '2330', date: '20260819', close: 1000 });
  });

  it('falls back to an empty cache when stored data is invalid', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedRead.mockResolvedValue('{not-json');

    await expect(loadStockPriceCache()).resolves.toEqual(createEmptyStockPriceCache());
  });

  it('fetches FinMind closes and writes them to the cache', async () => {
    mockedGetInfo.mockResolvedValue({ exists: false });
    mockedWrite.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        msg: 'success',
        data: [
          { stock_id: '2330', date: '2026-08-20', close: 1010 },
          { stock_id: '2330', date: 'invalid', close: 999 },
        ],
      }),
    }) as any;

    const result = await syncStockPrices(['2330'], {
      today: new Date(2026, 7, 21),
      force: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.updatedSymbols).toEqual(['2330']);
    expect(result.cache.prices['2330']['20260820']).toBe(1010);
    expect(mockedWrite).toHaveBeenCalledTimes(1);
  });

  it('keeps existing cached prices when FinMind fails', async () => {
    const existing = mergeStockPriceCache(createEmptyStockPriceCache(), [
      { symbol: '2330', date: '20260819', close: 1000 },
    ], new Date(2026, 7, 19));
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedRead.mockResolvedValue(JSON.stringify(existing));
    mockedWrite.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    const result = await syncStockPrices(['2330'], {
      today: new Date(2026, 7, 20),
      force: true,
    });

    expect(result.errors).toEqual(['2330: offline']);
    expect(result.cache.prices['2330']['20260819']).toBe(1000);
  });
});
