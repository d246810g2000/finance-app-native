import {
  buildRecordIndex,
  normalizeRecord,
  selectMonthRecords,
  selectRecordsByPeriod,
} from '../services/core/recordIndex';

const expense = (id: string, date: string, amount: string, project = '') => ({
  id,
  日期: date,
  金額: amount,
  幣別: 'USD',
  分類: '餐飲食品',
  '付款(轉出)': '現金',
  專案: project,
  '商家(公司)': '測試商家',
});

describe('record index seam', () => {
  it('normalizes date, month, amount, merchant, and transaction kind once', () => {
    const row = normalizeRecord(expense('a', '20260105', '10', '共同開銷'));

    expect(row.dateKey).toBe('2026-01-05');
    expect(row.monthKey).toBe('2026-01');
    expect(row.amountTwd).toBeCloseTo(322.755);
    expect(row.merchant).toBe('測試商家');
    expect(row.transactionKind).toBe('expense');
  });

  it('selects sorted records by period and month without reparsing raw dates', () => {
    const index = buildRecordIndex([
      expense('b', '20260201', '2'),
      expense('a', '20260105', '1'),
      expense('c', '20260120', '3'),
      expense('invalid', 'bad', '4'),
    ]);

    expect(selectRecordsByPeriod(index, new Date(2026, 0, 1), new Date(2026, 0, 31))
      .map(row => row.id)).toEqual(['a', 'c']);
    expect(selectMonthRecords(index, new Date(2026, 0, 10)).map(row => row.id))
      .toEqual(['a', 'c']);
  });
});
