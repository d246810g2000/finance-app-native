import { buildWidgetPayload } from '../services/WidgetService';
import { calculateBudgetStatus, calculateBudgetStatusForMonths } from '../services/budgetService';
import type { BudgetGlobalConfig, BudgetRule, RawRecord } from '../types';

const config: BudgetGlobalConfig = {
  includedProjects: ['日常'],
  splitProjects: [],
  projectGroups: {},
};

const budgets: BudgetRule[] = [
  { id: 'food', category: '餐飲', monthlyLimit: 9000 },
];

const records: RawRecord[] = [
  {
    id: '1',
    日期: '2026/08/10',
    金額: '-120',
    幣別: 'TWD',
    類別: '餐飲',
    '付款(轉出)': '現金',
    專案: '日常',
  },
];

describe('WidgetService payload', () => {
  it('builds one payload for the whole month window', () => {
    const now = new Date(2026, 7, 15);
    const payload = buildWidgetPayload(records, budgets, config, now, 1);

    expect(payload.minMonthOffset).toBe(-1);
    expect(payload.maxMonthOffset).toBe(1);
    expect(Object.keys(payload.months)).toEqual(['m-1_', 'm0_', 'm1_']);
    expect(payload.months.m0_.monthLabel).toBe('2026/08');
    expect(payload.months.m0_.dailySpent).toBe(120);
  });

  it('keeps the batch calculation equivalent to the existing single-month calculation', () => {
    const targetMonths = [new Date(2026, 7, 1), new Date(2026, 8, 1)];
    const batch = calculateBudgetStatusForMonths(records, budgets, targetMonths, config);

    targetMonths.forEach((month, index) => {
      expect(batch[index]).toEqual(calculateBudgetStatus(records, budgets, month, config));
    });
  });
});
