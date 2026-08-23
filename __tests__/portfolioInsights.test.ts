import { buildPortfolioInsights, StockPosition } from '../services/portfolioService';

function makePosition(partial: Partial<StockPosition> & Pick<StockPosition, 'id' | 'name'>): StockPosition {
  return {
    account: '股票',
    ownership: 'personal',
    shares: 100,
    averageCost: 100,
    totalCost: 10000,
    ...partial,
  };
}

describe('buildPortfolioInsights allocation merge', () => {
  it('merges the same symbol across accounts for allocation and movers', () => {
    const positions: StockPosition[] = [
      makePosition({
        id: 'personal¦股票¦台積電',
        name: '台積電',
        symbol: '2330',
        ownership: 'personal',
        account: '股票',
        shares: 50,
        marketValue: 100000,
        totalCost: 80000,
        averageCost: 1600,
        latestPrice: 2000,
        latestPriceDate: '20260822',
        unrealizedPnl: 20000,
      }),
      makePosition({
        id: 'shared¦共享股票帳戶¦台積電',
        name: '台積電',
        symbol: '2330',
        ownership: 'shared',
        account: '共享股票帳戶',
        shares: 30,
        marketValue: 60000,
        totalCost: 45000,
        averageCost: 1500,
        latestPrice: 2000,
        latestPriceDate: '20260822',
        unrealizedPnl: 15000,
      }),
      makePosition({
        id: 'personal¦股票¦鴻海',
        name: '鴻海',
        symbol: '2317',
        shares: 100,
        marketValue: 40000,
        totalCost: 35000,
        averageCost: 350,
        latestPrice: 400,
        latestPriceDate: '20260822',
        unrealizedPnl: 5000,
      }),
    ];

    const insights = buildPortfolioInsights(positions, [], {
      '2330': { symbol: '2330', date: '20260821', close: 1900 },
      '2317': { symbol: '2317', date: '20260821', close: 390 },
    });

    const tsmc = insights.allocation.find(item => item.id === '2330');
    expect(tsmc).toBeDefined();
    expect(tsmc?.value).toBe(160000);
    expect(insights.allocation.filter(item => item.name.includes('台積電'))).toHaveLength(1);

    const tsmcMover = insights.movers.find(item => item.symbol === '2330');
    expect(tsmcMover?.shares).toBe(80);
    expect(tsmcMover?.change).toBe((2000 - 1900) * 80);
    expect(insights.movers.filter(item => item.symbol === '2330')).toHaveLength(1);
  });
});
