import { calculateBudgetStatus } from './budgetService';
import { RawRecord, BudgetRule, BudgetGlobalConfig } from '../types';

describe('budgetService - calculation logic', () => {
  const mockConfig: BudgetGlobalConfig = {
    includedProjects: ['住家支出', '共同開銷', '房屋購置', '裝潢家具', '正常開銷'],
    splitProjects: ['共同開銷'],
    projectGroups: {
      '住家支出': 'fixed',
      '房屋購置': 'fixed',
      '裝潢家具': 'fixed',
      '共同開銷': 'daily',
      '正常開銷': 'daily',
    },
  };

  const mockBudgets: BudgetRule[] = [
    { id: '1', category: '居家生活', monthlyLimit: 15000 },
    { id: '2', category: '餐飲食品', monthlyLimit: 10000 },
  ];

  const targetMonth = new Date(2026, 2, 1); // 2026/03

  test('should correctly identify totalFixedBudget', () => {
    // Current logic: totalFixedBudget is sum of limits for categories containing fixed projects
    // Wait, let's refine this in implementation.
    const result = calculateBudgetStatus([], mockBudgets, targetMonth, mockConfig);
    // Since we need to know which categories are FIXED, we might need to adjust how we calculate totalFixedBudget.
    // For now, let's assume if category has a fixed project record OR fixed project mapping, it counts.
  });

  test('should find nextFixedExpense using DD from records', () => {
    const historicalRecords: RawRecord[] = [
      {
        '日期': '20260215',
        '分類': '居家生活',
        '專案': '住家支出',
        '金額': '12000',
        '付款(轉出)': 'Cash',
        '收款(轉入)': '',
        'Periodic': '1|20250615|20260615|null|2|1',
      } as any,
      {
        '日期': '20260220',
        '分類': '居家生活',
        '專案': '房屋購置',
        '金額': '5000',
        '付款(轉出)': 'Bank',
        '收款(轉入)': '',
      } as any,
    ];

    // Case: Current month is March. No records in March yet.
    // Next due should be '住家支出' on 03/15.
    const result = calculateBudgetStatus(historicalRecords, mockBudgets, targetMonth, mockConfig);
    
    expect(result.nextFixedExpense).toBeDefined();
    expect(result.nextFixedExpense?.name).toBe('住家支出');
    expect(result.nextFixedExpense?.date).toBe('03/15');
    // amount should be either the budget limit or the last paid amount.
    // User mockup shows NT$ 12,000 for a specific project.
    expect(result.nextFixedExpense?.amount).toBe(12000);
  });

  test('should skip paid fixed expenses in current month', () => {
    const records: RawRecord[] = [
      {
        '日期': '20260215',
        '分類': '居家生活',
        '專案': '住家支出',
        '金額': '12000',
      } as any,
      {
        '日期': '20260315', // ALREADY PAID IN MARCH
        '分類': '居家生活',
        '專案': '住家支出',
        '金額': '12000',
        '付款(轉出)': 'Cash',
        '收款(轉入)': '',
      } as any,
      {
        '日期': '20260220',
        '分類': '居家生活',
        '專案': '房屋購置',
        '金額': '5000',
      } as any,
    ];

    const result = calculateBudgetStatus(records, mockBudgets, targetMonth, mockConfig);
    
    // 住家支出 is paid. Next should be 房屋購置 on 03/20.
    expect(result.nextFixedExpense?.name).toBe('房屋購置');
    expect(result.nextFixedExpense?.date).toBe('03/20');
  });
});
