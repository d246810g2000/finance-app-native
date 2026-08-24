import type { RawRecord } from '../types';
import { filterAndSortRecords } from '../services/financeService';
import { convertAmountToTwd } from '../services/core/parsing';
import { classifyStatsKind, normalizeTransaction } from '../services/core/transactionNormalization';

export interface AssetPeriodHistory {
  monthLabel: string;
  shortLabel: string;
  income: number;
  expense: number;
  rate: number;
  net: number;
  endBalance: number;
  index: number;
}

export interface HistoricalPeriodsInput {
  records: RawRecord[];
  startDate: Date;
  endDate: Date;
  durationInDays: number;
  enabled: boolean;
  accountFilter?: string[] | null;
  isSplitShared?: boolean;
  endBalance?: number;
}

export function buildHistoricalPeriods(input: HistoricalPeriodsInput): AssetPeriodHistory[] {
  if (!input.enabled) return [];

  const results: AssetPeriodHistory[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;
  const durationMs = Math.max(1, input.durationInDays) * oneDayMs;
  let runningBalance = input.endBalance ?? 0;

  for (let index = 0; index < 12; index += 1) {
    const periodStart = new Date(input.startDate.getTime() - index * durationMs);
    const periodEnd = new Date(input.endDate.getTime() - index * durationMs);
    let income = 0;
    let expense = 0;

    const periodRecords = filterAndSortRecords(input.records, periodStart, periodEnd);
    for (const record of periodRecords) {
      const transaction = normalizeTransaction(record, {
        isSplitShared: input.isSplitShared,
      });
      if (transaction.dateKey === null) continue;

      const incomeAccount = transaction.incomeAccount || '';
      const expenseAccount = transaction.expenseAccount || '';
      const incomeInScope = Boolean(incomeAccount && (!input.accountFilter || input.accountFilter.includes(incomeAccount)));
      const expenseInScope = Boolean(expenseAccount && (!input.accountFilter || input.accountFilter.includes(expenseAccount)));
      const statsKind = classifyStatsKind(transaction, incomeInScope, expenseInScope);
      if (!statsKind) continue;

      const attributedAmount = Math.round(
        convertAmountToTwd(record['金額'], record['幣別']) * transaction.splitFactor,
      );
      if (statsKind === 'income') income += attributedAmount;
      else expense += attributedAmount;
    }

    const rate = income > 0 ? ((income - expense) / income) * 100 : 0;
    const net = income - expense;
    let monthLabel = '';
    let shortLabel = '';
    if (input.durationInDays <= 31) {
      monthLabel = `${periodStart.getMonth() + 1}/${periodStart.getDate()} - ${periodEnd.getMonth() + 1}/${periodEnd.getDate()}`;
      shortLabel = `${periodStart.getMonth() + 1}/${periodStart.getDate()}`;
    } else if (input.durationInDays <= 92) {
      monthLabel = `${periodStart.getFullYear()}/${periodStart.getMonth() + 1} - ${periodEnd.getFullYear()}/${periodEnd.getMonth() + 1}`;
      shortLabel = `${periodStart.getMonth() + 1}/${periodEnd.getMonth() + 1}`;
    } else {
      monthLabel = `${periodStart.getFullYear()}/${periodStart.getMonth() + 1}`;
      shortLabel = `${periodStart.getFullYear()}`;
    }

    results.push({
      monthLabel: index === 0 ? '本期' : `過去 ${index} 期`,
      shortLabel,
      income,
      expense,
      rate,
      net,
      endBalance: runningBalance,
      index,
    });
    runningBalance -= net;
  }

  return results;
}
