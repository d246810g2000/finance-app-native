import {
  buildCurrentHoldings,
  StockPosition,
} from '../services/portfolioService';

function makePosition(partial: Partial<StockPosition> & Pick<StockPosition, 'id' | 'name' | 'symbol'>): StockPosition {
  return {
    account: '股票',
    ownership: 'personal',
    shares: 0,
    averageCost: 0,
    totalCost: 0,
    ...partial,
  };
}

describe('current investment holdings', () => {
  it('merges the same symbol across accounts and values shares at the latest close', () => {
    const holdings = buildCurrentHoldings([
      makePosition({
        id: 'personal¦股票¦鴻海',
        name: '鴻海',
        symbol: '2317',
        shares: 100,
        totalCost: 20000,
        latestPrice: 250,
        latestPriceDate: '20260822',
        marketValue: 25000,
      }),
      makePosition({
        id: 'shared¦共享股票帳戶¦鴻海',
        name: '鴻海',
        symbol: '2317',
        ownership: 'shared',
        account: '共享股票帳戶',
        shares: 50,
        totalCost: 10000,
        latestPrice: 250,
        latestPriceDate: '20260822',
        marketValue: 12500,
      }),
      makePosition({
        id: 'personal¦股票¦聯電',
        name: '聯電',
        symbol: '2303',
        shares: 0,
        totalCost: 0,
      }),
    ]);

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      id: '2317',
      name: '鴻海',
      symbol: '2317',
      shares: 150,
      totalCost: 30000,
      latestPrice: 250,
      marketValue: 37500,
      unrealizedPnl: 7500,
    });
  });

  it('falls back to cost only when a current holding has no price', () => {
    const holdings = buildCurrentHoldings([
      makePosition({
        id: 'personal¦股票¦鴻海',
        name: '鴻海',
        symbol: '2317',
        shares: 10,
        totalCost: 2200,
      }),
    ]);

    expect(holdings[0].marketValue).toBeUndefined();
    expect(holdings[0].displayValue).toBe(2200);
  });
});
