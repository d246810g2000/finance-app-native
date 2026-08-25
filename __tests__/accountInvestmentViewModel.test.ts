import { buildAccountInvestmentSummary } from '../viewModels/accountInvestmentViewModel';
import type { RawRecord } from '../types';
import { createEmptyStockPriceCache, mergeStockPriceCache } from '../services/stockPriceService';

const record = (overrides: Partial<RawRecord>): RawRecord => ({
  id: 'record',
  '日期': '20260801',
  '分類': '轉帳',
  '金額': '100000',
  '幣別': 'TWD',
  ...overrides,
});

describe('account investment view model', () => {
  it('does not create an investment summary for non-securities accounts', () => {
    expect(buildAccountInvestmentSummary({
      records: [],
      account: '將來銀行',
    })).toBeNull();
  });

  it('separates ledger principal from current holding cost and market value', () => {
    const records = [
      record({ id: 'fund', '收款(轉入)': '股票', '付款(轉出)': '將來銀行', '金額': '100000' }),
      record({
        id: 'buy',
        '收款(轉入)': '股票',
        '付款(轉出)': '將來銀行',
        '金額': '100000',
        '備註': '台積電 100 1000股',
      }),
    ];
    const cache = mergeStockPriceCache(createEmptyStockPriceCache(), [
      { symbol: '2330', date: '20260825', close: 120 },
    ]);

    const result = buildAccountInvestmentSummary({ records, account: '股票', priceCache: cache });

    expect(result).toMatchObject({
      principal: 200000,
      holdingCost: 100000,
      marketValue: 120000,
      unrealizedPnl: 20000,
      unrealizedPnlPercent: 20,
      pricedPositionCount: 1,
      positionCount: 1,
      status: 'mismatch',
    });
    expect(result?.discrepancy).toBe(100000);
  });

  it('reports partially priced positions without inventing market value', () => {
    const records = [
      record({ id: 'buy', '收款(轉入)': '股票', '付款(轉出)': '將來銀行', '備註': '台積電 100 1000股' }),
    ];
    const result = buildAccountInvestmentSummary({
      records,
      account: '股票',
      priceCache: createEmptyStockPriceCache(),
    });

    expect(result).toMatchObject({
      principal: 100000,
      holdingCost: 100000,
      marketValue: undefined,
      unrealizedPnl: undefined,
      pricedPositionCount: 0,
      positionCount: 1,
      status: 'partial_prices',
    });
  });
});
