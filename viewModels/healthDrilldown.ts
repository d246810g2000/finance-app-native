/**
 * 健檢鑽取：把分數／提醒／結構對應到可開 DetailModal 的交易列表。
 */
import type { BudgetGlobalConfig, BudgetRule, TransformedRecord } from '../types';
import { classifyCashFlowBucket } from '../services/cashFlowClassification';
import { getProjectGroup } from '../services/budgetService';
import {
  HEALTH_SCORE_WEIGHTS,
  type HealthInsight,
  type HealthScoreBreakdown,
  isHousingBurdenExpense,
  monthEnd,
  monthStart,
  toMonthKey,
} from '../services/financialHealthService';
import { parseFormattedDate } from '../utils/dateUtils';

export type HealthDrilldownResult = {
  title: string;
  subtitle: string;
  records: TransformedRecord[];
};

type ScoreKey = keyof HealthScoreBreakdown;

const SCORE_META: Record<ScoreKey, { label: string; hint: string }> = {
  livingSurplus: {
    label: '生活結餘',
    hint: '以生活收入−生活支出計算；≥20% 滿分。下列為本月生活支出。',
  },
  stability: {
    label: '支出波動',
    hint: '看近數月生活支出穩定性。下列為本月生活支出供對照。',
  },
  spendControl: {
    label: '預算暴衝',
    hint: '有預算看超支；無預算看相對近兩月暴衝。下列為相關支出。',
  },
  housingBurden: {
    label: '住房固定',
    hint: '房貸＋住家固定費佔生活收入。下列為本月住房／固定相關支出。',
  },
  investmentHabit: {
    label: '投資投入',
    hint: '投資支出佔生活收入的比例。下列為本月投資相關支出。',
  },
};

function recordDate(r: TransformedRecord): Date {
  return parseFormattedDate(String(r['日期'] || ''));
}

function inMonth(r: TransformedRecord, targetMonth: Date): boolean {
  const d = recordDate(r);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === targetMonth.getFullYear() && d.getMonth() === targetMonth.getMonth();
}

function isExpense(r: TransformedRecord): boolean {
  return r['記錄類型'] === '支出';
}

function isIncome(r: TransformedRecord): boolean {
  return r['記錄類型'] === '收入';
}

function cashBucket(r: TransformedRecord) {
  return classifyCashFlowBucket(r['記錄類型'], r['主類別'] || '', r['子類別'] || '');
}

function sortByAbsAmount(records: TransformedRecord[]): TransformedRecord[] {
  return [...records].sort((a, b) => Math.abs(b['金額'] || 0) - Math.abs(a['金額'] || 0));
}

function monthRows(rows: TransformedRecord[], targetMonth: Date): TransformedRecord[] {
  return rows.filter((r) => inMonth(r, targetMonth));
}

function livingExpenses(rows: TransformedRecord[]): TransformedRecord[] {
  return rows.filter((r) => isExpense(r) && cashBucket(r) === 'living');
}

function livingIncomes(rows: TransformedRecord[]): TransformedRecord[] {
  return rows.filter((r) => isIncome(r) && cashBucket(r) === 'living');
}

function investmentExpenses(rows: TransformedRecord[]): TransformedRecord[] {
  return rows.filter((r) => isExpense(r) && cashBucket(r) === 'investment');
}

function categoryExpenses(rows: TransformedRecord[], category: string): TransformedRecord[] {
  return rows.filter((r) => isExpense(r) && (r['主類別'] || '') === category);
}

function result(title: string, hint: string, records: TransformedRecord[]): HealthDrilldownResult {
  const sorted = sortByAbsAmount(records);
  return {
    title,
    subtitle: sorted.length ? `${hint} · ${sorted.length} 筆` : `${hint} · 尚無對應交易`,
    records: sorted,
  };
}

/** 分數五維 → 說明 + 相關交易 */
export function buildScoreDrilldown({
  scoreKey,
  score,
  rows,
  targetMonth,
  budgetConfig,
  budgets,
}: {
  scoreKey: ScoreKey;
  score: number;
  rows: TransformedRecord[];
  targetMonth: Date;
  budgetConfig: BudgetGlobalConfig;
  budgets: BudgetRule[];
}): HealthDrilldownResult {
  const meta = SCORE_META[scoreKey];
  const max = HEALTH_SCORE_WEIGHTS[scoreKey];
  const month = monthRows(rows, targetMonth);
  const title = `${meta.label} ${score}/${max}`;

  if (scoreKey === 'housingBurden') {
    return result(
      title,
      meta.hint,
      month.filter((r) => isExpense(r) && isHousingBurdenExpense(r, budgetConfig)),
    );
  }
  if (scoreKey === 'investmentHabit') {
    return result(title, meta.hint, investmentExpenses(month));
  }
  if (scoreKey === 'spendControl' && budgets.length > 0) {
    const overCats = budgets
      .filter((b) => {
        const spent = categoryExpenses(month, b.category).reduce((s, r) => s + Math.abs(r['金額'] || 0), 0);
        return b.monthlyLimit > 0 && spent > b.monthlyLimit;
      })
      .map((b) => b.category);
    if (overCats.length) {
      return result(
        title,
        meta.hint,
        month.filter((r) => isExpense(r) && overCats.includes(r['主類別'] || '')),
      );
    }
  }
  return result(title, meta.hint, livingExpenses(month));
}

/** 規則提醒 → 相關交易 */
export function buildInsightDrilldown({
  insight,
  rows,
  targetMonth,
  budgetConfig,
}: {
  insight: HealthInsight;
  rows: TransformedRecord[];
  targetMonth: Date;
  budgetConfig: BudgetGlobalConfig;
}): HealthDrilldownResult {
  const month = monthRows(rows, targetMonth);
  const id = insight.id;

  if (id.startsWith('cat-rise-')) {
    const cat = id.slice('cat-rise-'.length);
    return result(insight.title, '本月該類別支出', categoryExpenses(month, cat));
  }
  if (id.startsWith('over-budget-')) {
    const cat = id.slice('over-budget-'.length);
    return result(insight.title, '本月該類別支出', categoryExpenses(month, cat));
  }
  if (id === 'high-housing-burden') {
    return result(
      insight.title,
      '本月住房／固定負擔',
      month.filter((r) => isExpense(r) && isHousingBurdenExpense(r, budgetConfig)),
    );
  }
  if (id === 'low-investment-habit') {
    return result(insight.title, '本月投資支出', investmentExpenses(month));
  }
  if (id === 'low-living-surplus' || id === 'living-spend-spike') {
    return result(insight.title, '本月生活支出', livingExpenses(month));
  }
  if (id === 'low-savings' || id === 'expense-gt-income' || id === 'expense-no-income' || id === 'neg-cashflow-2m') {
    return result(insight.title, '本月支出', month.filter(isExpense));
  }
  if (id === 'fixed-up-20') {
    return result(
      insight.title,
      '本月固定支出專案',
      month.filter((r) => isExpense(r) && getProjectGroup(r['專案'] || '', budgetConfig) === 'fixed'),
    );
  }
  if (id.startsWith('merchant-freq-')) {
    const merchant = id.slice('merchant-freq-'.length);
    const weekEnd = monthEnd(targetMonth);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const records = month.filter((r) => {
      if (!isExpense(r)) return false;
      if ((r['商家'] || '').trim() !== merchant) return false;
      const d = recordDate(r);
      return !Number.isNaN(d.getTime()) && d >= weekStart && d <= weekEnd;
    });
    return result(insight.title, '近 7 天該商家', records);
  }

  return result(insight.title, insight.detail, month.filter(isExpense));
}

/** 支出結構類別 */
export function buildCategoryDrilldown({
  category,
  rows,
  targetMonth,
}: {
  category: string;
  rows: TransformedRecord[];
  targetMonth: Date;
}): HealthDrilldownResult {
  return result(
    `${category} 支出`,
    `${toMonthKey(targetMonth)} 明細`,
    categoryExpenses(monthRows(rows, targetMonth), category),
  );
}

/** 總覽 KPI */
export function buildKpiDrilldown({
  kind,
  rows,
  targetMonth,
}: {
  kind: 'income' | 'expense' | 'net';
  rows: TransformedRecord[];
  targetMonth: Date;
}): HealthDrilldownResult {
  const month = monthRows(rows, targetMonth);
  if (kind === 'income') {
    return result('收入明細', `${toMonthKey(targetMonth)}`, month.filter(isIncome));
  }
  if (kind === 'expense') {
    return result('支出明細', `${toMonthKey(targetMonth)}`, month.filter(isExpense));
  }
  return result('收支明細', `${toMonthKey(targetMonth)}`, month);
}

/** 固定扣款／即將付款：同商家本月（或當期）支出 */
export function buildMerchantMonthDrilldown({
  merchant,
  rows,
  targetMonth,
  title,
}: {
  merchant: string;
  rows: TransformedRecord[];
  targetMonth: Date;
  title?: string;
}): HealthDrilldownResult {
  const records = monthRows(rows, targetMonth).filter(
    (r) => isExpense(r) && (r['商家'] || '').trim() === merchant,
  );
  return result(title || merchant, `${toMonthKey(targetMonth)} 同商家`, records);
}

/** 生活／投資拆分列 */
export function buildCashFlowSplitDrilldown({
  kind,
  rows,
  targetMonth,
}: {
  kind:
    | 'livingIncome'
    | 'livingExpense'
    | 'investmentIncome'
    | 'investmentExpense';
  rows: TransformedRecord[];
  targetMonth: Date;
}): HealthDrilldownResult {
  const month = monthRows(rows, targetMonth);
  const labels = {
    livingIncome: '生活收入',
    livingExpense: '生活支出',
    investmentIncome: '投資收入',
    investmentExpense: '投資支出',
  } as const;
  if (kind === 'livingIncome') return result(labels[kind], toMonthKey(targetMonth), livingIncomes(month));
  if (kind === 'livingExpense') return result(labels[kind], toMonthKey(targetMonth), livingExpenses(month));
  if (kind === 'investmentIncome') {
    return result(
      labels[kind],
      toMonthKey(targetMonth),
      month.filter((r) => isIncome(r) && cashBucket(r) === 'investment'),
    );
  }
  return result(labels[kind], toMonthKey(targetMonth), investmentExpenses(month));
}

export { SCORE_META };
