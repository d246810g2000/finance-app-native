import { RawRecord } from '../types';
import { parseFormattedDate } from '../utils/dateUtils';
import { clampStatementDay, DEFAULT_STATEMENT_DAY } from './creditCardSettingsService';

export const CREDIT_CARD_PAYMENT_SUBCATEGORY = '信用卡繳款';

export type ReconSortOrder = 'asc' | 'desc'; // asc = 遠→近（預設）

export interface StatementPeriod {
  /** 結帳日所屬年月鍵，如 2025-07 */
  periodKey: string;
  start: Date;
  end: Date;
  statementDay: number;
}

export interface ReconMetrics {
  totalCount: number;
  totalAmount: number;
  reconciledCount: number;
  reconciledAmount: number;
  unreconciledCount: number;
  hasMismatch: boolean;
  isComplete: boolean;
}

const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const pad2 = (n: number) => String(n).padStart(2, '0');

export const formatPeriodKey = (year: number, monthIndex: number): string =>
  `${year}-${pad2(monthIndex + 1)}`;

export const parsePeriodKey = (key: string): { year: number; monthIndex: number } | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  return { year: parseInt(m[1], 10), monthIndex: parseInt(m[2], 10) - 1 };
};

/** 依結帳日與「結帳日所屬年月」算出週期起迄 */
export const getStatementPeriod = (
  closingYear: number,
  closingMonthIndex: number,
  statementDayInput: number = DEFAULT_STATEMENT_DAY
): StatementPeriod => {
  const statementDay = clampStatementDay(statementDayInput);
  const end = endOfDay(new Date(closingYear, closingMonthIndex, statementDay));
  const prevMonth = closingMonthIndex === 0
    ? { y: closingYear - 1, m: 11 }
    : { y: closingYear, m: closingMonthIndex - 1 };
  const startDay = statementDay + 1;
  const start = startOfDay(new Date(prevMonth.y, prevMonth.m, startDay));
  return {
    periodKey: formatPeriodKey(closingYear, closingMonthIndex),
    start,
    end,
    statementDay,
  };
};

/** 最近已結帳週期（結帳日 ≤ today） */
export const getLatestClosedPeriod = (
  today: Date = new Date(),
  statementDayInput: number = DEFAULT_STATEMENT_DAY
): StatementPeriod => {
  const statementDay = clampStatementDay(statementDayInput);
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  if (d >= statementDay) {
    return getStatementPeriod(y, m, statementDay);
  }
  const prev = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
  return getStatementPeriod(prev.y, prev.m, statementDay);
};

export const shiftStatementPeriod = (
  period: StatementPeriod,
  delta: number
): StatementPeriod => {
  const parsed = parsePeriodKey(period.periodKey);
  if (!parsed) return period;
  const d = new Date(parsed.year, parsed.monthIndex + delta, 1);
  return getStatementPeriod(d.getFullYear(), d.getMonth(), period.statementDay);
};

export const isCreditCardPaymentRecord = (r: RawRecord): boolean =>
  (r['子分類'] || '') === CREDIT_CARD_PAYMENT_SUBCATEGORY
  || (r['分類'] === '轉帳' && (r['備註'] || '').includes('信用卡繳款'));

/** 轉帳不是信用卡消費，不應進入對帳清單。 */
export const isTransferRecord = (r: RawRecord): boolean =>
  String(r['分類'] || '').trim() === '轉帳';

export const belongsToCard = (r: RawRecord, cardName: string): boolean =>
  r['付款(轉出)'] === cardName || r['收款(轉入)'] === cardName;

const getRecordDate = (r: RawRecord): Date => {
  if (r.parsedDate && !isNaN(r.parsedDate.getTime())) return r.parsedDate;
  return parseFormattedDate(String(r['日期'] || ''));
};

/** 是否應出現在此帳單週期列表（依交易日期） */
export const isInStatementPeriod = (r: RawRecord, period: StatementPeriod): boolean => {
  const date = getRecordDate(r);
  if (isNaN(date.getTime())) return false;
  const t = date.getTime();
  return t >= period.start.getTime() && t <= period.end.getTime();
};

export const filterStatementRecords = (
  records: RawRecord[],
  cardName: string,
  period: StatementPeriod,
  options: { excludePayments?: boolean } = {}
): RawRecord[] => {
  const { excludePayments = true } = options;
  return records.filter(r => {
    if (!belongsToCard(r, cardName)) return false;
    if (isTransferRecord(r)) return false;
    if (excludePayments && isCreditCardPaymentRecord(r)) return false;
    return isInStatementPeriod(r, period);
  });
};

export const resolveRecordCardName = (
  record: RawRecord,
  cardNames: string[]
): string | undefined =>
  cardNames.find(name => record['付款(轉出)'] === name)
  ?? cardNames.find(name => record['收款(轉入)'] === name);

/** 同一帳單群組共用同一個週期（共用結帳日） */
export const filterStatementGroupRecords = (
  records: RawRecord[],
  cardNames: string[],
  period: StatementPeriod,
  options: { excludePayments?: boolean } = {}
): RawRecord[] => {
  const { excludePayments = true } = options;
  return records.filter(record => {
    const cardName = resolveRecordCardName(record, cardNames);
    if (!cardName) return false;
    if (isTransferRecord(record)) return false;
    if (excludePayments && isCreditCardPaymentRecord(record)) return false;
    return isInStatementPeriod(record, period);
  });
};

/** 對該卡：支出（付款=卡）為正花費；退款／轉入為負 */
export const getRecordSpendAmount = (r: RawRecord, cardName: string): number => {
  const amount = Math.abs(parseFloat(String(r['金額'] || '0')) || 0);
  if (r['付款(轉出)'] === cardName && r['收款(轉入)'] !== cardName) {
    return amount;
  }
  if (r['收款(轉入)'] === cardName && r['付款(轉出)'] !== cardName) {
    return -amount;
  }
  if (r['付款(轉出)'] === cardName) return amount;
  if (r['收款(轉入)'] === cardName) return -amount;
  return 0;
};

const buildMetrics = (
  totalCount: number,
  totalAmount: number,
  reconciledCount: number,
  reconciledAmount: number
): ReconMetrics => {
  const unreconciledCount = totalCount - reconciledCount;
  const isComplete = totalCount > 0 && unreconciledCount === 0;
  return {
    totalCount,
    totalAmount: Math.round(totalAmount),
    reconciledCount,
    reconciledAmount: Math.round(reconciledAmount),
    unreconciledCount,
    hasMismatch: reconciledCount > 0
      && !isComplete
      && Math.round(totalAmount * 100) !== Math.round(reconciledAmount * 100),
    isComplete,
  };
};

export const computeReconMetrics = (
  statementRecords: RawRecord[],
  cardName: string
): ReconMetrics => {
  let totalAmount = 0;
  let reconciledAmount = 0;
  let reconciledCount = 0;
  for (const r of statementRecords) {
    const amt = getRecordSpendAmount(r, cardName);
    totalAmount += amt;
    if (r.isReconciled) {
      reconciledCount += 1;
      reconciledAmount += amt;
    }
  }
  return buildMetrics(
    statementRecords.length,
    totalAmount,
    reconciledCount,
    reconciledAmount
  );
};

export const computeGroupReconMetrics = (
  statementRecords: RawRecord[],
  cardNames: string[]
): ReconMetrics => {
  let totalAmount = 0;
  let reconciledAmount = 0;
  let reconciledCount = 0;

  for (const record of statementRecords) {
    const cardName = resolveRecordCardName(record, cardNames);
    if (!cardName) continue;
    const amount = getRecordSpendAmount(record, cardName);
    totalAmount += amount;
    if (record.isReconciled) {
      reconciledCount += 1;
      reconciledAmount += amount;
    }
  }

  return buildMetrics(
    statementRecords.length,
    totalAmount,
    reconciledCount,
    reconciledAmount
  );
};

export const sortStatementRecords = (
  records: RawRecord[],
  order: ReconSortOrder = 'asc'
): RawRecord[] => {
  const sorted = [...records].sort((a, b) => {
    const da = getRecordDate(a).getTime();
    const db = getRecordDate(b).getTime();
    if (da !== db) return da - db;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  return order === 'asc' ? sorted : sorted.reverse();
};

export const formatPeriodRangeLabel = (period: StatementPeriod): string => {
  const fmt = (d: Date) =>
    `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  return `${fmt(period.start)} – ${fmt(period.end)}`;
};
