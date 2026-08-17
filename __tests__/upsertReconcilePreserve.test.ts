import { upsertRecordsById } from '../services/financeService';
import { RawRecord } from '../types';

describe('upsertRecordsById reconciliation fields', () => {
  const base = {
    '時間': '12:00',
    '分類': '餐飲',
    '子分類': '測試',
    '收款(轉入)': '',
    '付款(轉出)': '台新 GoGo 卡',
    '金額': '100',
    '幣別': 'TWD',
    '商家(公司)': 'Test',
    '專案': '日常',
    '備註': '',
    '日期': '20250710',
  };

  it('preserves local isReconciled when incoming omits it', () => {
    const existing: RawRecord[] = [
      {
        ...base,
        id: 'a1',
        isReconciled: true,
      } as RawRecord,
    ];
    const incoming: RawRecord[] = [
      { ...base, id: 'a1', '金額': '200' } as RawRecord,
    ];

    const result = upsertRecordsById(existing, incoming);
    const row = result.records.find(r => r.id === 'a1')!;
    expect(row['金額']).toBe('200');
    expect(row.isReconciled).toBe(true);
    expect(result.updated).toBe(1);
  });

  it('allows incoming to override isReconciled when explicitly set', () => {
    const existing: RawRecord[] = [
      { ...base, id: 'a1', isReconciled: true } as RawRecord,
    ];
    const incoming: RawRecord[] = [
      { ...base, id: 'a1', isReconciled: false } as RawRecord,
    ];

    const result = upsertRecordsById(existing, incoming);
    const row = result.records.find(r => r.id === 'a1')!;
    expect(row.isReconciled).toBe(false);
  });

  it('strips legacy postponedToPeriod on update', () => {
    const existing: RawRecord[] = [
      { ...base, id: 'a1', isReconciled: true, postponedToPeriod: '2025-08' } as any,
    ];
    const incoming: RawRecord[] = [
      { ...base, id: 'a1', '金額': '120' } as RawRecord,
    ];
    const result = upsertRecordsById(existing, incoming);
    const row = result.records.find(r => r.id === 'a1') as any;
    expect(row.isReconciled).toBe(true);
    expect(row.postponedToPeriod).toBeUndefined();
  });
});
