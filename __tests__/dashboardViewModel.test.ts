import { buildAccountTableData, buildDashboardAggregation } from '../viewModels/dashboardViewModel';
import type { AccountsSummaryMap } from '../types';

describe('dashboardViewModel', () => {
  it('buildDashboardAggregation returns empty for no records', () => {
    const result = buildDashboardAggregation({
      records: [],
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 31),
      accountFilter: null,
      excludedAccounts: [],
      isSplitShared: false,
    });
    expect(result.periodSummary.totalIncome).toBe(0);
    expect(result.dailyTrend).toEqual([]);
  });

  it('buildAccountTableData groups non-zero balances by asset class', () => {
    const summary: AccountsSummaryMap = {
      現金: { income: 0, expenditure: 0, balance: 1000, category: '現金' },
      富邦銀行: { income: 0, expenditure: 0, balance: 5000, category: '銀行' },
      空帳戶: { income: 0, expenditure: 0, balance: 0, category: '現金' },
    };
    const data = buildAccountTableData(summary, new Set());
    expect(data.hasAnyAccounts).toBe(true);
    expect(data.totalAbsoluteSum).toBe(6000);
    const cashLike = data.groups.flatMap((g) => g.accounts.map((a) => a.name));
    expect(cashLike).toContain('現金');
    expect(cashLike).toContain('富邦銀行');
    expect(cashLike).not.toContain('空帳戶');
  });
});
