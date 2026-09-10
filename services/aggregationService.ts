import type { RawRecord, AccountsSummaryMap, CustomAccountMappings, TrendDataPoint } from '../types';
import { ACCOUNT_CATEGORIES } from '../constants';
import { parseFormattedDate } from '../utils/dateUtils';
import {
  getCategoryForAccount as getCategoryForAccountCore,
  isSharedAccountName as isSharedAccountNameCore,
} from './core/attribution';
import {
  convertAmountToTwd,
  endOfDay,
  getDateKey as getIsoDateKey,
  isValidDate,
  normalizeDate,
} from './core/parsing';

const getCategoryForAccount = getCategoryForAccountCore;
const isSharedAccountName = (name: string) => isSharedAccountNameCore(name);

// 輔助函數：初始化帳戶數據 - 確保包含所有已定義的帳戶，不僅限於有交易的
export const initializeAccountData = (rawRecords: RawRecord[], accountFilter: string[] | null = null, excludedAccounts: string[] = [], customMappings: CustomAccountMappings = {}): { accountRunningBalances: { [key: string]: number }, finalAccountsSummary: AccountsSummaryMap } => {
  const accountRunningBalances: { [key: string]: number } = {};
  const finalAccountsSummary: AccountsSummaryMap = {};
  const allKnownAccountNames = new Set<string>();

  if (accountFilter) {
    accountFilter.forEach(account => allKnownAccountNames.add(account));
  } else {
    Object.values(ACCOUNT_CATEGORIES).flat().forEach(account => allKnownAccountNames.add(String(account)));
    Object.keys(customMappings).forEach(account => allKnownAccountNames.add(account));
    rawRecords.forEach(row => {
      if (row['收款(轉入)']) allKnownAccountNames.add(String(row['收款(轉入)']));
      if (row['付款(轉出)']) allKnownAccountNames.add(String(row['付款(轉出)']));
    });
  }

  allKnownAccountNames.forEach(accountName => {
    // 排除特定帳戶
    if (!excludedAccounts.includes(accountName)) {
      accountRunningBalances[accountName] = 0;
      finalAccountsSummary[accountName] = {
        income: 0,
        expenditure: 0,
        balance: 0,
        category: getCategoryForAccount(accountName, customMappings)
      };
    }
  });

  return { accountRunningBalances, finalAccountsSummary };
};

// 輔助函數：篩選和排序記錄
export const filterAndSortRecords = (rawRecords: RawRecord[], startDate: Date | null = null, endDate: Date | null = null): RawRecord[] => {
  const allRecords = rawRecords
    .filter(row => {
      if (row['分類'] === 'SYSTEM') return false;
      const recordDateStr = typeof row['日期'] === 'string' ? row['日期'] : '';
      return !(recordDateStr.length < 8);
    })
    .map(row => ({
      ...row,
      '分類': row['分類'] || row['主類別'] || '',
      parsedDate: normalizeDate(row['日期']),
    }))
    .sort((a, b) => (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0));

  if (startDate && endDate) {
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = endOfDay(endDate);
    return allRecords.filter(row => isValidDate(row.parsedDate) && row.parsedDate >= start && row.parsedDate <= end);
  } else if (endDate) {
    const end = endOfDay(endDate);
    return allRecords.filter(row => isValidDate(row.parsedDate) && row.parsedDate <= end);
  } else {
    const today = endOfDay(new Date());
    return allRecords.filter(row => isValidDate(row.parsedDate) && row.parsedDate <= today);
  }
};

// 輔助函數：更新帳戶餘額和快照
export const updateAccountBalancesAndSnapshots = (filteredRecords: RawRecord[], accountRunningBalances: { [key: string]: number }, isSplitShared: boolean = false): void => {
  filteredRecords.forEach(row => {
    const amount = convertAmountToTwd(row['金額'], row['幣別']);

    const incomeAccountName = row['收款(轉入)'];
    const expenseAccountName = row['付款(轉出)'];

    if (incomeAccountName && accountRunningBalances.hasOwnProperty(incomeAccountName)) {
      const splitFactor = (isSplitShared && isSharedAccountName(incomeAccountName)) ? 0.5 : 1.0;
      accountRunningBalances[incomeAccountName] += amount * splitFactor;
    }
    if (expenseAccountName && accountRunningBalances.hasOwnProperty(expenseAccountName)) {
      const splitFactor = (isSplitShared && isSharedAccountName(expenseAccountName)) ? 0.5 : 1.0;
      accountRunningBalances[expenseAccountName] -= amount * splitFactor;
    }
  });
};

export const generateTrendData = (rawRecords: RawRecord[], startDateOfPeriod: Date, endDateOfPeriod: Date, durationInDays: number, accountFilter: string[] | null = null, excludedAccounts: string[] = [], isSplitShared: boolean = false) => {
  const { accountRunningBalances: initialAccountsState } = initializeAccountData(rawRecords, accountFilter, excludedAccounts);

  const sortedAllRecords = [...rawRecords]
    .filter(row => {
      if (row['分類'] === 'SYSTEM') return false;
      const recordDateStr = typeof row['日期'] === 'string' ? row['日期'] : '';
      return recordDateStr.length >= 8;
    })
    .map(row => {
      const dateStr = (row['日期'] || '').toString();
      const date = parseFormattedDate(dateStr);
      const category = row['分類'] || row['主類別'] || '';
      return { ...row, '分類': category, parsedDate: date };
    })
    .sort((a, b) => (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0));

  if (sortedAllRecords.length === 0) {
    return { trendData: [], fullDailyBalanceSnapshots: new Map<string, { [key: string]: number }>(), minDateOverall: null, maxDateOverall: null };
  }

  const fullDailyBalanceSnapshots = new Map<string, { [key: string]: number }>();
  const fullDailyIncomeExpense = new Map<string, { income: number, expense: number }>();

  const currentOverallBalances: { [key: string]: number } = JSON.parse(JSON.stringify(initialAccountsState));

  const minDateOverall = sortedAllRecords[0].parsedDate!;
  const maxDateOverall = sortedAllRecords[sortedAllRecords.length - 1].parsedDate!;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const finalDateForSnapshots = maxDateOverall.getTime() > today.getTime() ? maxDateOverall : today;

  let dailyCursor = new Date(minDateOverall);
  dailyCursor.setHours(0, 0, 0, 0);
  let recordIndex = 0;
  while (dailyCursor.getTime() <= finalDateForSnapshots.getTime()) {
    const dateKey = getIsoDateKey(dailyCursor);
    let dayIncome = 0;
    let dayExpense = 0;

    if (dailyCursor.getTime() <= maxDateOverall.getTime()) {
      while (recordIndex < sortedAllRecords.length && sortedAllRecords[recordIndex].parsedDate!.getTime() === dailyCursor.getTime()) {
        const row = sortedAllRecords[recordIndex];
        const amount = Math.round(convertAmountToTwd(row['金額'], row['幣別']));

        const incomeAccountName = row['收款(轉入)'] ? String(row['收款(轉入)']) : '';
        const expenseAccountName = row['付款(轉出)'] ? String(row['付款(轉出)']) : '';
        const isIncomeAccountInFilter = Boolean(incomeAccountName && currentOverallBalances.hasOwnProperty(incomeAccountName));
        const isExpenseAccountInFilter = Boolean(expenseAccountName && currentOverallBalances.hasOwnProperty(expenseAccountName));

        // Balance updates must include ALL transactions to be accurate
        if (isIncomeAccountInFilter) {
          const splitFactor = (isSplitShared && isSharedAccountName(incomeAccountName)) ? 0.5 : 1.0;
          currentOverallBalances[incomeAccountName] += amount * splitFactor;
        }
        if (isExpenseAccountInFilter) {
          const splitFactor = (isSplitShared && isSharedAccountName(expenseAccountName)) ? 0.5 : 1.0;
          currentOverallBalances[expenseAccountName] -= amount * splitFactor;
        }

        // Stats filtering: Determine what counts as "Income" or "Expense" for the chart
        let isIncome = isIncomeAccountInFilter && !isExpenseAccountInFilter;
        let isExpense = isExpenseAccountInFilter && !isIncomeAccountInFilter;

        // Reset income/expense determination if cross-account transfers
        if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) {
          isIncome = false;
          isExpense = false;
        } else if (row['分類'] === '轉帳') {
          // Exclude transfers, unless it is '小伊轉帳' coming in as income
          if (!(row['子分類'] === '小伊轉帳' && isIncome)) {
            isIncome = false;
            isExpense = false;
          }
        }

        if (isIncome) {
          const splitFactor = (isSplitShared && isSharedAccountName(incomeAccountName)) ? 0.5 : 1.0;
          dayIncome += amount * splitFactor;
        } else if (isExpense) {
          const splitFactor = (isSplitShared && isSharedAccountName(expenseAccountName)) ? 0.5 : 1.0;
          dayExpense += amount * splitFactor;
        }

        recordIndex++;
      }
    }

    fullDailyBalanceSnapshots.set(dateKey, { ...currentOverallBalances });
    fullDailyIncomeExpense.set(dateKey, { income: dayIncome, expense: dayExpense });
    dailyCursor.setDate(dailyCursor.getDate() + 1);
  }

  const trendData: TrendDataPoint[] = [];
  const isDailyView = durationInDays < 89;
  let chartCursor = new Date(startDateOfPeriod);
  chartCursor.setHours(0, 0, 0, 0);

  let prevDayForChartStart = new Date(startDateOfPeriod.getTime() - (1000 * 60 * 60 * 24));
  const prevDayKeyForChartStart = getIsoDateKey(prevDayForChartStart);
  const initialSnapshot = fullDailyBalanceSnapshots.get(prevDayKeyForChartStart);
  let currentRenderTotalBalance = initialSnapshot ? Object.values(initialSnapshot).reduce((s: number, v: number) => s + v, 0) : 0;

  while (chartCursor.getTime() <= endDateOfPeriod.getTime()) {
    const dateKeyDaily = getIsoDateKey(chartCursor);
    let incomeForPeriod = 0;
    let expenseForPeriod = 0;
    let balanceForPoint = currentRenderTotalBalance;

    if (isDailyView) {
      const dailyAgg = fullDailyIncomeExpense.get(dateKeyDaily);
      if (dailyAgg) {
        incomeForPeriod = dailyAgg.income;
        expenseForPeriod = dailyAgg.expense;
      }
      if (fullDailyBalanceSnapshots.has(dateKeyDaily)) {
        balanceForPoint = Object.values(fullDailyBalanceSnapshots.get(dateKeyDaily)!).reduce((s: number, v: number) => s + v, 0);
      }
    } else {
      let tempMonthIncome = 0;
      let tempMonthExpense = 0;
      let lastSnapshotForMonth: { [key: string]: number } | null = null;
      let monthDayCursor = new Date(chartCursor.getFullYear(), chartCursor.getMonth(), 1);
      let actualMonthEndDate = new Date(chartCursor.getFullYear(), chartCursor.getMonth() + 1, 0);
      if (actualMonthEndDate.getTime() > endDateOfPeriod.getTime()) actualMonthEndDate = new Date(endDateOfPeriod);

      while (monthDayCursor.getTime() <= actualMonthEndDate.getTime()) {
        const dailyKey = getIsoDateKey(monthDayCursor);
        const dailyAgg = fullDailyIncomeExpense.get(dailyKey);
        if (dailyAgg) {
          tempMonthIncome += dailyAgg.income;
          tempMonthExpense += dailyAgg.expense;
        }
        if (fullDailyBalanceSnapshots.has(dailyKey)) lastSnapshotForMonth = fullDailyBalanceSnapshots.get(dailyKey)!;
        monthDayCursor.setDate(monthDayCursor.getDate() + 1);
      }
      incomeForPeriod = tempMonthIncome;
      expenseForPeriod = tempMonthExpense;
      if (lastSnapshotForMonth) {
        balanceForPoint = Object.values(lastSnapshotForMonth).reduce((s: number, v: number) => s + v, 0);
      }
    }

    currentRenderTotalBalance = balanceForPoint;

    trendData.push({
      date: new Date(chartCursor),
      income: Math.round(incomeForPeriod),
      expense: Math.round(expenseForPeriod),
      balance: Math.round(balanceForPoint)
    });

    if (isDailyView) {
      chartCursor.setDate(chartCursor.getDate() + 1);
    } else {
      chartCursor.setMonth(chartCursor.getMonth() + 1);
      chartCursor.setDate(1);
    }
  }

  return { trendData, fullDailyBalanceSnapshots, minDateOverall, maxDateOverall: finalDateForSnapshots };
};

export const processAndAggregateRecords = (rawRecords: RawRecord[], chartStartDate: Date | null, chartEndDate: Date | null, accountFilter: string[] | null = null, excludedAccounts: string[] = [], isSplitShared: boolean = false, customMappings: CustomAccountMappings = {}) => {
  if (!chartStartDate || !chartEndDate) {
    return { aggregatedSummary: {}, dailyTrend: [], periodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 }, previousPeriodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 } };
  }

  const { accountRunningBalances: initialAllAccountsState } = initializeAccountData(rawRecords, accountFilter, excludedAccounts);
  let currentAccumulatedBalancesForSummary = { ...initialAllAccountsState };
  const recordsUpToChartEndDate = filterAndSortRecords(rawRecords, null, chartEndDate);
  updateAccountBalancesAndSnapshots(recordsUpToChartEndDate, currentAccumulatedBalancesForSummary, isSplitShared);

  const finalAccountsSummary: AccountsSummaryMap = {};
  Object.keys(currentAccumulatedBalancesForSummary).forEach(accName => {
    finalAccountsSummary[accName] = {
      income: 0,
      expenditure: 0,
      balance: Math.round(currentAccumulatedBalancesForSummary[accName]),
      category: getCategoryForAccount(accName)
    };
  });

  const durationInDays = Math.ceil(Math.abs(chartEndDate.getTime() - chartStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const { trendData: dailyTrend, fullDailyBalanceSnapshots } = generateTrendData(rawRecords, chartStartDate, chartEndDate, durationInDays, accountFilter, excludedAccounts, isSplitShared);

  let periodSummary = { totalBalance: 0, totalIncome: 0, totalExpense: 0 };
  const chartEndDateKey = getIsoDateKey(chartEndDate);
  if (fullDailyBalanceSnapshots.has(chartEndDateKey)) {
    periodSummary.totalBalance = Math.round(Object.values(fullDailyBalanceSnapshots.get(chartEndDateKey)!).reduce((s: number, v: number) => s + v, 0));
  }

  const recordsInCurrentChartPeriod = filterAndSortRecords(rawRecords, chartStartDate, chartEndDate);
  recordsInCurrentChartPeriod.forEach(row => {
    const amount = Math.round(convertAmountToTwd(row['金額'], row['幣別']));
    const incomeAccountName = row['收款(轉入)'] ? String(row['收款(轉入)']) : '';
    const expenseAccountName = row['付款(轉出)'] ? String(row['付款(轉出)']) : '';
    const isIncomeAccountInFilter = Boolean(incomeAccountName && currentAccumulatedBalancesForSummary.hasOwnProperty(incomeAccountName) && (!accountFilter || accountFilter.includes(incomeAccountName)));
    const isExpenseAccountInFilter = Boolean(expenseAccountName && currentAccumulatedBalancesForSummary.hasOwnProperty(expenseAccountName) && (!accountFilter || accountFilter.includes(expenseAccountName)));

    let isIncome = isIncomeAccountInFilter && !isExpenseAccountInFilter;
    let isExpense = isExpenseAccountInFilter && !isIncomeAccountInFilter;

    if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) {
      isIncome = false;
      isExpense = false;
    } else if (row['分類'] === '轉帳') {
      if (!(row['子分類'] === '小伊轉帳' && isIncome)) {
        isIncome = false;
        isExpense = false;
      }
    }

    if (isIncome) {
      const splitFactor = (isSplitShared && isSharedAccountName(incomeAccountName)) ? 0.5 : 1.0;
      periodSummary.totalIncome += amount * splitFactor;
    } else if (isExpense) {
      const splitFactor = (isSplitShared && isSharedAccountName(expenseAccountName)) ? 0.5 : 1.0;
      periodSummary.totalExpense += amount * splitFactor;
    }
  });

  let previousPeriodSummary = { totalBalance: 0, totalIncome: 0, totalExpense: 0 };
  const ONE_DAY_MS = 1000 * 60 * 60 * 24;
  const durationMs = durationInDays * ONE_DAY_MS;
  const prevEndDate = new Date(chartStartDate.getTime() - ONE_DAY_MS);
  const prevStartDate = new Date(prevEndDate.getTime() - durationMs + ONE_DAY_MS);
  const prevEndDateKey = getIsoDateKey(prevEndDate);
  if (fullDailyBalanceSnapshots.has(prevEndDateKey)) {
    previousPeriodSummary.totalBalance = Math.round(Object.values(fullDailyBalanceSnapshots.get(prevEndDateKey)!).reduce((s: number, v: number) => s + v, 0));
  }
  const recordsInPrevChartPeriod = filterAndSortRecords(rawRecords, prevStartDate, prevEndDate);
  recordsInPrevChartPeriod.forEach(row => {
    const amount = Math.round(convertAmountToTwd(row['金額'], row['幣別']));
    const incomeAccountName = row['收款(轉入)'] ? String(row['收款(轉入)']) : '';
    const expenseAccountName = row['付款(轉出)'] ? String(row['付款(轉出)']) : '';
    const isIncomeAccountInFilter = Boolean(incomeAccountName && currentAccumulatedBalancesForSummary.hasOwnProperty(incomeAccountName) && (!accountFilter || accountFilter.includes(incomeAccountName)));
    const isExpenseAccountInFilter = Boolean(expenseAccountName && currentAccumulatedBalancesForSummary.hasOwnProperty(expenseAccountName) && (!accountFilter || accountFilter.includes(expenseAccountName)));

    let isIncome = isIncomeAccountInFilter && !isExpenseAccountInFilter;
    let isExpense = isExpenseAccountInFilter && !isIncomeAccountInFilter;

    if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) {
      isIncome = false;
      isExpense = false;
    } else if (row['分類'] === '轉帳') {
      if (!(row['子分類'] === '小伊轉帳' && isIncome)) {
        isIncome = false;
        isExpense = false;
      }
    }

    if (isIncome) {
      const splitFactor = (isSplitShared && isSharedAccountName(incomeAccountName)) ? 0.5 : 1.0;
      previousPeriodSummary.totalIncome += amount * splitFactor;
    } else if (isExpense) {
      const splitFactor = (isSplitShared && isSharedAccountName(expenseAccountName)) ? 0.5 : 1.0;
      previousPeriodSummary.totalExpense += amount * splitFactor;
    }
  });

  return { aggregatedSummary: finalAccountsSummary, dailyTrend, periodSummary, previousPeriodSummary };
};

