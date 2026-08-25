import type { CurrentHolding, PositionMover, StockPosition } from '../services/portfolioService';
import {
  createEmptyStockPriceCache,
  mergeStockPriceCache,
  StockPriceCache,
} from '../services/stockPriceService';
import {
  buildInvestmentPerformanceViewModel,
  sortInvestmentPositions,
} from '../viewModels/investmentPerformanceViewModel';

// syncStockPrices refreshes the on-disk cache; keep its optional network call offline.
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ status: 200, msg: 'success', data: [] }),
}) as unknown as typeof fetch;

function makeHolding(partial: Partial<CurrentHolding> & Pick<CurrentHolding, 'id' | 'name'>): CurrentHolding {
  return {
    shares: 1000,
    totalCost: 100000,
    averageCost: 100,
    displayValue: 100000,
    ...partial,
  };
}

function makePosition(partial: Partial<StockPosition> & Pick<StockPosition, 'id' | 'name'>): StockPosition {
  return {
    account: '股票',
    ownership: 'personal',
    shares: 1000,
    averageCost: 100,
    totalCost: 100000,
    ...partial,
  };
}

describe('investment performance view model', () => {
  it('returns an empty summary when there are no holdings', () => {
    const result = buildInvestmentPerformanceViewModel({
      holdings: [],
      priceCache: createEmptyStockPriceCache(),
      period: '1d',
    });

    expect(result.periodLabel).toBe('近1日');
    expect(result.rows).toEqual([]);
    expect(result.topRows).toEqual([]);
    expect(result.summary).toMatchObject({
      currentMarketValue: 0,
      baselineMarketValue: 0,
      marketValueChange: 0,
      changePercent: 0,
      availableCount: 0,
      unavailableCount: 0,
    });
  });

  it('compares current holdings with the selected trading point', () => {
    const priceCache = mergeStockPriceCache(createEmptyStockPriceCache(), [
      { symbol: '2330', date: '20260817', close: 99 },
      { symbol: '2330', date: '20260818', close: 100 },
      { symbol: '2330', date: '20260819', close: 101 },
      { symbol: '2330', date: '20260820', close: 102 },
      { symbol: '2330', date: '20260821', close: 104 },
      { symbol: '2330', date: '20260824', close: 110 },
    ], new Date(2026, 7, 24));

    const oneDay = buildInvestmentPerformanceViewModel({
      holdings: [makeHolding({ id: '2330', name: '台積電', symbol: '2330' })],
      priceCache,
      period: '1d',
      today: new Date(2026, 7, 25),
    });
    expect(oneDay.rows[0]).toMatchObject({
      baselinePrice: 104,
      baselineDate: '20260821',
      currentPrice: 110,
      currentDate: '20260824',
      changePercent: 5.77,
      marketValueChange: 6000,
      currentMarketValue: 110000,
    });

    const fiveDays = buildInvestmentPerformanceViewModel({
      holdings: [makeHolding({ id: '2330', name: '台積電', symbol: '2330' })],
      priceCache,
      period: '5d',
      today: new Date(2026, 7, 25),
    });
    expect(fiveDays.rows[0]).toMatchObject({
      baselinePrice: 100,
      baselineDate: '20260818',
      changePercent: 10,
      marketValueChange: 10000,
    });
  });

  it('uses the first trading close of the year for year-to-date performance', () => {
    const priceCache = mergeStockPriceCache(createEmptyStockPriceCache(), [
      { symbol: '2330', date: '20251231', close: 90 },
      { symbol: '2330', date: '20260104', close: 95 },
      { symbol: '2330', date: '20260824', close: 99 },
    ], new Date(2026, 7, 24));

    const result = buildInvestmentPerformanceViewModel({
      holdings: [makeHolding({ id: '2330', name: '台積電', symbol: '2330' })],
      priceCache,
      period: 'ytd',
      today: new Date(2026, 7, 25),
    });

    expect(result.rows[0]).toMatchObject({
      baselinePrice: 95,
      baselineDate: '20260104',
      currentPrice: 99,
      changePercent: 4.21,
      marketValueChange: 4000,
    });
  });

  it('keeps unavailable rows but excludes them from the period summary', () => {
    const priceCache: StockPriceCache = {
      version: 2,
      syncedAt: null,
      prices: {
        '2330': {
          '20260817': 96,
          '20260818': 97,
          '20260819': 98,
          '20260820': 99,
          '20260821': 100,
          '20260824': 100,
        },
      },
    };
    const result = buildInvestmentPerformanceViewModel({
      holdings: [
        makeHolding({ id: '2330', name: '台積電', symbol: '2330' }),
        makeHolding({ id: 'missing', name: '缺價股', symbol: '9999' }),
      ],
      priceCache,
      period: '5d',
      today: new Date(2026, 7, 25),
    });

    expect(result.summary.availableCount).toBe(1);
    expect(result.summary.unavailableCount).toBe(1);
    expect(result.summary.currentMarketValue).toBe(100000);
    expect(result.summary.baselineMarketValue).toBe(97000);
    expect(result.rows.map(row => row.id)).toEqual(['2330', 'missing']);
    expect(result.rows[1].changePercent).toBeUndefined();
  });

  it('ranks rows by absolute percentage change and limits visible rows', () => {
    const priceCache: StockPriceCache = {
      version: 2,
      syncedAt: null,
      prices: {
        A: { '20260824': 110 },
        B: { '20260824': 80 },
        C: { '20260824': 101 },
      },
    };
    const result = buildInvestmentPerformanceViewModel({
      holdings: [
        makeHolding({ id: 'A', name: '大漲', symbol: 'A' }),
        makeHolding({ id: 'B', name: '大跌', symbol: 'B' }),
        makeHolding({ id: 'C', name: '小漲', symbol: 'C' }),
      ],
      priceCache,
      period: '1d',
      today: new Date(2026, 7, 25),
    });

    expect(result.rows.map(row => row.id)).toEqual(['A', 'B', 'C']);
    expect(result.topRows.map(row => row.id)).toEqual(['A', 'B', 'C']);
  });
});

describe('investment holding sorting', () => {
  const movers = new Map<string, PositionMover>([
    ['2330', {
      id: '2330',
      name: '台積電',
      symbol: '2330',
      shares: 1000,
      previousClose: 100,
      currentClose: 110,
      change: 10000,
      changePercent: 10,
    }],
    ['2317', {
      id: '2317',
      name: '鴻海',
      symbol: '2317',
      shares: 1000,
      previousClose: 100,
      currentClose: 90,
      change: -10000,
      changePercent: -10,
    }],
  ]);
  const positions = [
    makePosition({ id: '2330', name: '台積電', symbol: '2330', unrealizedPnl: 1000, unrealizedPnlPercent: 1, marketValue: 101000 }),
    makePosition({ id: '2317', name: '鴻海', symbol: '2317', unrealizedPnl: -2000, unrealizedPnlPercent: -2, marketValue: 98000 }),
    makePosition({ id: 'missing', name: '缺價股' }),
  ];

  it('sorts by total P&L and places missing values last', () => {
    expect(sortInvestmentPositions(positions, movers, 'pnl', 'desc').map(item => item.id))
      .toEqual(['2330', '2317', 'missing']);
    expect(sortInvestmentPositions(positions, movers, 'pnl', 'asc').map(item => item.id))
      .toEqual(['2317', '2330', 'missing']);
  });

  it('sorts by absolute day impact regardless of direction', () => {
    expect(sortInvestmentPositions(positions, movers, 'day', 'desc').map(item => item.id))
      .toEqual(['2330', '2317', 'missing']);
    expect(sortInvestmentPositions(positions, movers, 'day', 'asc').map(item => item.id))
      .toEqual(['2317', '2330', 'missing']);
  });

  it('sorts by market value and return', () => {
    expect(sortInvestmentPositions(positions, movers, 'market', 'desc').map(item => item.id))
      .toEqual(['2330', '2317', 'missing']);
    expect(sortInvestmentPositions(positions, movers, 'return', 'asc').map(item => item.id))
      .toEqual(['2317', '2330', 'missing']);
  });
});
