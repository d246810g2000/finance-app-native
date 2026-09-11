/**
 * 財務健檢：純統計＋規則（無 LLM）
 * 涵蓋健康分數、現金流、支出結構、儲蓄率、規則洞察、固定扣款、行為統計、月報、成就
 */
import { RawRecord, BudgetRule, BudgetGlobalConfig, TransformedRecord } from '../types';
import { transformRecordsForExport } from './financeService';
import { getProjectGroup } from './budgetService';
import { parseFormattedDate } from '../utils/dateUtils';
import {
  accumulateCashFlowSplit,
  emptyCashFlowSplit,
  type CashFlowSplit,
} from './cashFlowClassification';

// ─── Weights（寫死、可測）───
/** 總分 100：偏警示力；口徑跟隨帳戶範圍（全部／個人／共享） */
export const HEALTH_SCORE_WEIGHTS = {
  livingSurplus: 25,
  stability: 20,
  spendControl: 20,
  housingBurden: 15,
  investmentHabit: 20,
} as const;

export type HealthScoreBreakdown = {
  livingSurplus: number;
  stability: number;
  spendControl: number;
  housingBurden: number;
  investmentHabit: number;
};

export type MonthlyKpi = {
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  netVsPrevMonth: number;
  topExpenseCategory: string | null;
  topExpenseAmount: number;
};

export type HealthScoreResult = {
  score: number | null;
  insufficientData: boolean;
  breakdown: HealthScoreBreakdown;
  kpi: MonthlyKpi;
  monthKey: string;
};

export type CashflowMonth = {
  monthKey: string;
  income: number;
  fixedExpense: number;
  variableExpense: number;
  remainder: number;
};

export type CashFlowSplitMonth = CashflowMonth & {
  livingIncome: number;
  investmentIncome: number;
  livingExpense: number;
  investmentExpense: number;
  livingNet: number;
  investmentNet: number;
};

export type CategoryShare = {
  name: string;
  amount: number;
  pct: number;
  prevAmount: number;
  deltaPct: number | null;
};

export type SavingsMonth = {
  monthKey: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
};

export type SavingsAnalysis = {
  months: SavingsMonth[];
  averageRate: number | null;
  best: SavingsMonth | null;
  worst: SavingsMonth | null;
};

export type CategoryTrendPoint = {
  monthKey: string;
  amount: number;
};

export type HealthInsight = {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  detail: string;
};

export type RecurringCharge = {
  merchant: string;
  amount: number;
  intervalDays: number;
  occurrences: number;
  lastDate: string;
  nextDate: string;
};

export type UpcomingPayment = {
  date: string;
  merchant: string;
  amount: number;
};

export type BehaviorStats = {
  byWeekday: { label: string; amount: number }[];
  byMonthThird: { label: string; amount: number }[];
  byHourBucket: { label: string; amount: number }[] | null;
  hasReliableTime: boolean;
  largestTxn: { amount: number; merchant: string; date: string } | null;
  maxSpendDay: { date: string; amount: number } | null;
  avgDaily: number;
  avgTxn: number;
  txnCount: number;
};

export type MonthlyReport = {
  monthKey: string;
  income: number;
  expense: number;
  net: number;
  incomeDeltaPct: number | null;
  expenseDeltaPct: number | null;
  netDeltaPct: number | null;
  topCategory: string | null;
  savingsRate: number | null;
};

export type Achievement = {
  id: string;
  title: string;
  detail: string;
  unlocked: boolean;
};

const DEFAULT_CONFIG: BudgetGlobalConfig = {
  includedProjects: [],
  splitProjects: [],
  projectGroups: {},
};

/** 帳戶範圍：對齊資產頁全部／個人／共享 */
export type HealthScopeOptions = {
  /** null／undefined = 全部帳戶 */
  accountFilter?: string[] | null;
  /** 共享帳戶金額是否以 50% 計入（對齊 isSplitEnabled） */
  isSplitShared?: boolean;
  /** 用於判斷哪些帳戶要套用分帳；未提供則不做分帳縮放 */
  sharedAccounts?: string[];
  /** 個人帳戶清單（流向拆分用） */
  personalAccounts?: string[];
  /** 日常健檢時排除的資本／事件專案 */
  excludedProjects?: string[];
  /** 排除 YYMMDD-名稱 格式的旅遊專案 */
  excludeTravelProjects?: boolean;
  /**
   * 尚未套用專案排除的收支列（帳戶／分帳可再套用）。
   * 住房負擔需計入「房屋購置」時使用。
   */
  basePreparedRows?: TransformedRecord[];
  /** 內部快取：避免同一張健檢頁重複轉換完整紀錄 */
  preparedRows?: TransformedRecord[];
  /** 內部標記：preparedRows 已套用帳戶／專案篩選 */
  scopeApplied?: boolean;
  /** 內部快取：每個月份只聚合一次 */
  monthlyCache?: Map<string, MonthlyAggregate>;
};

export type MonthlyAggregate = {
  income: number;
  expense: number;
  fixedExpense: number;
  variableExpense: number;
  categoryTotals: Record<string, number>;
  /** 收入來源（顯示用標籤 → 金額） */
  incomeCategoryTotals: Record<string, number>;
  expenseCount: number;
  /** 依分類區分（不看專案）：生活 vs 投資現金流 */
  cashFlowSplit: CashFlowSplit;
};

export type CashflowSankeyColorKey =
  | 'income'
  | 'expense'
  | 'variable'
  | 'fixed'
  | 'invest'
  | 'surplus'
  | 'deficit';

export type CashflowSankeyNode = {
  id: string;
  label: string;
  amount: number;
  kind: 'source' | 'hub' | 'destination';
  colorKey: CashflowSankeyColorKey;
};

export type CashflowSankeyLink = {
  id: string;
  sourceId: string;
  targetId: string;
  amount: number;
  colorKey: CashflowSankeyColorKey;
};

export type CashflowSankeySlice = {
  id: string;
  label: string;
  amount: number;
  pctOfIncome: number | null;
  colorKey: CashflowSankeyColorKey;
};

export type CashflowSankey = {
  monthKey: string;
  income: number;
  expense: number;
  livingExpense: number;
  investmentExpense: number;
  remainder: number;
  expenseRatio: number | null;
  nodes: CashflowSankeyNode[];
  links: CashflowSankeyLink[];
  sources: CashflowSankeySlice[];
  destinations: CashflowSankeySlice[];
};

// ─── Date helpers ───

export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function recordDate(r: TransformedRecord | RawRecord): Date {
  const raw = (r as TransformedRecord)['日期'] || (r as RawRecord)['日期'] || '';
  return parseFormattedDate(String(raw));
}

function inMonth(d: Date, target: Date): boolean {
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function roundMoney(n: number): number {
  return Math.round(n);
}

/** 依帳戶範圍過濾，並可對共享帳戶金額折半 */
export function applyHealthScope(
  rows: TransformedRecord[],
  scope?: HealthScopeOptions
): TransformedRecord[] {
  if (!scope) return rows;
  const filter = scope.accountFilter;
  const excludedProjects = scope.excludedProjects?.length
    ? new Set(scope.excludedProjects)
    : null;
  const sharedSet =
    scope.isSplitShared && scope.sharedAccounts?.length
      ? new Set(scope.sharedAccounts)
      : null;

  const out: TransformedRecord[] = [];
  for (const r of rows) {
    const account = r['帳戶'] || '';
    const project = r['專案'] || '';
    if (filter && !filter.includes(account)) continue;
    if (excludedProjects?.has(project)) continue;
    if (scope.excludeTravelProjects && /^\d{6}-/.test(project)) continue;
    if (sharedSet && sharedSet.has(account)) {
      out.push({ ...r, '金額': (r['金額'] || 0) * 0.5 });
    } else {
      out.push(r);
    }
  }
  return out;
}

/** 將 raw 轉成收支列（略過轉帳／SYSTEM），可套用帳戶範圍 */
export function getIncomeExpenseRows(
  records: RawRecord[],
  scope?: HealthScopeOptions
): TransformedRecord[] {
  if (scope?.preparedRows && scope.scopeApplied) return scope.preparedRows;
  const rows = scope?.preparedRows ?? transformRecordsForExport(records).filter(
      (r) => r['記錄類型'] === '收入' || r['記錄類型'] === '支出'
    );
  return applyHealthScope(rows, scope);
}

function expenseAbs(r: TransformedRecord): number {
  return Math.abs(r['金額'] || 0);
}

function isExpense(r: TransformedRecord): boolean {
  return r['記錄類型'] === '支出';
}

function isIncome(r: TransformedRecord): boolean {
  return r['記錄類型'] === '收入';
}

function isFixedExpense(r: TransformedRecord, config: BudgetGlobalConfig): boolean {
  return getProjectGroup(r['專案'] || '', config) === 'fixed';
}

/** 收入流向左側標籤：寬類別優先用子類別（薪資／利息等） */
function incomeSourceLabel(mainCategory: string, subCategory: string): string {
  const main = (mainCategory || '').trim();
  const sub = (subCategory || '').trim();
  if ((main === '一般收入' || main === '投資收入') && sub) return sub;
  if (main) return main;
  return sub || '其他';
}

/**
 * 「全部帳戶」視圖下，把進共享帳戶的收入拆成獨立來源。
 * 例如公司薪資同時入富邦＋共享樂天 →「公司薪資」與「共享薪資」。
 */
function sankeyIncomeSourceLabel(
  mainCategory: string,
  subCategory: string,
  account: string,
  sharedAccounts: Set<string> | null,
): string {
  const base = incomeSourceLabel(mainCategory, subCategory);
  if (!sharedAccounts || sharedAccounts.size === 0) return base;
  if (!sharedAccounts.has(account)) return base;
  if (base.includes('共享')) return base;
  if (base.includes('薪資')) return '共享薪資';
  return `${base}·共享`;
}

function emptyMonthlyAggregate(): MonthlyAggregate {
  return {
    income: 0,
    expense: 0,
    fixedExpense: 0,
    variableExpense: 0,
    categoryTotals: {},
    incomeCategoryTotals: {},
    expenseCount: 0,
    cashFlowSplit: emptyCashFlowSplit(),
  };
}

export function aggregateMonth(
  rows: TransformedRecord[],
  target: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  cache?: Map<string, MonthlyAggregate>
): MonthlyAggregate {
  const cached = cache?.get(toMonthKey(target));
  if (cached) return cached;
  let income = 0;
  let expense = 0;
  let fixedExpense = 0;
  let variableExpense = 0;
  let expenseCount = 0;
  const categoryTotals: Record<string, number> = {};
  const incomeCategoryTotals: Record<string, number> = {};
  const cashFlowSplit = emptyCashFlowSplit();

  for (const r of rows) {
    const d = recordDate(r);
    if (isNaN(d.getTime()) || !inMonth(d, target)) continue;

    if (isIncome(r)) {
      const amt = expenseAbs(r);
      income += amt;
      const main = r['主類別'] || '其他';
      const sub = r['子類別'] || '';
      const source = incomeSourceLabel(main, sub);
      incomeCategoryTotals[source] = (incomeCategoryTotals[source] || 0) + amt;
      accumulateCashFlowSplit(cashFlowSplit, '收入', main, amt, sub);
    } else if (isExpense(r)) {
      const amt = expenseAbs(r);
      expense += amt;
      expenseCount += 1;
      const cat = r['主類別'] || '其他';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      accumulateCashFlowSplit(cashFlowSplit, '支出', cat, amt, r['子類別'] || '');
      if (isFixedExpense(r, config)) fixedExpense += amt;
      else variableExpense += amt;
    }
  }

  return {
    income: roundMoney(income),
    expense: roundMoney(expense),
    fixedExpense: roundMoney(fixedExpense),
    variableExpense: roundMoney(variableExpense),
    categoryTotals,
    incomeCategoryTotals: Object.fromEntries(
      Object.entries(incomeCategoryTotals).map(([k, v]) => [k, roundMoney(v)])
    ),
    expenseCount,
    cashFlowSplit: {
      livingIncome: roundMoney(cashFlowSplit.livingIncome),
      investmentIncome: roundMoney(cashFlowSplit.investmentIncome),
      livingExpense: roundMoney(cashFlowSplit.livingExpense),
      investmentExpense: roundMoney(cashFlowSplit.investmentExpense),
      livingNet: roundMoney(cashFlowSplit.livingNet),
      investmentNet: roundMoney(cashFlowSplit.investmentNet),
    },
  };
}

export function buildMonthlyAggregateCache(
  rows: TransformedRecord[],
  config: BudgetGlobalConfig = DEFAULT_CONFIG
): Map<string, MonthlyAggregate> {
  const cache = new Map<string, MonthlyAggregate>();

  for (const row of rows) {
    const date = recordDate(row);
    if (isNaN(date.getTime())) continue;
    const key = toMonthKey(date);
    let month = cache.get(key);
    if (!month) {
      month = emptyMonthlyAggregate();
      cache.set(key, month);
    }

    if (isIncome(row)) {
      const amount = expenseAbs(row);
      month.income += amount;
      const main = row['主類別'] || '其他';
      const sub = row['子類別'] || '';
      const source = incomeSourceLabel(main, sub);
      month.incomeCategoryTotals[source] = (month.incomeCategoryTotals[source] || 0) + amount;
      accumulateCashFlowSplit(
        month.cashFlowSplit,
        '收入',
        main,
        amount,
        sub,
      );
    } else if (isExpense(row)) {
      const amount = expenseAbs(row);
      month.expense += amount;
      month.expenseCount += 1;
      const category = row['主類別'] || '其他';
      month.categoryTotals[category] = (month.categoryTotals[category] || 0) + amount;
      accumulateCashFlowSplit(month.cashFlowSplit, '支出', category, amount, row['子類別'] || '');
      if (isFixedExpense(row, config)) month.fixedExpense += amount;
      else month.variableExpense += amount;
    }
  }

  for (const month of cache.values()) {
    month.income = roundMoney(month.income);
    month.expense = roundMoney(month.expense);
    month.fixedExpense = roundMoney(month.fixedExpense);
    month.variableExpense = roundMoney(month.variableExpense);
    month.incomeCategoryTotals = Object.fromEntries(
      Object.entries(month.incomeCategoryTotals).map(([k, v]) => [k, roundMoney(v)])
    );
    month.cashFlowSplit = {
      livingIncome: roundMoney(month.cashFlowSplit.livingIncome),
      investmentIncome: roundMoney(month.cashFlowSplit.investmentIncome),
      livingExpense: roundMoney(month.cashFlowSplit.livingExpense),
      investmentExpense: roundMoney(month.cashFlowSplit.investmentExpense),
      livingNet: roundMoney(month.cashFlowSplit.livingNet),
      investmentNet: roundMoney(month.cashFlowSplit.investmentNet),
    };
  }
  return cache;
}

function savingsRate(income: number, expense: number): number | null {
  if (income <= 0) return null;
  return ((income - expense) / income) * 100;
}

function topCategory(categoryTotals: Record<string, number>): { name: string | null; amount: number } {
  let name: string | null = null;
  let amount = 0;
  for (const [k, v] of Object.entries(categoryTotals)) {
    if (v > amount) {
      amount = v;
      name = k;
    }
  }
  return { name, amount: roundMoney(amount) };
}

// ─── Phase 1: Health score ───

/** 住房／固定負擔專案：日常模式仍應計入房貸 */
const HOUSING_BURDEN_PROJECTS = new Set(['房屋購置', '住家支出']);

function isHousingBurdenExpense(r: TransformedRecord, config: BudgetGlobalConfig): boolean {
  const project = (r['專案'] || '').trim();
  if (HOUSING_BURDEN_PROJECTS.has(project)) return true;
  return getProjectGroup(project, config) === 'fixed';
}

function scoreLivingSurplus(livingIncome: number, livingNet: number): number {
  if (livingIncome <= 0) return livingNet >= 0 ? 12 : 0;
  const rate = (livingNet / livingIncome) * 100;
  if (rate >= 20) return HEALTH_SCORE_WEIGHTS.livingSurplus;
  if (rate >= 10) return 18;
  if (rate >= 0) return 10;
  if (rate >= -10) return 4;
  return 0;
}

function scoreStability(expenseHistory: number[]): number {
  if (expenseHistory.length < 2) return 12;
  const mean = expenseHistory.reduce((a, b) => a + b, 0) / expenseHistory.length;
  if (mean <= 0) return 12;
  const variance =
    expenseHistory.reduce((s, x) => s + (x - mean) ** 2, 0) / expenseHistory.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv < 0.15) return HEALTH_SCORE_WEIGHTS.stability;
  if (cv < 0.3) return 14;
  if (cv < 0.5) return 8;
  return 4;
}

function scoreSpendControl(
  categoryTotals: Record<string, number>,
  budgets: BudgetRule[],
  priorExpenseTotals: number[],
): number {
  const max = HEALTH_SCORE_WEIGHTS.spendControl;
  if (budgets.length) {
    let worst: 'ok' | 'warn' | 'exceeded' = 'ok';
    let exceededCount = 0;
    for (const b of budgets) {
      const spent = categoryTotals[b.category] || 0;
      if (b.monthlyLimit <= 0) continue;
      const pct = spent / b.monthlyLimit;
      if (pct >= 1) {
        worst = 'exceeded';
        exceededCount += 1;
      } else if (pct >= 0.85 && worst === 'ok') {
        worst = 'warn';
      }
    }
    if (worst === 'exceeded') return exceededCount >= 2 ? 0 : 4;
    if (worst === 'warn') return 10;
    return max;
  }

  const currTotal = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
  const priors = priorExpenseTotals.filter((n) => n > 0);
  if (!priors.length) return 14;
  const avgPrev = priors.reduce((a, b) => a + b, 0) / priors.length;
  if (avgPrev <= 0) return 14;
  const ratio = currTotal / avgPrev;
  if (ratio <= 1.1) return max;
  if (ratio <= 1.3) return 12;
  if (ratio <= 1.5) return 6;
  return 0;
}

function scoreHousingBurden(burdenExpense: number, livingIncome: number): number {
  const max = HEALTH_SCORE_WEIGHTS.housingBurden;
  if (livingIncome <= 0) return burdenExpense > 0 ? 6 : 8;
  const ratio = burdenExpense / livingIncome;
  if (ratio < 0.2) return max;
  if (ratio < 0.35) return 10;
  if (ratio < 0.5) return 5;
  return 1;
}

function scoreInvestmentHabit(investRates: Array<number | null>): number {
  const max = HEALTH_SCORE_WEIGHTS.investmentHabit;
  const rates = investRates.filter((r): r is number => r !== null);
  if (!rates.length) return 10;
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  const activeMonths = rates.filter((r) => r > 0).length;
  let score = 0;
  if (avg >= 0.1) score = max;
  else if (avg >= 0.05) score = 14;
  else if (avg >= 0.02) score = 8;
  else if (avg > 0) score = 4;
  else score = 0;
  // 近月有中斷投入時略扣，鼓勵穩定習慣
  if (rates.length >= 3 && activeMonths <= 1 && score > 0) score = Math.max(0, score - 4);
  return score;
}

/** 僅帳戶／分帳過濾，不排除專案（住房負擔用） */
function getAccountScopedRows(
  records: RawRecord[],
  scope?: HealthScopeOptions,
): TransformedRecord[] {
  return getIncomeExpenseRows(records, {
    accountFilter: scope?.accountFilter,
    isSplitShared: scope?.isSplitShared,
    sharedAccounts: scope?.sharedAccounts,
    personalAccounts: scope?.personalAccounts,
    preparedRows: scope?.basePreparedRows,
    scopeApplied: false,
  });
}

function sumHousingBurdenInMonth(
  rows: TransformedRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig,
): number {
  let total = 0;
  for (const r of rows) {
    if (!isExpense(r)) continue;
    const d = recordDate(r);
    if (isNaN(d.getTime()) || !inMonth(d, targetMonth)) continue;
    if (!isHousingBurdenExpense(r, config)) continue;
    total += expenseAbs(r);
  }
  return roundMoney(total);
}

export function inferHealthScopeLabel(scope?: HealthScopeOptions): string {
  if (!scope?.accountFilter?.length) return '全部';
  const filter = scope.accountFilter;
  const personal = scope.personalAccounts ?? [];
  const shared = scope.sharedAccounts ?? [];
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((name) => b.includes(name));
  if (personal.length && sameSet(filter, personal)) return '個人';
  if (shared.length && sameSet(filter, shared)) return '共享';
  return '選定帳戶';
}

export function computeHealthScore(
  records: RawRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  budgets: BudgetRule[] = [],
  scope?: HealthScopeOptions
): HealthScoreResult {
  const rows = getIncomeExpenseRows(records, scope);
  const curr = aggregateMonth(rows, targetMonth, config, scope?.monthlyCache);
  const prev = aggregateMonth(rows, shiftMonth(targetMonth, -1), config, scope?.monthlyCache);
  const top = topCategory(curr.categoryTotals);
  const rate = savingsRate(curr.income, curr.expense);
  const net = curr.income - curr.expense;
  const split = curr.cashFlowSplit;

  const livingExpenseHistory: number[] = [];
  const priorExpenseTotals: number[] = [];
  const investRates: Array<number | null> = [];
  for (let i = 2; i >= 0; i--) {
    const month = shiftMonth(targetMonth, -i);
    const agg = aggregateMonth(rows, month, config, scope?.monthlyCache);
    livingExpenseHistory.push(agg.cashFlowSplit.livingExpense);
    if (i > 0) priorExpenseTotals.push(agg.cashFlowSplit.livingExpense);
    const livingIncome = agg.cashFlowSplit.livingIncome;
    investRates.push(
      livingIncome > 0 ? agg.cashFlowSplit.investmentExpense / livingIncome : null,
    );
  }

  const accountRows = getAccountScopedRows(records, scope);
  const housingBurden = sumHousingBurdenInMonth(accountRows, targetMonth, config);

  const breakdown: HealthScoreBreakdown = {
    livingSurplus: scoreLivingSurplus(split.livingIncome, split.livingNet),
    stability: scoreStability(livingExpenseHistory),
    spendControl: scoreSpendControl(curr.categoryTotals, budgets, priorExpenseTotals),
    housingBurden: scoreHousingBurden(housingBurden, split.livingIncome),
    investmentHabit: scoreInvestmentHabit(investRates),
  };

  const hasAny = curr.income > 0 || curr.expense > 0;
  const score = hasAny
    ? breakdown.livingSurplus +
      breakdown.stability +
      breakdown.spendControl +
      breakdown.housingBurden +
      breakdown.investmentHabit
    : null;

  return {
    score,
    insufficientData: !hasAny,
    breakdown,
    kpi: {
      income: curr.income,
      expense: curr.expense,
      net,
      savingsRate: rate,
      netVsPrevMonth: net - (prev.income - prev.expense),
      topExpenseCategory: top.name,
      topExpenseAmount: top.amount,
    },
    monthKey: toMonthKey(targetMonth),
  };
}

// ─── Phase 2: Cashflow + structure ───

export function computeCashflowMonth(
  records: RawRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  scope?: HealthScopeOptions
): CashflowMonth {
  const rows = getIncomeExpenseRows(records, scope);
  const m = aggregateMonth(rows, targetMonth, config, scope?.monthlyCache);
  return {
    monthKey: toMonthKey(targetMonth),
    income: m.income,
    fixedExpense: m.fixedExpense,
    variableExpense: m.variableExpense,
    remainder: m.income - m.fixedExpense - m.variableExpense,
  };
}

/** 依分類分離生活 vs 投資現金流（不看專案欄） */
export function computeCashFlowSplitMonth(
  records: RawRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  scope?: HealthScopeOptions
): CashFlowSplitMonth {
  const rows = getIncomeExpenseRows(records, scope);
  const m = aggregateMonth(rows, targetMonth, config, scope?.monthlyCache);
  const split = m.cashFlowSplit;
  return {
    monthKey: toMonthKey(targetMonth),
    income: m.income,
    fixedExpense: m.fixedExpense,
    variableExpense: m.variableExpense,
    remainder: m.income - m.fixedExpense - m.variableExpense,
    livingIncome: split.livingIncome,
    investmentIncome: split.investmentIncome,
    livingExpense: split.livingExpense,
    investmentExpense: split.investmentExpense,
    livingNet: split.livingNet,
    investmentNet: split.investmentNet,
  };
}

function pctOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return (part / whole) * 100;
}

/**
 * 收入 → 支出／儲蓄／結餘 的 Sankey 資料。
 * 支出側把投資支出獨立成「儲蓄·投資」，其餘生活支出拆固定／變動。
 */
export function computeCashflowSankey(
  records: RawRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  scope?: HealthScopeOptions
): CashflowSankey {
  const rows = getIncomeExpenseRows(records, scope);
  const m = aggregateMonth(rows, targetMonth, config, scope?.monthlyCache);
  const income = m.income;
  const expense = m.expense;
  const investmentExpense = Math.min(m.cashFlowSplit.investmentExpense, expense);
  const livingExpense = Math.max(0, expense - investmentExpense);
  const fixedExpense = Math.min(m.fixedExpense, livingExpense);
  const variableExpense = Math.max(0, livingExpense - fixedExpense);
  const remainder = income - expense;
  const surplus = Math.max(0, remainder);
  const deficit = Math.max(0, -remainder);

  // 僅在「全部帳戶」時依入帳帳戶拆共享；個人／共享篩選下來源已同質，不必加後綴
  const distinguishShared =
    !scope?.accountFilter && Boolean(scope?.sharedAccounts?.length);
  const sharedSet = distinguishShared
    ? new Set(scope!.sharedAccounts)
    : null;

  const sourceTotals: Record<string, number> = {};
  if (sharedSet) {
    for (const r of rows) {
      if (!isIncome(r)) continue;
      const d = recordDate(r);
      if (isNaN(d.getTime()) || !inMonth(d, targetMonth)) continue;
      const label = sankeyIncomeSourceLabel(
        r['主類別'] || '其他',
        r['子類別'] || '',
        r['帳戶'] || '',
        sharedSet,
      );
      sourceTotals[label] = (sourceTotals[label] || 0) + expenseAbs(r);
    }
  } else {
    for (const [label, amount] of Object.entries(m.incomeCategoryTotals)) {
      sourceTotals[label] = amount;
    }
  }

  const rankedSources = Object.entries(sourceTotals)
    .map(([label, amount]) => ({ label, amount: roundMoney(amount) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const topSources = rankedSources.slice(0, 5);
  const otherAmount = rankedSources.slice(5).reduce((sum, item) => sum + item.amount, 0);
  const sourceSlices: CashflowSankeySlice[] = topSources.map((item, index) => ({
    id: `src-${index}-${item.label}`,
    label: item.label,
    amount: item.amount,
    pctOfIncome: pctOf(item.amount, income),
    colorKey: 'income',
  }));
  if (otherAmount > 0) {
    sourceSlices.push({
      id: 'src-other',
      label: '其他收入',
      amount: roundMoney(otherAmount),
      pctOfIncome: pctOf(otherAmount, income),
      colorKey: 'income',
    });
  }
  if (sourceSlices.length === 0 && income > 0) {
    sourceSlices.push({
      id: 'src-all',
      label: '收入',
      amount: income,
      pctOfIncome: 100,
      colorKey: 'income',
    });
  }

  const destinationDefs: Array<{
    id: string;
    label: string;
    amount: number;
    colorKey: CashflowSankeyColorKey;
  }> = [
    { id: 'dst-variable', label: '變動支出', amount: variableExpense, colorKey: 'variable' },
    { id: 'dst-fixed', label: '固定支出', amount: fixedExpense, colorKey: 'fixed' },
    { id: 'dst-invest', label: '儲蓄·投資', amount: investmentExpense, colorKey: 'invest' },
  ];
  if (surplus > 0) {
    destinationDefs.push({ id: 'dst-surplus', label: '結餘', amount: surplus, colorKey: 'surplus' });
  }
  if (deficit > 0) {
    destinationDefs.push({ id: 'dst-deficit', label: '超支', amount: deficit, colorKey: 'deficit' });
  }

  const destinations: CashflowSankeySlice[] = destinationDefs
    .filter((item) => item.amount > 0)
    .map((item) => ({
      ...item,
      pctOfIncome: pctOf(item.amount, Math.max(income, expense)),
    }));

  const nodes: CashflowSankeyNode[] = [
    ...sourceSlices.map((item) => ({
      id: item.id,
      label: item.label,
      amount: item.amount,
      kind: 'source' as const,
      colorKey: item.colorKey,
    })),
  ];

  if (income > 0) {
    nodes.push({
      id: 'hub-income',
      label: '收入',
      amount: income,
      kind: 'hub',
      colorKey: 'income',
    });
  }

  nodes.push(
    ...destinations.map((item) => ({
      id: item.id,
      label: item.label,
      amount: item.amount,
      kind: 'destination' as const,
      colorKey: item.colorKey,
    }))
  );

  const links: CashflowSankeyLink[] = [];
  if (income > 0) {
    for (const source of sourceSlices) {
      links.push({
        id: `link-${source.id}-hub`,
        sourceId: source.id,
        targetId: 'hub-income',
        amount: source.amount,
        colorKey: 'income',
      });
    }
    for (const destination of destinations) {
      // 超支無法從收入流出；改由視覺上從 hub 標示缺口，連結金額用 0 略過
      if (destination.id === 'dst-deficit') continue;
      const amount = Math.min(destination.amount, income);
      if (amount <= 0) continue;
      links.push({
        id: `link-hub-${destination.id}`,
        sourceId: 'hub-income',
        targetId: destination.id,
        amount,
        colorKey: destination.colorKey,
      });
    }
  }

  return {
    monthKey: toMonthKey(targetMonth),
    income,
    expense,
    livingExpense: roundMoney(livingExpense),
    investmentExpense: roundMoney(investmentExpense),
    remainder: roundMoney(remainder),
    expenseRatio: pctOf(expense, income),
    nodes,
    links,
    sources: sourceSlices,
    destinations,
  };
}

/**
 * 依帳戶歸屬拆出個人／共享兩條流向（不受當前 accountFilter 影響，仍套用專案排除與分帳）。
 * 供結構分頁「個人流向／共享流向」切換。
 */
export function computeCashflowSankeyLanes(
  records: RawRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  scope?: HealthScopeOptions
): { personal: CashflowSankey; shared: CashflowSankey } {
  const projectScope: HealthScopeOptions = {
    excludedProjects: scope?.excludedProjects,
    excludeTravelProjects: scope?.excludeTravelProjects,
  };
  // 僅套用專案排除，保留全部帳戶，再分別篩個人／共享
  const unscopedRows = getIncomeExpenseRows(records, projectScope);
  const sharedAccounts = scope?.sharedAccounts ?? [];
  const sharedSet = new Set(sharedAccounts);
  const personalAccounts = scope?.personalAccounts?.length
    ? scope.personalAccounts
    : [...new Set(
        unscopedRows
          .map((row) => row['帳戶'] || '')
          .filter((name) => name && !sharedSet.has(name))
      )];

  const personal = computeCashflowSankey(records, targetMonth, config, {
    ...projectScope,
    personalAccounts,
    sharedAccounts,
    accountFilter: personalAccounts,
    isSplitShared: false,
    preparedRows: unscopedRows,
    scopeApplied: false,
  });

  const shared = computeCashflowSankey(records, targetMonth, config, {
    ...projectScope,
    personalAccounts,
    sharedAccounts,
    accountFilter: sharedAccounts,
    isSplitShared: Boolean(scope?.isSplitShared),
    preparedRows: unscopedRows,
    scopeApplied: false,
  });

  return { personal, shared };
}

export function computeCashflowYear(
  records: RawRecord[],
  endMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  months = 12,
  scope?: HealthScopeOptions
): CashflowMonth[] {
  const rows = getIncomeExpenseRows(records, scope);
  const out: CashflowMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const t = shiftMonth(endMonth, -i);
    const m = aggregateMonth(rows, t, config, scope?.monthlyCache);
    out.push({
      monthKey: toMonthKey(t),
      income: m.income,
      fixedExpense: m.fixedExpense,
      variableExpense: m.variableExpense,
      remainder: m.income - m.fixedExpense - m.variableExpense,
    });
  }
  return out;
}

export function computeExpenseStructure(
  records: RawRecord[],
  targetMonth: Date,
  scope?: HealthScopeOptions
): CategoryShare[] {
  const rows = getIncomeExpenseRows(records, scope);
  const curr = aggregateMonth(rows, targetMonth, DEFAULT_CONFIG, scope?.monthlyCache);
  const prev = aggregateMonth(rows, shiftMonth(targetMonth, -1), DEFAULT_CONFIG, scope?.monthlyCache);
  const total = curr.expense || 1;

  return Object.entries(curr.categoryTotals)
    .map(([name, amount]) => {
      const prevAmount = prev.categoryTotals[name] || 0;
      return {
        name,
        amount: roundMoney(amount),
        pct: (amount / total) * 100,
        prevAmount: roundMoney(prevAmount),
        deltaPct: pctChange(amount, prevAmount),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

// ─── Phase 3: Savings + category trends ───

export function computeSavingsAnalysis(
  records: RawRecord[],
  endMonth: Date,
  months = 12,
  scope?: HealthScopeOptions
): SavingsAnalysis {
  const rows = getIncomeExpenseRows(records, scope);
  const list: SavingsMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const t = shiftMonth(endMonth, -i);
    const m = aggregateMonth(rows, t, DEFAULT_CONFIG, scope?.monthlyCache);
    list.push({
      monthKey: toMonthKey(t),
      income: m.income,
      expense: m.expense,
      net: m.income - m.expense,
      savingsRate: savingsRate(m.income, m.expense),
    });
  }

  const withRate = list.filter((m) => m.savingsRate !== null);
  const averageRate =
    withRate.length === 0
      ? null
      : withRate.reduce((s, m) => s + (m.savingsRate as number), 0) / withRate.length;

  let best: SavingsMonth | null = null;
  let worst: SavingsMonth | null = null;
  for (const m of withRate) {
    if (!best || (m.savingsRate as number) > (best.savingsRate as number)) best = m;
    if (!worst || (m.savingsRate as number) < (worst.savingsRate as number)) worst = m;
  }

  return { months: list, averageRate, best, worst };
}

export function computeCategoryTrend(
  records: RawRecord[],
  category: string,
  endMonth: Date,
  months = 12,
  scope?: HealthScopeOptions
): CategoryTrendPoint[] {
  const rows = getIncomeExpenseRows(records, scope);
  const out: CategoryTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const t = shiftMonth(endMonth, -i);
    const m = aggregateMonth(rows, t, DEFAULT_CONFIG, scope?.monthlyCache);
    out.push({
      monthKey: toMonthKey(t),
      amount: roundMoney(m.categoryTotals[category] || 0),
    });
  }
  return out;
}

export function computeTopCategoryByMonth(
  records: RawRecord[],
  endMonth: Date,
  months = 12,
  scope?: HealthScopeOptions
): { monthKey: string; category: string | null; amount: number }[] {
  const rows = getIncomeExpenseRows(records, scope);
  const out: { monthKey: string; category: string | null; amount: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const t = shiftMonth(endMonth, -i);
    const m = aggregateMonth(rows, t, DEFAULT_CONFIG, scope?.monthlyCache);
    const top = topCategory(m.categoryTotals);
    out.push({ monthKey: toMonthKey(t), category: top.name, amount: top.amount });
  }
  return out;
}

export function listMainCategories(records: RawRecord[], endMonth: Date, months = 12, scope?: HealthScopeOptions): string[] {
  const rows = getIncomeExpenseRows(records, scope);
  const totals: Record<string, number> = {};
  for (let i = months - 1; i >= 0; i--) {
    const m = aggregateMonth(rows, shiftMonth(endMonth, -i), DEFAULT_CONFIG, scope?.monthlyCache);
    for (const [k, v] of Object.entries(m.categoryTotals)) {
      totals[k] = (totals[k] || 0) + v;
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 8);
}

// ─── Phase 4: Rules ───

export function evaluateHealthRules(
  records: RawRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  budgets: BudgetRule[] = [],
  scope?: HealthScopeOptions
): HealthInsight[] {
  const rows = getIncomeExpenseRows(records, scope);
  const insights: HealthInsight[] = [];
  const curr = aggregateMonth(rows, targetMonth, config, scope?.monthlyCache);
  const prev = aggregateMonth(rows, shiftMonth(targetMonth, -1), config, scope?.monthlyCache);
  const prev2 = aggregateMonth(rows, shiftMonth(targetMonth, -2), config, scope?.monthlyCache);
  const rate = savingsRate(curr.income, curr.expense);
  const net = curr.income - curr.expense;
  const prevNet = prev.income - prev.expense;
  const split = curr.cashFlowSplit;
  const scopeTag = inferHealthScopeLabel(scope);
  const titled = (title: string) => `${scopeTag}｜${title}`;

  // Rule: category rising 3 months
  const cats = new Set([
    ...Object.keys(curr.categoryTotals),
    ...Object.keys(prev.categoryTotals),
    ...Object.keys(prev2.categoryTotals),
  ]);
  for (const cat of cats) {
    const a = prev2.categoryTotals[cat] || 0;
    const b = prev.categoryTotals[cat] || 0;
    const c = curr.categoryTotals[cat] || 0;
    if (a > 0 && b > a && c > b) {
      insights.push({
        id: `cat-rise-${cat}`,
        severity: 'warning',
        title: titled(`${cat}連續三個月增加`),
        detail: `${toMonthKey(shiftMonth(targetMonth, -2))} $${roundMoney(a).toLocaleString()} → ${toMonthKey(shiftMonth(targetMonth, -1))} $${roundMoney(b).toLocaleString()} → 本月 $${roundMoney(c).toLocaleString()}`,
      });
    }
  }

  // Rule: over budget
  for (const b of budgets) {
    const spent = curr.categoryTotals[b.category] || 0;
    if (b.monthlyLimit > 0 && spent > b.monthlyLimit) {
      insights.push({
        id: `over-budget-${b.category}`,
        severity: 'danger',
        title: titled(`${b.category}超過預算`),
        detail: `已花 $${roundMoney(spent).toLocaleString()}／預算 $${b.monthlyLimit.toLocaleString()}`,
      });
    }
  }

  // Rule: living surplus low（不含投資收入灌水）
  if (split.livingIncome > 0) {
    const livingRate = (split.livingNet / split.livingIncome) * 100;
    if (livingRate < 10) {
      insights.push({
        id: 'low-living-surplus',
        severity: livingRate < 0 ? 'danger' : 'warning',
        title: titled('生活結餘偏低'),
        detail: `生活結餘率 ${livingRate.toFixed(1)}%（生活收入 $${roundMoney(split.livingIncome).toLocaleString()}）`,
      });
    }
  }

  // Rule: spend spike vs prior 2 months（無預算時的暴衝警示）
  if (!budgets.length) {
    const prevAvg =
      (prev.cashFlowSplit.livingExpense + prev2.cashFlowSplit.livingExpense) / 2;
    if (prevAvg > 0 && split.livingExpense > prevAvg * 1.3) {
      const growth = ((split.livingExpense / prevAvg) - 1) * 100;
      insights.push({
        id: 'living-spend-spike',
        severity: split.livingExpense > prevAvg * 1.5 ? 'danger' : 'warning',
        title: titled('生活支出明顯暴衝'),
        detail: `較近兩月均高出 ${growth.toFixed(0)}%（$${roundMoney(prevAvg).toLocaleString()} → $${roundMoney(split.livingExpense).toLocaleString()}）`,
      });
    }
  }

  // Rule: investment habit thin
  if (split.livingIncome > 0) {
    const investRate = split.investmentExpense / split.livingIncome;
    const prevInvest =
      prev.cashFlowSplit.livingIncome > 0
        ? prev.cashFlowSplit.investmentExpense / prev.cashFlowSplit.livingIncome
        : 0;
    if (investRate < 0.02 && prevInvest < 0.02) {
      insights.push({
        id: 'low-investment-habit',
        severity: 'info',
        title: titled('投資投入偏少'),
        detail: `本月投資支出佔生活收入 ${(investRate * 100).toFixed(1)}%（建議持續投入）`,
      });
    }
  }

  // Rule: housing burden high（含房屋購置，即使日常模式排除）
  const accountRows = getAccountScopedRows(records, scope);
  const housingBurden = sumHousingBurdenInMonth(accountRows, targetMonth, config);
  if (split.livingIncome > 0 && housingBurden / split.livingIncome >= 0.35) {
    const burdenPct = (housingBurden / split.livingIncome) * 100;
    insights.push({
      id: 'high-housing-burden',
      severity: burdenPct >= 50 ? 'danger' : 'warning',
      title: titled('住房與固定負擔偏高'),
      detail: `約佔生活收入 ${burdenPct.toFixed(0)}%（$${housingBurden.toLocaleString()}）`,
    });
  }

  // Rule: savings < 10%（總口徑，輔助）
  if (rate !== null && rate < 10) {
    insights.push({
      id: 'low-savings',
      severity: rate < 0 ? 'danger' : 'warning',
      title: titled('整體儲蓄率偏低'),
      detail: `本月儲蓄率 ${rate.toFixed(1)}%（門檻 10%）`,
    });
  }

  // Rule: expense > income
  if (curr.income > 0 && curr.expense > curr.income) {
    insights.push({
      id: 'expense-gt-income',
      severity: 'danger',
      title: titled('本月支出大於收入'),
      detail: `收入 $${curr.income.toLocaleString()}、支出 $${curr.expense.toLocaleString()}`,
    });
  } else if (curr.income === 0 && curr.expense > 0) {
    insights.push({
      id: 'expense-no-income',
      severity: 'warning',
      title: titled('本月有支出但無收入'),
      detail: `支出 $${curr.expense.toLocaleString()}`,
    });
  }

  // Rule: 2 months negative cashflow
  if (net < 0 && prevNet < 0) {
    insights.push({
      id: 'neg-cashflow-2m',
      severity: 'danger',
      title: titled('連續兩個月負現金流'),
      detail: `上月結餘 $${prevNet.toLocaleString()}、本月 $${net.toLocaleString()}`,
    });
  }

  // Rule: same merchant >= 10 times in last 7 days of month window
  const weekEnd = monthEnd(targetMonth);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const merchantCounts: Record<string, number> = {};
  for (const r of rows) {
    if (!isExpense(r)) continue;
    const d = recordDate(r);
    if (isNaN(d.getTime()) || d < weekStart || d > weekEnd) continue;
    const m = (r['商家'] || '').trim() || '未知';
    if (m === '未知' || m.length < 2) continue;
    merchantCounts[m] = (merchantCounts[m] || 0) + 1;
  }
  for (const [m, n] of Object.entries(merchantCounts)) {
    if (n >= 10) {
      insights.push({
        id: `merchant-freq-${m}`,
        severity: 'info',
        title: titled(`${m}一週消費過密`),
        detail: `近 7 天出現 ${n} 次`,
      });
    }
  }

  // Rule: fixed expense +20%
  if (prev.fixedExpense > 0 && curr.fixedExpense >= prev.fixedExpense * 1.2) {
    const growth = pctChange(curr.fixedExpense, prev.fixedExpense);
    insights.push({
      id: 'fixed-up-20',
      severity: 'warning',
      title: titled('固定支出明顯增加'),
      detail: `較上月增加 ${growth !== null ? growth.toFixed(0) : '?'}%（$${prev.fixedExpense.toLocaleString()} → $${curr.fixedExpense.toLocaleString()}）`,
    });
  }

  const severityRank = { danger: 0, warning: 1, info: 2 };
  return insights.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

// ─── Phase 5: Recurring / upcoming ───

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function detectRecurringCharges(records: RawRecord[], scope?: HealthScopeOptions): RecurringCharge[] {
  const rows = getIncomeExpenseRows(records, scope).filter(isExpense);
  type Hit = { date: Date; amount: number };
  const buckets: Record<string, Hit[]> = {};

  const newestDate = rows.reduce<Date | null>((latest, row) => {
    const date = recordDate(row);
    if (isNaN(date.getTime())) return latest;
    return !latest || date > latest ? date : latest;
  }, null);
  const cutoff = newestDate
    ? new Date(newestDate.getFullYear(), newestDate.getMonth() - 23, 1)
    : null;

  for (const r of rows) {
    const merchant = (r['商家'] || '').trim();
    if (!merchant || merchant.length < 2) continue;
    const d = recordDate(r);
    if (isNaN(d.getTime())) continue;
    if (cutoff && d < cutoff) continue;
    const amt = expenseAbs(r);
    if (amt < 50) continue;
    // round to nearest 10 for clustering
    const rounded = Math.round(amt / 10) * 10;
    const key = `${merchant}::${rounded}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push({ date: d, amount: amt });
  }

  const results: RecurringCharge[] = [];

  for (const [key, hits] of Object.entries(buckets)) {
    if (hits.length < 3) continue;
    hits.sort((a, b) => a.date.getTime() - b.date.getTime());
    // dedupe same day
    const unique: Hit[] = [];
    for (const h of hits) {
      const last = unique[unique.length - 1];
      if (last && daysBetween(last.date, h.date) === 0) continue;
      unique.push(h);
    }
    if (unique.length < 3) continue;

    const intervals: number[] = [];
    for (let i = 1; i < unique.length; i++) {
      intervals.push(daysBetween(unique[i - 1].date, unique[i].date));
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    // monthly-ish: 25–40 days, or weekly 6–9
    const isMonthly = avgInterval >= 25 && avgInterval <= 40;
    const isWeekly = avgInterval >= 6 && avgInterval <= 9;
    if (!isMonthly && !isWeekly) continue;

    // intervals should be fairly stable
    const stable = intervals.every((iv) => Math.abs(iv - avgInterval) <= (isWeekly ? 3 : 8));
    if (!stable) continue;

    const [merchant, roundedStr] = key.split('::');
    const last = unique[unique.length - 1];
    const intervalDays = Math.round(avgInterval);
    const next = addDays(last.date, intervalDays);
    const avgAmt = Math.round(unique.reduce((s, h) => s + h.amount, 0) / unique.length);

    results.push({
      merchant,
      amount: avgAmt || parseInt(roundedStr, 10),
      intervalDays,
      occurrences: unique.length,
      lastDate: formatYmd(last.date),
      nextDate: formatYmd(next),
    });
  }

  return results.sort((a, b) => b.amount - a.amount);
}

export function getUpcomingPayments(
  charges: RecurringCharge[],
  fromDate: Date = new Date(),
  withinDays = 45
): UpcomingPayment[] {
  const end = addDays(fromDate, withinDays);
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);

  return charges
    .map((c) => {
      let next = parseFormattedDate(c.nextDate);
      // roll forward if next is in the past
      while (!isNaN(next.getTime()) && next < from) {
        next = addDays(next, c.intervalDays);
      }
      return {
        date: formatYmd(next),
        merchant: c.merchant,
        amount: c.amount,
      };
    })
    .filter((p) => {
      const d = parseFormattedDate(p.date);
      return !isNaN(d.getTime()) && d >= from && d <= end;
    })
    .sort((a, b) => parseFormattedDate(a.date).getTime() - parseFormattedDate(b.date).getTime());
}

// ─── Phase 6: Behavior ───

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function parseHour(timeStr: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.replace(':', '');
  if (cleaned.length >= 2 && /^\d+$/.test(cleaned.slice(0, 2))) {
    const h = parseInt(cleaned.slice(0, 2), 10);
    if (h >= 0 && h <= 23) return h;
  }
  return null;
}

export function computeBehaviorStats(
  records: RawRecord[],
  targetMonth: Date,
  scope?: HealthScopeOptions
): BehaviorStats {
  const rows = getIncomeExpenseRows(records, scope).filter(isExpense);
  const byWeekday = WEEKDAY_LABELS.map((label) => ({ label: `星期${label}`, amount: 0 }));
  const byMonthThird = [
    { label: '1–10 日', amount: 0 },
    { label: '11–20 日', amount: 0 },
    { label: '21–31 日', amount: 0 },
  ];
  const hourBuckets = [
    { label: '凌晨', amount: 0 }, // 0-5
    { label: '上午', amount: 0 }, // 6-11
    { label: '下午', amount: 0 }, // 12-17
    { label: '晚上', amount: 0 }, // 18-23
  ];
  let timedCount = 0;
  let largestTxn: BehaviorStats['largestTxn'] = null;
  const byDay: Record<string, number> = {};
  let txnCount = 0;
  let expenseSum = 0;

  for (const r of rows) {
    const d = recordDate(r);
    if (isNaN(d.getTime()) || !inMonth(d, targetMonth)) continue;
    const amt = expenseAbs(r);
    txnCount += 1;
    expenseSum += amt;

    byWeekday[d.getDay()].amount += amt;
    const day = d.getDate();
    if (day <= 10) byMonthThird[0].amount += amt;
    else if (day <= 20) byMonthThird[1].amount += amt;
    else byMonthThird[2].amount += amt;

    const hour = parseHour(r['時間'] || '');
    if (hour !== null) {
      timedCount += 1;
      if (hour < 6) hourBuckets[0].amount += amt;
      else if (hour < 12) hourBuckets[1].amount += amt;
      else if (hour < 18) hourBuckets[2].amount += amt;
      else hourBuckets[3].amount += amt;
    }

    const merchant = (r['商家'] || r['名稱'] || '未命名').trim() || '未命名';
    if (!largestTxn || amt > largestTxn.amount) {
      largestTxn = { amount: roundMoney(amt), merchant, date: formatYmd(d) };
    }

    const key = formatYmd(d);
    byDay[key] = (byDay[key] || 0) + amt;
  }

  let maxSpendDay: BehaviorStats['maxSpendDay'] = null;
  for (const [date, amount] of Object.entries(byDay)) {
    if (!maxSpendDay || amount > maxSpendDay.amount) {
      maxSpendDay = { date, amount: roundMoney(amount) };
    }
  }

  // Reliable time if at least 30% of txns have non-default variety (not all same hour)
  const nonZeroBuckets = hourBuckets.filter((b) => b.amount > 0).length;
  const hasReliableTime = timedCount >= 5 && nonZeroBuckets >= 2;

  const daysInMonth = monthEnd(targetMonth).getDate();
  // for current month use days elapsed
  const now = new Date();
  const daysElapsed =
    now.getFullYear() === targetMonth.getFullYear() && now.getMonth() === targetMonth.getMonth()
      ? Math.max(1, now.getDate())
      : daysInMonth;

  return {
    byWeekday: byWeekday.map((x) => ({ ...x, amount: roundMoney(x.amount) })),
    byMonthThird: byMonthThird.map((x) => ({ ...x, amount: roundMoney(x.amount) })),
    byHourBucket: hasReliableTime
      ? hourBuckets.map((x) => ({ ...x, amount: roundMoney(x.amount) }))
      : null,
    hasReliableTime,
    largestTxn,
    maxSpendDay,
    avgDaily: roundMoney(expenseSum / daysElapsed),
    avgTxn: txnCount ? roundMoney(expenseSum / txnCount) : 0,
    txnCount,
  };
}

// ─── Phase 7: Report + achievements ───

export function buildMonthlyReport(
  records: RawRecord[],
  targetMonth: Date,
  scope?: HealthScopeOptions
): MonthlyReport {
  const rows = getIncomeExpenseRows(records, scope);
  const curr = aggregateMonth(rows, targetMonth, DEFAULT_CONFIG, scope?.monthlyCache);
  const prev = aggregateMonth(rows, shiftMonth(targetMonth, -1), DEFAULT_CONFIG, scope?.monthlyCache);
  const net = curr.income - curr.expense;
  const prevNet = prev.income - prev.expense;
  const top = topCategory(curr.categoryTotals);

  return {
    monthKey: toMonthKey(targetMonth),
    income: curr.income,
    expense: curr.expense,
    net,
    incomeDeltaPct: pctChange(curr.income, prev.income),
    expenseDeltaPct: pctChange(curr.expense, prev.expense),
    netDeltaPct: pctChange(net, prevNet),
    topCategory: top.name,
    savingsRate: savingsRate(curr.income, curr.expense),
  };
}

export function evaluateAchievements(
  records: RawRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  budgets: BudgetRule[] = [],
  scope?: HealthScopeOptions
): Achievement[] {
  const rows = getIncomeExpenseRows(records, scope);
  const curr = aggregateMonth(rows, targetMonth, config, scope?.monthlyCache);
  const prev = aggregateMonth(rows, shiftMonth(targetMonth, -1), config, scope?.monthlyCache);
  const prev2 = aggregateMonth(rows, shiftMonth(targetMonth, -2), config, scope?.monthlyCache);
  const rate = savingsRate(curr.income, curr.expense);
  const net = curr.income - curr.expense;
  const prevNet = prev.income - prev.expense;
  const prev2Net = prev2.income - prev2.expense;

  const overBudget = budgets.some(
    (b) => b.monthlyLimit > 0 && (curr.categoryTotals[b.category] || 0) > b.monthlyLimit
  );

  const yearSavings = computeSavingsAnalysis(records, targetMonth, 12, scope);
  const isBestSavings =
    yearSavings.best !== null &&
    yearSavings.best.monthKey === toMonthKey(targetMonth) &&
    yearSavings.best.savingsRate !== null;

  return [
    {
      id: 'pos-cashflow-3m',
      title: '連續 3 個月正現金流',
      detail: '收入持續大於支出',
      unlocked: net > 0 && prevNet > 0 && prev2Net > 0,
    },
    {
      id: 'savings-30',
      title: '儲蓄率達 30%',
      detail: rate !== null ? `本月 ${rate.toFixed(1)}%` : '本月無足夠收入資料',
      unlocked: rate !== null && rate >= 30,
    },
    {
      id: 'no-overspend',
      title: '本月沒有超支',
      detail: budgets.length ? '所有預算類別皆未超限' : '尚未設定預算（視為未解鎖條件）',
      unlocked: budgets.length > 0 && !overBudget && curr.expense > 0,
    },
    {
      id: 'best-savings-year',
      title: '近一年最佳儲蓄月',
      detail: yearSavings.best
        ? `最佳：${yearSavings.best.monthKey}（${yearSavings.best.savingsRate?.toFixed(1)}%）`
        : '資料不足',
      unlocked: !!isBestSavings,
    },
  ];
}

/** 一站式：健檢頁需要的聚合結果 */
export function buildHealthDashboard(
  records: RawRecord[],
  targetMonth: Date,
  config: BudgetGlobalConfig = DEFAULT_CONFIG,
  budgets: BudgetRule[] = [],
  scope?: HealthScopeOptions
) {
  // 原始資料只轉換一次；各區塊直到 UI 實際讀取時才計算。
  const preparedRows = scope?.preparedRows ?? getIncomeExpenseRows(records);
  const scopedRows = applyHealthScope(preparedRows, {
    ...scope,
    preparedRows: undefined,
    monthlyCache: undefined,
    scopeApplied: false,
  });
  const monthlyCache = buildMonthlyAggregateCache(scopedRows, config);
  const preparedScope: HealthScopeOptions = {
    ...scope,
    basePreparedRows: preparedRows,
    preparedRows: scopedRows,
    scopeApplied: true,
    monthlyCache,
  };
  const lazy = <T>(factory: () => T) => {
    let initialized = false;
    let value: T;
    return () => {
      if (!initialized) {
        value = factory();
        initialized = true;
      }
      return value;
    };
  };

  const health = lazy(() => computeHealthScore(records, targetMonth, config, budgets, preparedScope));
  const cashflow = lazy(() => computeCashflowMonth(records, targetMonth, config, preparedScope));
  const cashFlowSplit = lazy(() => computeCashFlowSplitMonth(records, targetMonth, config, preparedScope));
  const cashflowSankey = lazy(() => computeCashflowSankey(records, targetMonth, config, preparedScope));
  const cashflowSankeyLanes = lazy(() => computeCashflowSankeyLanes(records, targetMonth, config, {
    ...scope,
    preparedRows: preparedRows,
    scopeApplied: false,
    monthlyCache: undefined,
  }));
  const cashflowYear = lazy(() => computeCashflowYear(records, targetMonth, config, 12, preparedScope));
  const structure = lazy(() => computeExpenseStructure(records, targetMonth, preparedScope));
  const savings = lazy(() => computeSavingsAnalysis(records, targetMonth, 12, preparedScope));
  const categories = lazy(() => listMainCategories(records, targetMonth, 12, preparedScope));
  const topByMonth = lazy(() => computeTopCategoryByMonth(records, targetMonth, 12, preparedScope));
  const insights = lazy(() => evaluateHealthRules(records, targetMonth, config, budgets, preparedScope));
  const recurring = lazy(() => detectRecurringCharges(records, preparedScope));
  const upcoming = lazy(() => getUpcomingPayments(recurring(), new Date()));
  const behavior = lazy(() => computeBehaviorStats(records, targetMonth, preparedScope));
  const report = lazy(() => buildMonthlyReport(records, targetMonth, preparedScope));
  const achievements = lazy(() => evaluateAchievements(records, targetMonth, config, budgets, preparedScope));
  const categoryTrends = lazy(() => categories().slice(0, 3).map((category) => ({
    category,
    points: computeCategoryTrend(records, category, targetMonth, 12, preparedScope),
  })));

  return {
    get health() { return health(); },
    get cashflow() { return cashflow(); },
    get cashFlowSplit() { return cashFlowSplit(); },
    get cashflowSankey() { return cashflowSankey(); },
    get cashflowSankeyPersonal() { return cashflowSankeyLanes().personal; },
    get cashflowSankeyShared() { return cashflowSankeyLanes().shared; },
    get cashflowYear() { return cashflowYear(); },
    get structure() { return structure(); },
    get savings() { return savings(); },
    get categories() { return categories(); },
    get categoryTrends() { return categoryTrends(); },
    get topByMonth() { return topByMonth(); },
    get insights() { return insights(); },
    get recurring() { return recurring(); },
    get upcoming() { return upcoming(); },
    get behavior() { return behavior(); },
    get report() { return report(); },
    get achievements() { return achievements(); },
  };
}
