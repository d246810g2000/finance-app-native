import {
  createDefaultInvestmentDateRange,
  filterByDateRange,
  inDateRange,
  sumRealizedPnl,
  toYmd,
} from '../services/investmentFilters';
import { StockRealizedTrade } from '../services/portfolioService';

describe('investmentFilters', () => {
  it('formats local dates as YYYYMMDD', () => {
    expect(toYmd(new Date(2026, 7, 24))).toBe('20260824');
  });

  it('checks inclusive date range boundaries', () => {
    const start = new Date(2026, 0, 10);
    start.setHours(0, 0, 0, 0);
    const end = new Date(2026, 0, 12);
    end.setHours(23, 59, 59, 999);

    expect(inDateRange('20260109', start, end)).toBe(false);
    expect(inDateRange('20260110', start, end)).toBe(true);
    expect(inDateRange('20260112', start, end)).toBe(true);
    expect(inDateRange('20260113', start, end)).toBe(false);
  });

  it('filters trades and sums realized pnl', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 31);
    end.setHours(23, 59, 59, 999);

    const realized: StockRealizedTrade[] = [
      {
        id: '1',
        kind: 'sell',
        name: '鴻海',
        date: '20260105',
        shares: 100,
        costPrice: 100,
        salePrice: 110,
        pnl: 1000,
        account: '股票',
        ownership: 'personal',
      },
      {
        id: '2',
        kind: 'sell',
        name: '台積電',
        date: '20260201',
        shares: 10,
        costPrice: 900,
        salePrice: 950,
        pnl: 500,
        account: '股票',
        ownership: 'personal',
      },
    ];

    const filtered = filterByDateRange(realized, start, end);
    expect(filtered).toHaveLength(1);
    expect(sumRealizedPnl(filtered)).toBe(1000);
  });

  it('creates a default 365-day range ending today', () => {
    const today = new Date(2026, 7, 24, 15, 0, 0);
    const { startDate, endDate } = createDefaultInvestmentDateRange(today);
    expect(toYmd(endDate)).toBe('20260824');
    expect(toYmd(startDate)).toBe('20250825');
  });
});
