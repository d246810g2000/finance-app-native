import {
  computeInvestmentAssetTimeline,
  computeInvestmentTimelines,
  PORTFOLIO_TIMELINE_ID,
  tradeNetFlow,
  tradesInTimelineMonth,
} from '../services/investmentTimelineService';
import { StockTrade } from '../services/stockTradeService';

function makeTrade(partial: Partial<StockTrade> & Pick<StockTrade, 'id' | 'date' | 'side' | 'name'>): StockTrade {
  return {
    sourceId: partial.id,
    shares: 100,
    amount: 10000,
    sourceAmount: 10000,
    account: '股票',
    ownership: 'personal',
    lineNumber: 1,
    note: '',
    ...partial,
  };
}

describe('investmentTimelineService', () => {
  it('builds a non-negative asset timeline from share balances and current prices', () => {
    const trades = [
      makeTrade({
        id: 'buy',
        date: '20260115',
        side: 'buy',
        name: '鴻海',
        symbol: '2317',
        purchasePrice: 100,
        shares: 10,
      }),
      makeTrade({
        id: 'sell',
        date: '20260210',
        side: 'sell',
        name: '鴻海',
        symbol: '2317',
        costPrice: 100,
        salePrice: 110,
        shares: 10,
      }),
    ];

    expect(computeInvestmentAssetTimeline(trades, {
      '2317': { symbol: '2317', date: '20260220', close: 120 },
    })).toEqual([
      { month: '2026-01', value: 1200 },
      { month: '2026-02', value: 0 },
    ]);
  });

  it('clamps missing opening inventory to zero instead of producing negative assets', () => {
    const trades = [
      makeTrade({
        id: 'sell-without-lot',
        date: '20260110',
        side: 'sell',
        name: '鴻海',
        symbol: '2317',
        costPrice: 100,
        salePrice: 110,
        shares: 5,
      }),
      makeTrade({
        id: 'buy',
        date: '20260210',
        side: 'buy',
        name: '鴻海',
        symbol: '2317',
        purchasePrice: 100,
        shares: 5,
      }),
    ];

    expect(computeInvestmentAssetTimeline(trades, {
      '2317': { symbol: '2317', date: '20260220', close: 120 },
    })).toEqual([
      { month: '2026-01', value: 0 },
      { month: '2026-02', value: 600 },
    ]);
  });

  it('extends the timeline through the requested current month when there are no new trades', () => {
    const trades = [makeTrade({
      id: 'buy',
      date: '20260515',
      side: 'buy',
      name: '鴻海',
      symbol: '2317',
      purchasePrice: 100,
      shares: 10,
    })];

    const timeline = computeInvestmentAssetTimeline(
      trades,
      { '2317': { symbol: '2317', date: '20260825', close: 120 } },
      new Date(2026, 7, 26),
    );

    expect(timeline).toEqual([
      { month: '2026-05', value: 1200 },
      { month: '2026-06', value: 1200 },
      { month: '2026-07', value: 1200 },
      { month: '2026-08', value: 1200 },
    ]);
  });

  it('computes net flow for buys and sells', () => {
    expect(tradeNetFlow(makeTrade({
      id: '1',
      date: '20260101',
      side: 'buy',
      name: '鴻海',
      purchasePrice: 100,
      shares: 10,
    }))).toBe(1000);

    expect(tradeNetFlow(makeTrade({
      id: '2',
      date: '20260201',
      side: 'sell',
      name: '鴻海',
      costPrice: 100,
      salePrice: 110,
      shares: 10,
    }))).toBe(-1000);
  });

  it('builds cumulative portfolio timeline', () => {
    const trades = [
      makeTrade({
        id: '1',
        date: '20260115',
        side: 'buy',
        name: '鴻海',
        purchasePrice: 100,
        shares: 10,
      }),
      makeTrade({
        id: '2',
        date: '20260210',
        side: 'buy',
        name: '台積電',
        purchasePrice: 900,
        shares: 5,
      }),
      makeTrade({
        id: '3',
        date: '20260305',
        side: 'sell',
        name: '鴻海',
        costPrice: 100,
        salePrice: 110,
        shares: 5,
      }),
    ];

    const timelines = computeInvestmentTimelines(trades);
    const portfolio = timelines.find(t => t.id === PORTFOLIO_TIMELINE_ID);

    expect(portfolio).toBeDefined();
    expect(portfolio?.monthlyAccumulation).toEqual([
      { month: '2026-01', netFlow: 1000, cumulative: 1000 },
      { month: '2026-02', netFlow: 4500, cumulative: 5500 },
      { month: '2026-03', netFlow: -500, cumulative: 5000 },
    ]);
    expect(portfolio?.totalNetInvested).toBe(5000);
  });

  it('filters trades by timeline and month', () => {
    const trades = [
      makeTrade({
        id: '1',
        date: '20260115',
        side: 'buy',
        name: '鴻海',
        symbol: '2317',
        purchasePrice: 100,
        shares: 10,
      }),
      makeTrade({
        id: '2',
        date: '20260120',
        side: 'buy',
        name: '鴻海',
        symbol: '2317',
        purchasePrice: 105,
        shares: 5,
      }),
      makeTrade({
        id: '3',
        date: '20260120',
        side: 'buy',
        name: '台積電',
        symbol: '2330',
        purchasePrice: 900,
        shares: 5,
      }),
    ];

    const timelines = computeInvestmentTimelines(trades);
    const stockTimeline = timelines.find(t => t.name.startsWith('鴻海'));
    expect(stockTimeline).toBeDefined();
    expect(stockTimeline?.id).toBe('2317');

    const monthTrades = tradesInTimelineMonth(trades, stockTimeline!.id, '2026-01');
    expect(monthTrades).toHaveLength(2);
    expect(monthTrades.every(trade => trade.name === '鴻海')).toBe(true);
  });

  it('merges the same symbol across personal and shared accounts', () => {
    const trades = [
      makeTrade({
        id: '1',
        date: '20260115',
        side: 'buy',
        name: '台積電',
        symbol: '2330',
        ownership: 'personal',
        account: '股票',
        purchasePrice: 900,
        shares: 10,
      }),
      makeTrade({
        id: '2',
        date: '20260210',
        side: 'buy',
        name: '台積電',
        symbol: '2330',
        ownership: 'shared',
        account: '共享股票帳戶',
        purchasePrice: 950,
        shares: 5,
      }),
    ];

    const timelines = computeInvestmentTimelines(trades);
    const tsmcCards = timelines.filter(t => t.id === '2330');
    expect(tsmcCards).toHaveLength(1);
    expect(tsmcCards[0].tradeCount).toBe(2);
    expect(tsmcCards[0].totalNetInvested).toBe(900 * 10 + 950 * 5);
    expect(tsmcCards[0].monthlyAccumulation).toEqual([
      { month: '2026-01', netFlow: 9000, cumulative: 9000 },
      { month: '2026-02', netFlow: 4750, cumulative: 13750 },
    ]);
  });
});
