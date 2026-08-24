import { buildHistoricalPeriods } from '../viewModels/assetViewModel';
import { RawRecord } from '../types';

const record = (overrides: Partial<RawRecord>): RawRecord => ({
  id: 'tx',
  '日期': '20260701',
  '分類': '餐飲',
  '金額': '1000',
  '幣別': 'TWD',
  '付款(轉出)': '現金',
  ...overrides,
});

describe('asset historical periods view model', () => {
  it('returns an empty list when the sheet is closed', () => {
    expect(buildHistoricalPeriods({
      records: [record({})],
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 31),
      durationInDays: 31,
      enabled: false,
    })).toEqual([]);
  });

  it('summarizes one expense period and carries the running balance backwards', () => {
    const periods = buildHistoricalPeriods({
      records: [record({})],
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 31),
      durationInDays: 31,
      enabled: true,
      endBalance: 900,
    });

    expect(periods).toHaveLength(12);
    expect(periods[0]).toMatchObject({
      monthLabel: '本期',
      shortLabel: '7/1',
      income: 0,
      expense: 1000,
      net: -1000,
      endBalance: 900,
      index: 0,
    });
  });

  it('excludes special records and splits shared expenses once', () => {
    const periods = buildHistoricalPeriods({
      records: [
        record({ id: 'special', '分類': '代付', '金額': '500' }),
        record({ id: 'shared', '付款(轉出)': '共享樂天帳戶' }),
      ],
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 31),
      durationInDays: 31,
      enabled: true,
      isSplitShared: true,
    });

    expect(periods[0].expense).toBe(500);
  });
});
