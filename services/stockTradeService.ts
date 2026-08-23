import { RawRecord } from '../types';
import {
  ACCOUNT_CATEGORIES,
  PERSONAL_ACCOUNT_CATEGORIES,
  SHARED_ACCOUNT_CATEGORIES,
  SHARED_ACCOUNTS,
} from '../constants';

export type StockTradeSide = 'buy' | 'sell';
export type StockOwnership = 'personal' | 'shared';

export interface StockTrade {
  id: string;
  sourceId: string;
  date: string;
  side: StockTradeSide;
  name: string;
  symbol?: string;
  shares: number;
  purchasePrice?: number;
  costPrice?: number;
  salePrice?: number;
  amount: number;
  sourceAmount: number;
  account: string;
  ownership: StockOwnership;
  lineNumber: number;
  note: string;
}

export type StockNoteIssueReason =
  | 'missing_note'
  | 'missing_name'
  | 'missing_buy_price'
  | 'missing_sell_prices'
  | 'missing_shares'
  | 'unparsed_line'
  | 'amount_mismatch'
  | 'corporate_action';

export interface StockNoteIssue {
  id: string;
  sourceId: string;
  date: string;
  side: StockTradeSide | 'corporate_action';
  amount: number;
  account: string;
  note: string;
  reasons: StockNoteIssueReason[];
  expectedFormat: string;
}

export interface StockDataResult {
  trades: StockTrade[];
  issues: StockNoteIssue[];
}

export const SECURITIES_ACCOUNTS = ACCOUNT_CATEGORIES['證券戶'] || [];

/** Company trust contributions/matches have no tradable lot note and remain asset-account records. */
const NON_TRADE_SECURITIES_ACCOUNTS = new Set(['錼創信託']);

const CASH_ACCOUNTS = new Set([
  ...(PERSONAL_ACCOUNT_CATEGORIES['現金'] || []),
  ...(PERSONAL_ACCOUNT_CATEGORIES['銀行'] || []),
  ...(PERSONAL_ACCOUNT_CATEGORIES['儲值卡'] || []),
  ...(SHARED_ACCOUNT_CATEGORIES['現金'] || []),
  ...(SHARED_ACCOUNT_CATEGORIES['銀行'] || []),
  ...(SHARED_ACCOUNT_CATEGORIES['儲值卡'] || []),
]);

export const STOCK_NAME_ALIASES: Record<string, string> = {
  台積電: '2330',
  鴻海: '2317',
  聯發科: '2454',
  聯電: '2303',
  玉山金: '2884',
  兆豐金: '2886',
  長榮航: '2618',
  台達電: '2308',
  友達: '2409',
  群創: '3481',
  景碩: '3189',
  尖點: '8021',
};

const BUY_FORMAT = '鴻海 250 100股';
const SELL_FORMAT = '鴻海 240->255 100股';

interface ParsedStockLine {
  name: string;
  shares: number;
  purchasePrice?: number;
  costPrice?: number;
  salePrice?: number;
  lineNumber: number;
}

interface ParsedPrices {
  purchasePrice?: number;
  costPrice?: number;
  salePrice?: number;
}

interface ParsedRecord {
  trades?: StockTrade[];
  reasons: StockNoteIssueReason[];
}

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const QUANTITY_PATTERN = /(([一二兩三四五六七八九十百千]+)張|([0-9]+(?:\.[0-9]+)?)\s*(?:張|股|故))/i;

function chineseNumberToInteger(input: string): number | null {
  if (/^\d+$/.test(input)) return Number(input);

  let total = 0;
  let current = 0;

  for (const char of input) {
    if (char in CHINESE_DIGITS) {
      current = CHINESE_DIGITS[char];
      continue;
    }
    if (char === '十') {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    if (char === '百') {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    if (char === '千') {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    return null;
  }

  return total + current;
}

export function normalizeStockNoteLines(note: string): string[] {
  return String(note || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\s+n\s+/gi, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^發票號碼[:：]/.test(line) && !/^商家[:：]/.test(line));
}

function parseQuantity(line: string): { shares?: number } {
  const match = line.match(QUANTITY_PATTERN);
  if (!match) return {};

  const text = match[0].replace(/\s+/g, '');
  if (text.endsWith('張')) {
    const value = chineseNumberToInteger(text.slice(0, -1));
    return value && value > 0 ? { shares: value * 1000 } : {};
  }

  const value = Number(text.replace(/(股|故)$/i, ''));
  return Number.isFinite(value) && value > 0 ? { shares: value } : {};
}

function stripTradePrefix(line: string): string {
  return line.replace(/^(買入|賣出|買|賣)\s*[:：]?\s*/, '');
}

function parseName(line: string): string {
  const beforeNumber = stripTradePrefix(line).match(/^[^\d+>\-→]+/)?.[0] || '';
  return beforeNumber.replace(/[：:，,、|]/g, '').trim();
}

function parseSellPrices(line: string): { costPrice?: number; salePrice?: number } {
  const match = line.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:->|→|=>)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return {};

  const costPrice = Number(match[1]);
  const salePrice = Number(match[2]);
  if (!Number.isFinite(costPrice) || !Number.isFinite(salePrice)) return {};
  return { costPrice, salePrice };
}

function parseBuyPrice(line: string): { purchasePrice?: number } {
  const withoutQuantity = stripTradePrefix(line)
    .replace(QUANTITY_PATTERN, '')
    .replace(/賣出/g, '');
  const numbers = withoutQuantity.match(/[0-9]+(?:\.[0-9]+)?/g) || [];
  if (numbers.length !== 1) return {};

  const purchasePrice = Number(numbers[0]);
  return Number.isFinite(purchasePrice) ? { purchasePrice } : {};
}

function amountTolerance(amount: number): number {
  return Math.max(1, Math.abs(amount) * 0.005);
}

function getOwnership(account: string): StockOwnership {
  return SHARED_ACCOUNTS.includes(account) ? 'shared' : 'personal';
}

function getSourceId(record: RawRecord): string {
  return String(record.id || record.uid
    || `${record['日期']}-${record['收款(轉入)'] || record['付款(轉出)'] || ''}-${record['金額']}`);
}

function isSecuritiesAccount(account: string): boolean {
  return SECURITIES_ACCOUNTS.includes(account);
}

function isCashAccount(account: string): boolean {
  return CASH_ACCOUNTS.has(account);
}

function getTradeSide(record: RawRecord): StockTradeSide | null {
  const to = String(record['收款(轉入)'] || '').trim();
  const from = String(record['付款(轉出)'] || '').trim();
  if (NON_TRADE_SECURITIES_ACCOUNTS.has(to) || NON_TRADE_SECURITIES_ACCOUNTS.has(from)) return null;
  if (isCashAccount(from) && isSecuritiesAccount(to)) return 'buy';
  if (isSecuritiesAccount(from) && isCashAccount(to)) return 'sell';
  return null;
}

function getStockAccount(record: RawRecord, side: StockTradeSide): string {
  return String((side === 'buy' ? record['收款(轉入)'] : record['付款(轉出)']) || '').trim();
}

function makeIssue(
  record: RawRecord,
  side: StockTradeSide | 'corporate_action',
  reasons: StockNoteIssueReason[],
  note = '',
): StockNoteIssue {
  return {
    id: getSourceId(record),
    sourceId: getSourceId(record),
    date: String(record['日期'] || ''),
    side,
    amount: Number(record['金額'] || 0) || 0,
    account: side === 'corporate_action'
      ? String(record['收款(轉入)'] || '').trim()
      : getStockAccount(record, side as StockTradeSide),
    note,
    reasons: Array.from(new Set(reasons)),
    expectedFormat: side === 'sell' ? SELL_FORMAT : BUY_FORMAT,
  };
}

function parseRecordLines(
  record: RawRecord,
  side: StockTradeSide,
  lines: string[],
): ParsedRecord {
  const parsed: ParsedStockLine[] = [];
  const reasons = new Set<StockNoteIssueReason>();
  const sourceId = getSourceId(record);

  lines.forEach((line, index) => {
    const quantity = parseQuantity(line);
    const name = parseName(line);
    const prices: ParsedPrices = side === 'sell' ? parseSellPrices(line) : parseBuyPrice(line);

    if (!name || !/[\u4e00-\u9fffA-Za-z]/.test(name)) reasons.add('missing_name');
    if (!quantity.shares) reasons.add('missing_shares');
    if (side === 'buy' && !prices.purchasePrice) reasons.add('missing_buy_price');
    if (side === 'sell' && (!prices.costPrice || !prices.salePrice)) reasons.add('missing_sell_prices');

    if (!name || !quantity.shares) return;
    if (side === 'buy' && !prices.purchasePrice) return;
    if (side === 'sell' && (!prices.costPrice || !prices.salePrice)) return;

    parsed.push({
      name,
      shares: quantity.shares,
      purchasePrice: prices.purchasePrice,
      costPrice: prices.costPrice,
      salePrice: prices.salePrice,
      lineNumber: index + 1,
    });
  });

  if (parsed.length === 0 || parsed.length !== lines.length) {
    reasons.add('unparsed_line');
    return { reasons: Array.from(reasons) };
  }

  const expectedAmount = parsed.reduce((sum, item) => {
    const price = side === 'buy' ? item.purchasePrice : item.costPrice;
    return sum + (price || 0) * item.shares;
  }, 0);
  const sourceAmount = Number(record['金額'] || 0) || 0;
  if (Math.abs(expectedAmount - sourceAmount) > amountTolerance(sourceAmount)) {
    reasons.add('amount_mismatch');
    return { reasons: Array.from(reasons) };
  }

  const account = getStockAccount(record, side);
  const trades = parsed.map(item => ({
    id: `${sourceId}:${item.lineNumber}`,
    sourceId,
    date: String(record['日期'] || ''),
    side,
    name: item.name,
    symbol: STOCK_NAME_ALIASES[item.name],
    shares: item.shares,
    purchasePrice: item.purchasePrice,
    costPrice: item.costPrice,
    salePrice: item.salePrice,
    amount: (side === 'buy' ? item.purchasePrice || 0 : item.salePrice || 0) * item.shares,
    sourceAmount,
    account,
    ownership: getOwnership(account),
    lineNumber: item.lineNumber,
    note: String(record['備註'] || ''),
  }));

  return { trades, reasons: [] };
}

/** Derive tradable stock activity and an actionable note audit from AndroMoney records. */
export function deriveStockData(records: RawRecord[]): StockDataResult {
  const trades: StockTrade[] = [];
  const issues: StockNoteIssue[] = [];

  records.forEach(record => {
    if (String(record['分類'] || '') === 'SYSTEM') return;

    const side = getTradeSide(record);
    const note = String(record['備註'] || '');
    const lines = normalizeStockNoteLines(note);

    if (!side) {
      const isCorporateAction = String(record['子分類'] || '') === '公司配股'
        && isSecuritiesAccount(String(record['收款(轉入)'] || ''))
        && !NON_TRADE_SECURITIES_ACCOUNTS.has(String(record['收款(轉入)'] || ''));
      if (isCorporateAction) {
        issues.push(makeIssue(record, 'corporate_action', ['corporate_action'], note));
      }
      return;
    }

    if (lines.length === 0) {
      issues.push(makeIssue(record, side, ['missing_note']));
      return;
    }

    const parsed = parseRecordLines(record, side, lines);
    if (parsed.trades) {
      trades.push(...parsed.trades);
      return;
    }

    issues.push(makeIssue(record, side, parsed.reasons, lines.join('\n')));
  });

  return { trades, issues };
}
