import type { RawRecord } from '../../types';
import { extractMerchantName } from '../merchantParse';
import {
  convertAmountToTwd,
  getDateKey,
  isValidDate,
  normalizeDate,
} from './parsing';
import { normalizeTransaction, type TransactionKind } from './transactionNormalization';

export interface NormalizedRecord {
  raw: RawRecord;
  id: string;
  date: Date | null;
  dateTs: number | null;
  dateKey: string | null;
  monthKey: string | null;
  amountTwd: number;
  merchant: string;
  category: string;
  subcategory: string;
  account: string;
  incomeAccount: string;
  expenseAccount: string;
  project: string;
  transactionKind: TransactionKind;
  isSystem: boolean;
}

export interface RecordIndex {
  records: RawRecord[];
  normalized: NormalizedRecord[];
  sorted: NormalizedRecord[];
  byMonth: Map<string, NormalizedRecord[]>;
  byProject: Map<string, NormalizedRecord[]>;
  byAccount: Map<string, NormalizedRecord[]>;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeRecord(record: RawRecord): NormalizedRecord {
  const date = normalizeDate(record['日期']);
  const validDate = isValidDate(date) ? date : null;
  const transaction = normalizeTransaction(record);
  const incomeAccount = text(record['收款(轉入)']);
  const expenseAccount = text(record['付款(轉出)']);

  return {
    raw: record,
    id: text(record.id),
    date: validDate,
    dateTs: validDate ? validDate.getTime() : null,
    dateKey: validDate ? getDateKey(validDate) : null,
    monthKey: validDate ? monthKey(validDate) : null,
    amountTwd: convertAmountToTwd(record['金額'], record['幣別']),
    merchant: extractMerchantName(record),
    category: text(record['分類'] || record['主類別']),
    subcategory: text(record['子分類']),
    account: expenseAccount || incomeAccount,
    incomeAccount,
    expenseAccount,
    project: text(record['專案']),
    transactionKind: transaction.kind,
    isSystem: transaction.kind === 'special' && text(record['分類'] || record['主類別']) === 'SYSTEM',
  };
}

export function buildRecordIndex(records: RawRecord[]): RecordIndex {
  const normalized = records.map(normalizeRecord);
  const sorted = normalized
    .filter(record => record.dateTs !== null)
    .sort((left, right) => (left.dateTs || 0) - (right.dateTs || 0));
  const byMonth = new Map<string, NormalizedRecord[]>();
  const byProject = new Map<string, NormalizedRecord[]>();
  const byAccount = new Map<string, NormalizedRecord[]>();

  for (const record of normalized) {
    if (record.monthKey) {
      const monthRows = byMonth.get(record.monthKey) || [];
      monthRows.push(record);
      byMonth.set(record.monthKey, monthRows);
    }
    if (record.project) {
      const projectRows = byProject.get(record.project) || [];
      projectRows.push(record);
      byProject.set(record.project, projectRows);
    }
    for (const account of new Set([record.incomeAccount, record.expenseAccount])) {
      if (!account) continue;
      const accountRows = byAccount.get(account) || [];
      accountRows.push(record);
      byAccount.set(account, accountRows);
    }
  }

  return { records, normalized, sorted, byMonth, byProject, byAccount };
}

export function selectRecordsByPeriod(
  index: RecordIndex,
  startDate: Date | null,
  endDate: Date | null,
): NormalizedRecord[] {
  const start = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : Number.NEGATIVE_INFINITY;
  const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Number.POSITIVE_INFINITY;
  return index.sorted.filter(record => (
    record.dateTs !== null && record.dateTs >= start && record.dateTs <= end
  ));
}

export function selectMonthRecords(index: RecordIndex, targetMonth: Date): NormalizedRecord[] {
  return index.byMonth.get(monthKey(targetMonth)) || [];
}

