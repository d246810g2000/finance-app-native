import { detectExpenseSpikes } from '../services/financeService';
import { RawRecord } from '../types';

describe('detectExpenseSpikes', () => {
  const baseRecord = {
    '時間': '12:00',
    '子分類': '測試',
    '收款(轉入)': '',
    '付款(轉出)': '現金',
    '金額': '100',
    '幣別': 'TWD',
    '商家(公司)': 'Test',
    '專案': '日常',
    '備註': '',
  };

  const createRecord = (date: string, category: string, amount: string, custom = {}): RawRecord => {
    return {
      ...baseRecord,
      '日期': date,
      '分類': category,
      '金額': amount,
      ...custom,
    } as RawRecord;
  };

  it('should not detect spikes for normal spending', () => {
    const records: RawRecord[] = [
      createRecord('20260410', '餐飲', '1000'),
      createRecord('20260510', '餐飲', '1000'),
      createRecord('20260610', '餐飲', '1000'),
      createRecord('20260710', '餐飲', '1000'),
    ];

    const startDate = new Date('2026-07-01');
    const endDate = new Date('2026-07-31');

    const spikes = detectExpenseSpikes(records, startDate, endDate);
    expect(spikes).toHaveLength(0);
  });

  it('should detect yellow warning for spending between 130% and 150%', () => {
    const records: RawRecord[] = [
      createRecord('20260410', '餐飲', '1000'),
      createRecord('20260510', '餐飲', '1000'),
      createRecord('20260610', '餐飲', '1000'),
      createRecord('20260710', '餐飲', '1400'),
    ];

    const startDate = new Date('2026-07-01');
    const endDate = new Date('2026-07-31');

    const spikes = detectExpenseSpikes(records, startDate, endDate);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].category).toBe('餐飲');
    expect(spikes[0].status).toBe('yellow');
    expect(spikes[0].ratio).toBe(1.4);
    expect(spikes[0].difference).toBe(400);
    expect(spikes[0].topTransactions).toHaveLength(1);
  });

  it('should detect red danger for spending >= 150%', () => {
    const records: RawRecord[] = [
      createRecord('20260410', '餐飲', '1000'),
      createRecord('20260510', '餐飲', '1000'),
      createRecord('20260610', '餐飲', '1000'),
      createRecord('20260710', '餐飲', '1600'),
    ];

    const startDate = new Date('2026-07-01');
    const endDate = new Date('2026-07-31');

    const spikes = detectExpenseSpikes(records, startDate, endDate);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].category).toBe('餐飲');
    expect(spikes[0].status).toBe('red');
    expect(spikes[0].ratio).toBe(1.6);
    expect(spikes[0].difference).toBe(600);
  });

  it('should detect new category warnings for new categories with spending >= 1000', () => {
    const records: RawRecord[] = [
      createRecord('20260410', '餐飲', '1000'),
      createRecord('20260510', '餐飲', '1000'),
      createRecord('20260610', '餐飲', '1000'),
      createRecord('20260710', '餐飲', '1000'),
      createRecord('20260715', '娛樂', '1200'),
    ];

    const startDate = new Date('2026-07-01');
    const endDate = new Date('2026-07-31');

    const spikes = detectExpenseSpikes(records, startDate, endDate);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].category).toBe('娛樂');
    expect(spikes[0].status).toBe('new');
    expect(spikes[0].ratio).toBe(Infinity);
  });

  it('should only detect spikes for projects matching projectFilter', () => {
    const records: RawRecord[] = [
      createRecord('20260410', '餐飲', '1000', { '專案': '日常' }),
      createRecord('20260510', '餐飲', '1000', { '專案': '日常' }),
      createRecord('20260610', '餐飲', '1000', { '專案': '日常' }),
      // This spike is in '固定' project, which we will filter out
      createRecord('20260710', '餐飲', '2000', { '專案': '固定' }),
      // This spike is in '日常' project, which we will keep
      createRecord('20260715', '娛樂', '1500', { '專案': '日常' }),
    ];

    const startDate = new Date('2026-07-01');
    const endDate = new Date('2026-07-31');

    // Filter only for '日常' project:
    // 1. 餐飲 has history of 1000/month in '日常', and current '日常' has 0. (Spike of 2000 in '固定' is ignored) -> No spike for '餐飲'.
    // 2. 娛樂 is new category with 1500 in '日常' -> detected as 'new' spike.
    const spikes = detectExpenseSpikes(records, startDate, endDate, null, false, {}, ['日常']);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].category).toBe('娛樂');
    expect(spikes[0].status).toBe('new');
  });

  it('should split record amounts by 50% for projects in splitProjects list', () => {
    const records: RawRecord[] = [
      createRecord('20260410', '餐飲', '1000', { '專案': '共同' }),
      createRecord('20260510', '餐飲', '1000', { '專案': '共同' }),
      createRecord('20260610', '餐飲', '1000', { '專案': '共同' }),
      createRecord('20260710', '餐飲', '3000', { '專案': '共同' }),
    ];

    const startDate = new Date('2026-07-01');
    const endDate = new Date('2026-07-31');

    const spikes = detectExpenseSpikes(records, startDate, endDate, null, false, {}, null, ['共同']);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].category).toBe('餐飲');
    expect(spikes[0].currentSpent).toBe(1500);
    expect(spikes[0].avgSpent).toBe(500);
    expect(spikes[0].topTransactions[0]['金額']).toBe(-1500);
  });
});
