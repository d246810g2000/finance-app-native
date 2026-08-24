import { buildInvestmentScreenData } from '../viewModels/investmentViewModel';
import { RawRecord } from '../types';
import { StockPriceCache } from '../services/stockPriceService';

function buyRecord(id: string, date: string): RawRecord {
  return {
    id,
    '日期': date,
    '分類': '轉帳',
    '收款(轉入)': '股票',
    '付款(轉出)': '現金',
    '金額': '1000',
    '幣別': 'TWD',
    '備註': '台積電 1000 1股',
  };
}

describe('investment screen view model', () => {
  it('values current holdings from full history while listing only date-range trades', () => {
    const priceCache: StockPriceCache = {
      version: 1,
      syncedAt: null,
      prices: { '2330': { '20260824': 2000 } },
    };
    const result = buildInvestmentScreenData({
      records: [
        buyRecord('old', '20240102'),
        buyRecord('recent', '20260803'),
      ],
      ownership: 'all',
      infoCache: null,
      priceCache,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
    });

    expect(result.currentHoldings).toHaveLength(1);
    expect(result.currentHoldings[0]).toMatchObject({
      symbol: '2330',
      shares: 2,
      marketValue: 4000,
    });
    expect(result.rangeFilteredTrades).toHaveLength(1);
    expect(result.portfolio.positions[0].shares).toBe(2);
  });
});
