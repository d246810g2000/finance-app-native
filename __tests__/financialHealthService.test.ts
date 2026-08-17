import {
  computeHealthScore,
  computeCashflowMonth,
  computeExpenseStructure,
  computeSavingsAnalysis,
  evaluateHealthRules,
  detectRecurringCharges,
  getUpcomingPayments,
  computeBehaviorStats,
  buildMonthlyReport,
  evaluateAchievements,
  buildHealthDashboard,
  buildMonthlyAggregateCache,
  getIncomeExpenseRows,
  HEALTH_SCORE_WEIGHTS,
} from '../services/financialHealthService';
import { RawRecord, BudgetRule, BudgetGlobalConfig } from '../types';

const config: BudgetGlobalConfig = {
  includedProjects: ['正常開銷', '共同開銷', '住家支出'],
  splitProjects: [],
  projectGroups: {
    住家支出: 'fixed',
  },
};

const base = {
  '時間': '1400',
  '子分類': '測試',
  '幣別': 'TWD',
  '商家(公司)': '',
  '備註': '',
};

function expense(date: string, category: string, amount: string, extra: Partial<RawRecord> = {}): RawRecord {
  return {
    ...base,
    '日期': date,
    '分類': category,
    '付款(轉出)': '現金',
    '收款(轉入)': '',
    '金額': amount,
    '專案': '正常開銷',
    ...extra,
  } as RawRecord;
}

function income(date: string, amount: string): RawRecord {
  return {
    ...base,
    '日期': date,
    '分類': '薪資',
    '付款(轉出)': '',
    '收款(轉入)': '銀行',
    '金額': amount,
    '專案': '',
    '商家(公司)': '公司',
  } as RawRecord;
}

describe('financialHealthService', () => {
  const july = new Date(2026, 6, 15);

  it('HEALTH_SCORE_WEIGHTS sum to 100', () => {
    const sum = Object.values(HEALTH_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('computeHealthScore returns KPIs and score when data exists', () => {
    const records = [
      income('2026/07/01', '80000'),
      expense('2026/07/05', '餐飲', '10000'),
      expense('2026/07/10', '交通', '5000'),
      income('2026/06/01', '80000'),
      expense('2026/06/05', '餐飲', '20000'),
    ];
    const result = computeHealthScore(records, july, config, []);
    expect(result.insufficientData).toBe(false);
    expect(result.kpi.income).toBe(80000);
    expect(result.kpi.expense).toBe(15000);
    expect(result.kpi.net).toBe(65000);
    expect(result.kpi.savingsRate).toBeCloseTo(81.25, 1);
    expect(result.kpi.topExpenseCategory).toBe('餐飲');
    expect(result.score).toBeGreaterThan(50);
    expect(result.breakdown.savings).toBe(30);
    expect(result.breakdown.cashflow).toBe(20);
  });

  it('computeHealthScore handles empty month without NaN', () => {
    const result = computeHealthScore([], july, config, []);
    expect(result.insufficientData).toBe(true);
    expect(result.score).toBeNull();
    expect(result.kpi.savingsRate).toBeNull();
  });

  it('computeHealthScore overspend penalty when budget exceeded', () => {
    const budgets: BudgetRule[] = [{ id: '1', category: '餐飲', monthlyLimit: 5000 }];
    const records = [
      income('2026/07/01', '50000'),
      expense('2026/07/05', '餐飲', '8000'),
    ];
    const result = computeHealthScore(records, july, config, budgets);
    expect(result.breakdown.overspend).toBe(0);
  });

  it('computeCashflowMonth splits fixed vs variable', () => {
    const records = [
      income('2026/07/01', '100000'),
      expense('2026/07/05', '居家', '20000', { '專案': '住家支出' }),
      expense('2026/07/06', '餐飲', '10000', { '專案': '正常開銷' }),
    ];
    const cf = computeCashflowMonth(records, july, config);
    expect(cf.income).toBe(100000);
    expect(cf.fixedExpense).toBe(20000);
    expect(cf.variableExpense).toBe(10000);
    expect(cf.remainder).toBe(70000);
  });

  it('computeExpenseStructure includes vs previous month', () => {
    const records = [
      expense('2026/07/05', '餐飲', '30000'),
      expense('2026/07/06', '交通', '10000'),
      expense('2026/06/05', '餐飲', '20000'),
    ];
    const structure = computeExpenseStructure(records, july);
    expect(structure[0].name).toBe('餐飲');
    expect(structure[0].pct).toBeCloseTo(75, 0);
    expect(structure[0].deltaPct).toBeCloseTo(50, 0);
  });

  it('computeSavingsAnalysis finds best and worst months', () => {
    const records = [
      income('2026/05/01', '100000'),
      expense('2026/05/05', '餐飲', '10000'),
      income('2026/06/01', '100000'),
      expense('2026/06/05', '餐飲', '90000'),
      income('2026/07/01', '100000'),
      expense('2026/07/05', '餐飲', '40000'),
    ];
    const analysis = computeSavingsAnalysis(records, july, 3);
    expect(analysis.best?.monthKey).toBe('2026-05');
    expect(analysis.worst?.monthKey).toBe('2026-06');
    expect(analysis.averageRate).not.toBeNull();
  });

  it('evaluateHealthRules detects expense > income and low savings', () => {
    const records = [
      income('2026/07/01', '10000'),
      expense('2026/07/05', '餐飲', '15000'),
    ];
    const insights = evaluateHealthRules(records, july, config, []);
    expect(insights.some((i) => i.id === 'expense-gt-income')).toBe(true);
    expect(insights.some((i) => i.id === 'low-savings')).toBe(true);
  });

  it('evaluateHealthRules detects 3-month category rise', () => {
    const records = [
      expense('2026/05/05', '娛樂', '1000'),
      expense('2026/06/05', '娛樂', '2000'),
      expense('2026/07/05', '娛樂', '3000'),
      income('2026/07/01', '50000'),
    ];
    const insights = evaluateHealthRules(records, july, config, []);
    expect(insights.some((i) => i.id === 'cat-rise-娛樂')).toBe(true);
  });

  it('detectRecurringCharges finds monthly Netflix-like pattern', () => {
    const records = [
      expense('2026/04/10', '訂閱', '390', { '商家(公司)': 'Netflix' }),
      expense('2026/05/10', '訂閱', '390', { '商家(公司)': 'Netflix' }),
      expense('2026/06/10', '訂閱', '390', { '商家(公司)': 'Netflix' }),
      expense('2026/07/10', '訂閱', '390', { '商家(公司)': 'Netflix' }),
    ];
    const charges = detectRecurringCharges(records);
    expect(charges.some((c) => c.merchant.includes('Netflix'))).toBe(true);
    const netflix = charges.find((c) => c.merchant.includes('Netflix'))!;
    expect(netflix.intervalDays).toBeGreaterThanOrEqual(28);
    expect(netflix.intervalDays).toBeLessThanOrEqual(35);
    const upcoming = getUpcomingPayments(charges, new Date(2026, 6, 11));
    expect(upcoming.length).toBeGreaterThan(0);
  });

  it('computeBehaviorStats aggregates weekday and month thirds', () => {
    // 2026-07-06 is Monday
    const records = [
      expense('2026/07/06', '餐飲', '800', { '時間': '2000' }),
      expense('2026/07/07', '餐飲', '900', { '時間': '1300' }),
      expense('2026/07/25', '娛樂', '5000', { '時間': '2100', '商家(公司)': 'Apple' }),
      expense('2026/07/03', '交通', '200', { '時間': '0800' }),
      expense('2026/07/15', '餐飲', '300', { '時間': '1200' }),
    ];
    const stats = computeBehaviorStats(records, july);
    expect(stats.txnCount).toBe(5);
    expect(stats.largestTxn?.merchant).toContain('Apple');
    expect(stats.maxSpendDay?.date).toBe('2026/07/25');
    expect(stats.byMonthThird[2].amount).toBe(5000);
    expect(stats.byWeekday[1].amount).toBe(800); // Monday
  });

  it('buildMonthlyReport and achievements', () => {
    const records = [
      income('2026/05/01', '100000'),
      expense('2026/05/05', '餐飲', '20000'),
      income('2026/06/01', '100000'),
      expense('2026/06/05', '餐飲', '20000'),
      income('2026/07/01', '100000'),
      expense('2026/07/05', '餐飲', '20000'),
    ];
    const report = buildMonthlyReport(records, july);
    expect(report.income).toBe(100000);
    expect(report.topCategory).toBe('餐飲');
    expect(report.savingsRate).toBeCloseTo(80, 0);

    const achievements = evaluateAchievements(records, july, config, [
      { id: '1', category: '餐飲', monthlyLimit: 50000 },
    ]);
    expect(achievements.find((a) => a.id === 'pos-cashflow-3m')?.unlocked).toBe(true);
    expect(achievements.find((a) => a.id === 'savings-30')?.unlocked).toBe(true);
    expect(achievements.find((a) => a.id === 'no-overspend')?.unlocked).toBe(true);
  });

  it('accountFilter scopes income/expense to selected accounts', () => {
    const records = [
      income('2026/07/01', '80000'), // 銀行
      expense('2026/07/05', '餐飲', '10000'), // 現金
      {
        ...base,
        '日期': '2026/07/06',
        '分類': '餐飲',
        '付款(轉出)': '共享現金帳戶',
        '收款(轉入)': '',
        '金額': '20000',
        '專案': '共同開銷',
        '商家(公司)': '超市',
      } as RawRecord,
    ];
    const personal = computeHealthScore(records, july, config, [], {
      accountFilter: ['現金', '銀行'],
    });
    expect(personal.kpi.income).toBe(80000);
    expect(personal.kpi.expense).toBe(10000);

    const shared = computeHealthScore(records, july, config, [], {
      accountFilter: ['共享現金帳戶'],
    });
    expect(shared.kpi.income).toBe(0);
    expect(shared.kpi.expense).toBe(20000);

    const splitShared = computeHealthScore(records, july, config, [], {
      accountFilter: null,
      isSplitShared: true,
      sharedAccounts: ['共享現金帳戶'],
    });
    expect(splitShared.kpi.expense).toBe(20000); // 10000 personal + 10000 half of shared
  });

  it('daily mode excludes capital, event, and travel projects across dashboard', () => {
    const records = [
      income('2026/07/01', '100000'),
      expense('2026/07/05', '餐飲', '10000', { '專案': '正常開銷' }),
      expense('2026/07/10', '居家生活', '30000', { '專案': '裝潢家具' }),
      expense('2026/07/12', '旅遊', '20000', { '專案': '260701-日本' }),
    ];

    const dashboard = buildHealthDashboard(records, july, config, [], {
      excludedProjects: ['裝潢家具'],
      excludeTravelProjects: true,
    });

    expect(dashboard.health.kpi.expense).toBe(10000);
    expect(dashboard.cashflow.variableExpense).toBe(10000);
    expect(dashboard.structure.map((item) => item.name)).toEqual(['餐飲']);
    expect(dashboard.behavior.txnCount).toBe(1);
    expect(dashboard.report.expense).toBe(10000);
  });

  it('monthly cache aggregates each month once with fixed and variable totals', () => {
    const records = [
      income('2026/07/01', '100000'),
      expense('2026/07/05', '居家', '20000', { '專案': '住家支出' }),
      expense('2026/07/06', '餐飲', '10000', { '專案': '正常開銷' }),
      expense('2026/06/06', '餐飲', '8000', { '專案': '正常開銷' }),
    ];

    const cache = buildMonthlyAggregateCache(getIncomeExpenseRows(records), config);
    expect(cache.get('2026-07')).toMatchObject({
      income: 100000,
      expense: 30000,
      fixedExpense: 20000,
      variableExpense: 10000,
      expenseCount: 2,
    });
    expect(cache.get('2026-06')?.expense).toBe(8000);
  });
});
