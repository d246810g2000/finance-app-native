import type { RawRecord } from '../../types';
import {
  isPaidOnBehalfRecord,
  isSystemRecord,
  resolveExpenseSplitFactor,
  type AttributionOptions,
} from './attribution';
import {
  convertAmountToTwd,
  formatTime,
  getDateKey,
  isValidDate,
  normalizeDate,
} from './parsing';

export type TransactionKind = 'income' | 'expense' | 'transfer' | 'special' | 'unknown';

export interface NormalizedTransaction {
  id?: string;
  kind: TransactionKind;
  /** Positive amount after conversion to the app's reporting currency. */
  amountTwd: number;
  incomeAccount?: string;
  expenseAccount?: string;
  category: string;
  subcategory?: string;
  project?: string;
  date: Date | null;
  dateKey: string | null;
  splitFactor: number;
}

export type NormalizeTransactionOptions = AttributionOptions & { today?: Date };

export function normalizeTransaction(
  record: RawRecord,
  options: NormalizeTransactionOptions = {},
): NormalizedTransaction {
  const category = String(record['分類'] ?? record['主類別'] ?? '');
  const subcategory = record['子分類'];
  const project = record['專案'];
  const payAccount = record['付款(轉出)'];
  const receiveAccount = record['收款(轉入)'];
  const parsedDate = normalizeDate(record['日期']);
  const date = isValidDate(parsedDate) ? parsedDate : null;

  let kind: TransactionKind = 'unknown';
  if (payAccount && receiveAccount) kind = 'transfer';
  else if (payAccount) kind = 'expense';
  else if (receiveAccount) kind = 'income';

  if (isSystemRecord(record) || isPaidOnBehalfRecord(record)) kind = 'special';

  return {
    id: record.id,
    kind,
    amountTwd: Math.round(convertAmountToTwd(record['金額'], record['幣別'])),
    incomeAccount: receiveAccount || undefined,
    expenseAccount: payAccount || undefined,
    category,
    subcategory: subcategory || undefined,
    project: project || undefined,
    date,
    dateKey: date ? getDateKey(date) : null,
    splitFactor: resolveExpenseSplitFactor(project, payAccount, options),
  };
}

/** Stats-facing classification keeps one legacy exception: 小伊轉帳 remains income. */
export function classifyStatsKind(
  transaction: NormalizedTransaction,
  hasIncomeAccountInScope: boolean,
  hasExpenseAccountInScope: boolean,
): 'income' | 'expense' | null {
  if (transaction.kind === 'special') return null;
  if (transaction.kind !== 'transfer') {
    if (hasIncomeAccountInScope && !hasExpenseAccountInScope) return 'income';
    if (hasExpenseAccountInScope && !hasIncomeAccountInScope) return 'expense';
    return null;
  }

  if (!hasExpenseAccountInScope && hasIncomeAccountInScope && transaction.subcategory === '小伊轉帳') {
    return 'income';
  }
  return null;
}
