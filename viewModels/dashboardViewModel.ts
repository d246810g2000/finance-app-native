import type { AccountsSummaryMap, TrendDataPoint } from '../types';
import type { RawRecord } from '../types';
import { processAndAggregateRecords } from '../services/aggregationService';
import { ASSET_CLASSES, getAssetClass } from '../constants';

export interface DashboardAggregation {
  aggregatedSummary: AccountsSummaryMap;
  dailyTrend: TrendDataPoint[];
  periodSummary: { totalBalance: number; totalIncome: number; totalExpense: number };
  previousPeriodSummary: { totalBalance: number; totalIncome: number; totalExpense: number };
}

export interface DashboardAggregationInput {
  records: RawRecord[];
  startDate: Date;
  endDate: Date;
  accountFilter: string[] | null;
  excludedAccounts: string[];
  isSplitShared: boolean;
}

const EMPTY_AGGREGATION: DashboardAggregation = {
  aggregatedSummary: {},
  dailyTrend: [],
  periodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 },
  previousPeriodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 },
};

export function buildDashboardAggregation(input: DashboardAggregationInput): DashboardAggregation {
  if (input.records.length === 0) return EMPTY_AGGREGATION;
  return processAndAggregateRecords(
    input.records,
    input.startDate,
    input.endDate,
    input.accountFilter,
    input.excludedAccounts,
    input.isSplitShared,
  );
}

export interface AccountTableAccount {
  name: string;
  balance: number;
  originalCategory: string;
}

export interface AccountTableSubGroup {
  name: string;
  accounts: AccountTableAccount[];
  totalBalance: number;
}

export interface AccountTableGroup {
  category: string;
  accounts: AccountTableAccount[];
  subGroups: AccountTableSubGroup[];
  isCollapsed: boolean;
  totalBalance: number;
  percentage: number;
}

export interface AccountTableData {
  groups: AccountTableGroup[];
  totalAbsoluteSum: number;
  hasAnyAccounts: boolean;
}

export function buildAccountTableData(
  aggregatedSummary: AccountsSummaryMap,
  collapsedGroups: Set<string>,
): AccountTableData {
  const groupsMap = new Map<string, AccountTableGroup>();

  Object.keys(ASSET_CLASSES).forEach((assetClass) => {
    groupsMap.set(assetClass, {
      category: assetClass,
      accounts: [],
      subGroups: [],
      isCollapsed: collapsedGroups.has(assetClass),
      totalBalance: 0,
      percentage: 0,
    });
  });

  Object.entries(aggregatedSummary).forEach(([accountName, accData]) => {
    if (accData.balance === 0) return;

    const originalCategory = accData.category || '未分類';
    const assetClass = getAssetClass(originalCategory);
    const group = groupsMap.get(assetClass);
    if (!group) return;

    const newAcc = { name: accountName, balance: accData.balance, originalCategory };
    group.accounts.push(newAcc);

    let subGroup = group.subGroups.find((sg) => sg.name === originalCategory);
    if (!subGroup) {
      subGroup = { name: originalCategory, accounts: [], totalBalance: 0 };
      group.subGroups.push(subGroup);
    }
    subGroup.accounts.push(newAcc);
    subGroup.totalBalance += accData.balance;
    group.totalBalance += accData.balance;
  });

  const groups = Array.from(groupsMap.values());

  groups.forEach((g) => {
    g.accounts.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    g.subGroups.sort((a, b) => Math.abs(b.totalBalance) - Math.abs(a.totalBalance));
    g.subGroups.forEach((sg) => {
      sg.accounts.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    });
  });

  const totalAbsoluteSum = groups.reduce((sum, g) => sum + Math.abs(g.totalBalance), 0);
  groups.forEach((g) => {
    g.percentage = totalAbsoluteSum > 0 ? (Math.abs(g.totalBalance) / totalAbsoluteSum) * 100 : 0;
  });

  return {
    groups,
    totalAbsoluteSum,
    hasAnyAccounts: groups.some((g) => g.accounts.length > 0),
  };
}
