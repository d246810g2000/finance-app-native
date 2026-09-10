import {
  filterAndSortRecords,
  processAndAggregateRecords,
} from '../services/aggregationService';
import type { RawRecord } from '../types';

const base = {
  '時間': '1200',
  '子分類': '',
  '幣別': 'TWD',
  '商家(公司)': '',
  '專案': '正常開銷',
  '備註': '',
};

function income(date: string, amount: string, account = '現金'): RawRecord {
  return {
    ...base,
    id: `in-${date}-${amount}`,
    '日期': date,
    '分類': '一般收入',
    '子分類': '公司薪資',
    '收款(轉入)': account,
    '付款(轉出)': '',
    '金額': amount,
  } as RawRecord;
}

function expense(date: string, amount: string, account = '現金'): RawRecord {
  return {
    ...base,
    id: `ex-${date}-${amount}`,
    '日期': date,
    '分類': '餐飲',
    '收款(轉入)': '',
    '付款(轉出)': account,
    '金額': amount,
  } as RawRecord;
}

describe('aggregationService', () => {
  it('filterAndSortRecords drops SYSTEM and short dates', () => {
    const rows = [
      income('20260701', '1000'),
      { ...income('20260702', '2000'), '分類': 'SYSTEM' } as RawRecord,
      { ...expense('2026', '500'), '日期': '2026' } as RawRecord,
    ];
    const filtered = filterAndSortRecords(rows, new Date(2026, 6, 1), new Date(2026, 6, 31));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]['金額']).toBe('1000');
  });

  it('processAndAggregateRecords sums income and expense for the period', () => {
    const records = [
      income('20260701', '10000'),
      expense('20260705', '3000'),
      expense('20260620', '999'), // outside period
    ];
    const start = new Date(2026, 6, 1);
    const end = new Date(2026, 6, 31);
    const result = processAndAggregateRecords(records, start, end, ['現金'], [], false);

    expect(result.periodSummary.totalIncome).toBe(10000);
    expect(result.periodSummary.totalExpense).toBe(3000);
    // 帳戶餘額會累計到 endDate 為止（含區間外更早交易）
    expect(result.aggregatedSummary['現金']?.balance).toBe(6001);
    expect(result.dailyTrend.length).toBeGreaterThan(0);
  });

  it('processAndAggregateRecords applies 50% split on shared accounts', () => {
    const shared = '共享樂天帳戶';
    const records = [
      income('20260701', '80000', shared),
      expense('20260705', '20000', shared),
    ];
    const start = new Date(2026, 6, 1);
    const end = new Date(2026, 6, 31);
    const result = processAndAggregateRecords(records, start, end, [shared], [], true);

    expect(result.periodSummary.totalIncome).toBe(40000);
    expect(result.periodSummary.totalExpense).toBe(10000);
    expect(result.aggregatedSummary[shared]?.balance).toBe(30000);
  });

  it('processAndAggregateRecords returns empty when dates missing', () => {
    const result = processAndAggregateRecords([income('20260701', '1')], null, null);
    expect(result.periodSummary).toEqual({ totalBalance: 0, totalIncome: 0, totalExpense: 0 });
    expect(result.dailyTrend).toEqual([]);
  });
});
