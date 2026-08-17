import {
  getStatementPeriod,
  getLatestClosedPeriod,
  shiftStatementPeriod,
  filterStatementRecords,
  computeReconMetrics,
  sortStatementRecords,
  isInStatementPeriod,
  filterStatementGroupRecords,
  computeGroupReconMetrics,
} from '../services/reconciliationService';
import { RawRecord } from '../types';

describe('reconciliationService periods', () => {
  it('computes statement period for statementDay=15 ending July 2025', () => {
    const period = getStatementPeriod(2025, 6, 15);
    expect(period.periodKey).toBe('2025-07');
    expect(period.start.getFullYear()).toBe(2025);
    expect(period.start.getMonth()).toBe(5);
    expect(period.start.getDate()).toBe(16);
    expect(period.end.getMonth()).toBe(6);
    expect(period.end.getDate()).toBe(15);
  });

  it('getLatestClosedPeriod on July 10 uses June closing', () => {
    const today = new Date(2025, 6, 10);
    const period = getLatestClosedPeriod(today, 15);
    expect(period.periodKey).toBe('2025-06');
    expect(period.end.getDate()).toBe(15);
    expect(period.end.getMonth()).toBe(5);
  });

  it('getLatestClosedPeriod on July 15 uses July closing', () => {
    const today = new Date(2025, 6, 15);
    const period = getLatestClosedPeriod(today, 15);
    expect(period.periodKey).toBe('2025-07');
  });

  it('shifts periods', () => {
    const p = getStatementPeriod(2025, 6, 15);
    const next = shiftStatementPeriod(p, 1);
    expect(next.periodKey).toBe('2025-08');
  });
});

describe('reconciliationService filter + metrics', () => {
  const card = '台新 GoGo 卡';
  const period = getStatementPeriod(2025, 6, 15);

  const mk = (partial: Partial<RawRecord> & { '日期': string; id: string }): RawRecord => ({
    '時間': '12:00',
    '分類': '餐飲',
    '子分類': '測試',
    '收款(轉入)': '',
    '付款(轉出)': card,
    '金額': '100',
    '幣別': 'TWD',
    '商家(公司)': 'Shop',
    '專案': '日常',
    '備註': '',
    ...partial,
  } as RawRecord);

  it('includes in-range; excludes out-of-range and all transfers', () => {
    const records: RawRecord[] = [
      mk({ id: 'in', '日期': '20250710', '金額': '300' }),
      mk({ id: 'out-of-range', '日期': '20250801', '金額': '50' }),
      mk({
        id: 'transfer',
        '日期': '20250710',
        '分類': '轉帳',
        '子分類': '一般轉帳',
        '收款(轉入)': '銀行',
        '付款(轉出)': card,
      }),
      mk({
        id: 'pay',
        '日期': '20250710',
        '分類': '轉帳',
        '子分類': '信用卡繳款',
        '收款(轉入)': card,
        '付款(轉出)': '銀行',
        '金額': '500',
      }),
    ];

    const filtered = filterStatementRecords(records, card, period);
    expect(filtered.map(r => r.id)).toEqual(['in']);
  });

  it('isInStatementPeriod uses date only', () => {
    expect(isInStatementPeriod(mk({ id: 'x', '日期': '20250710' }), period)).toBe(true);
    expect(isInStatementPeriod(mk({ id: 'y', '日期': '20250801' }), period)).toBe(false);
  });

  it('computes metrics and completion', () => {
    const partial = [
      mk({ id: 'a', '日期': '20250701', '金額': '100', isReconciled: true }),
      mk({ id: 'b', '日期': '20250702', '金額': '50', isReconciled: false }),
    ];
    const metrics = computeReconMetrics(partial, card);
    expect(metrics.totalCount).toBe(2);
    expect(metrics.totalAmount).toBe(150);
    expect(metrics.reconciledCount).toBe(1);
    expect(metrics.reconciledAmount).toBe(100);
    expect(metrics.unreconciledCount).toBe(1);
    expect(metrics.isComplete).toBe(false);
    expect(metrics.hasMismatch).toBe(true);

    const done = computeReconMetrics([
      mk({ id: 'a', '日期': '20250701', '金額': '100', isReconciled: true }),
      mk({ id: 'b', '日期': '20250702', '金額': '50', isReconciled: true }),
    ], card);
    expect(done.isComplete).toBe(true);
    expect(done.hasMismatch).toBe(false);
  });

  it('sorts ascending by default (遠→近)', () => {
    const records = [
      mk({ id: 'b', '日期': '20250710' }),
      mk({ id: 'a', '日期': '20250620' }),
    ];
    const sorted = sortStatementRecords(records, 'asc');
    expect(sorted.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('groups cards with a shared statement period', () => {
    const secondCard = '共享台新卡';
    const records = [
      mk({ id: 'card-a', '日期': '20250618', '金額': '100' }),
      mk({
        id: 'card-b',
        '日期': '20250710',
        '付款(轉出)': secondCard,
        '金額': '300',
        isReconciled: true,
      }),
      mk({
        id: 'card-b-late',
        '日期': '20250718',
        '付款(轉出)': secondCard,
        '金額': '200',
      }),
      mk({
        id: 'group-transfer',
        '日期': '20250710',
        '分類': '轉帳',
        '子分類': '一般轉帳',
        '付款(轉出)': secondCard,
        '收款(轉入)': '銀行',
      }),
    ];
    const sharedPeriod = getStatementPeriod(2025, 6, 15);
    const filtered = filterStatementGroupRecords(
      records,
      [card, secondCard],
      sharedPeriod
    );
    expect(filtered.map(record => record.id)).toEqual(['card-a', 'card-b']);

    const metrics = computeGroupReconMetrics(filtered, [card, secondCard]);
    expect(metrics.totalAmount).toBe(400);
    expect(metrics.reconciledAmount).toBe(300);
    expect(metrics.unreconciledCount).toBe(1);
  });
});
