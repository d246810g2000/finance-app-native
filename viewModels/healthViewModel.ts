import type { BudgetGlobalConfig, BudgetRule, RawRecord, TransformedRecord } from '../types';
import {
  buildHealthDashboard,
  getIncomeExpenseRows,
} from '../services/financialHealthService';

export type HealthDashboard = ReturnType<typeof buildHealthDashboard>;

export interface HealthScopeInput {
  accountViewType: 'all' | 'personal' | 'shared';
  personalAccounts: string[];
  sharedAccounts: string[];
  isSplitShared: boolean;
  dailyOnly: boolean;
  excludedDailyProjects: string[];
}

export interface HealthScreenInput extends HealthScopeInput {
  records: RawRecord[];
  targetMonth: Date;
  budgetConfig: BudgetGlobalConfig;
  budgets: BudgetRule[];
  isFocused: boolean;
  previousDashboard?: ReturnType<typeof buildHealthDashboard> | null;
}

export function buildHealthScreenData(input: HealthScreenInput) {
  const accountFilter =
    input.accountViewType === 'personal'
      ? input.personalAccounts
      : input.accountViewType === 'shared'
        ? input.sharedAccounts
        : null;
  const preparedRows: TransformedRecord[] = input.isFocused
    ? getIncomeExpenseRows(input.records)
    : [];
  const healthScope = {
    accountFilter,
    isSplitShared: input.isSplitShared,
    sharedAccounts: input.sharedAccounts,
    excludedProjects: input.dailyOnly ? input.excludedDailyProjects : [],
    excludeTravelProjects: input.dailyOnly,
    preparedRows,
  };
  const dashboard = input.isFocused
    ? buildHealthDashboard(
        input.records,
        input.targetMonth,
        input.budgetConfig,
        input.budgets,
        healthScope,
      )
    : input.previousDashboard ??
      buildHealthDashboard([], input.targetMonth, input.budgetConfig, input.budgets, healthScope);

  return { dashboard, healthScope, preparedRows };
}
