
import { RawRecord, TransformedRecord, AccountsSummaryMap, TrendDataPoint, BudgetGlobalConfig, CustomAccountMappings, ExpenseSpike } from '../types';
import { ACCOUNT_CATEGORIES, EXCHANGE_RATES } from '../constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import iconv from 'iconv-lite';
import { parseFormattedDate, zeroPadDate } from '../utils/dateUtils';
import {
  findUnmappedAccounts as findUnmappedAccountsCore,
  getCategoryForAccount as getCategoryForAccountCore,
  isPaidOnBehalfRecord,
  isSharedAccountName as isSharedAccountNameCore,
  resolveExpenseSplitFactor as resolveExpenseSplitFactorCore,
} from './core/attribution';
import { auditRecordsForImport, type RecordAuditFinding } from './recordAuditService';
import {
  convertAmountToTwd,
  endOfDay,
  getDateKey as getIsoDateKey,
  isValidDate,
  normalizeDate,
  parseAmount,
} from './core/parsing';
import {
  classifyStatsKind,
  normalizeTransaction,
} from './core/transactionNormalization';

export {
  ANDRO_MONEY_CSV_HEADERS,
  recordToAndroMoneyRow,
  serializeAndroMoneyCsv,
  shareAndroMoneyCsv,
} from './androMoneyCsvExport';
export type { AndroMoneyCsvHeader, SerializeAndroMoneyCsvOptions } from './androMoneyCsvExport';

export const getCategoryForAccount = getCategoryForAccountCore;

// 輔助函數：讀取檔案內容並解碼 (支援 Web 與 Native)
export const readFileContent = async (fileObjOrUri: unknown, encoding: string): Promise<string> => {
  try {
    // 判斷是否在 Web 環境 (直接傳入 File object)
    const isWebFile = typeof File !== 'undefined' && fileObjOrUri instanceof File;
    if (isWebFile) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (encoding === 'big5') {
            // Web 端的 FileReader 雖然可以 readAsText 指定編碼，但有時會失真，
            // 這裡使用 ArrayBuffer 來用 iconv-lite 解碼會比較穩定
            const buf = Buffer.from(result as ArrayBuffer);
            resolve(iconv.decode(buf, 'big5'));
          } else {
            // 若為 utf-8 或本身已經被 reader 解碼
            if (result instanceof ArrayBuffer) {
              const buf = Buffer.from(result);
              resolve(buf.toString('utf-8'));
            } else {
              resolve(result as string);
            }
          }
        };
        reader.onerror = (e) => reject(new Error('讀取檔案失敗'));

        if (encoding === 'big5') {
          reader.readAsArrayBuffer(fileObjOrUri);
        } else {
          reader.readAsText(fileObjOrUri, 'UTF-8');
        }
      });
    }

    // Native 環境，原本的處理邏輯
    const fileUri = typeof fileObjOrUri === 'string'
      ? fileObjOrUri
      : String((fileObjOrUri as { uri?: unknown } | null)?.uri ?? '');
    if (encoding === 'big5') {
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      const buf = Buffer.from(base64, 'base64');
      return iconv.decode(buf, 'big5');
    }

    const text = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8
    });
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    throw new Error(`無法讀取檔案或編碼不支援 (${encoding})：${message}`);
  }
};

// 輔助函數：解析 CSV 數據，處理引號並移除多餘空白
export const parseCsvData = (csvText: string): RawRecord[] => {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length < 3) {
    throw new Error('CSV 檔案的格式不符合預期 (至少需要 3 行數據，包含標題)。');
  }

  // 處理 CSV 行的正規表達式，正確解析帶引號的欄位
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseCsvLine(lines[1]);

  const rows = lines.slice(2).map(line => {
    const values = parseCsvLine(line);
    const rowObject: Record<string, string> = {};
    headers.forEach((header, index) => {
      // 移除引號與 BOM (Byte Order Mark)
      const cleanHeader = header.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').trim();
      const cleanValue = values[index] ? values[index].replace(/^"|"$/g, '').trim() : '';
      rowObject[cleanHeader] = cleanValue;
    });

    // 兼容性映射：AndroMoney 常用 '主類別'，程式碼常用 '分類'
    if (rowObject['主類別'] && !rowObject['分類']) {
      rowObject['分類'] = rowObject['主類別'];
    }

    // Prefer AndroMoney uid / Id as stable keys for incremental import
    const stableId = String(rowObject['uid'] || rowObject['Id'] || rowObject['id'] || '').trim();
    rowObject.id = stableId || (`gen_${Math.random().toString(36).slice(2, 11)}${Date.now().toString(36)}`);
    return rowObject as unknown as RawRecord;
  });

  return rows;
};

/** 正規化備註換行：真換行、\\n、以及 AndroMoney 常見的字面「 n 」 */
export const normalizeNoteLines = (notes: string): string[] => {
  if (!notes) return [];
  return notes
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\s+n\s+/gi, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
};

export type ImportReport = {
  totalRows: number;
  systemSkipped: number;
  importableRows: number;
  merchantFromField: number;
  merchantFromNotes: number;
  merchantFallback: number;
  merchantEmpty: number;
  unmappedAccounts: string[];
  uniqueProjects: number;
  dateMin: string | null;
  dateMax: string | null;
  /** 唯讀建議檢查（不會自動套用） */
  reviewHints: RecordAuditFinding[];
  reviewHintCounts: { high: number; medium: number; low: number; info: number };
};

/** 匯入前分析：略過筆數、商家抽取來源、未對應帳戶等 */
export const analyzeImport = (
  rawRecords: RawRecord[],
  customMappings: CustomAccountMappings = {}
): ImportReport => {
  let systemSkipped = 0;
  let merchantFromField = 0;
  let merchantFromNotes = 0;
  let merchantFallback = 0;
  let merchantEmpty = 0;
  const projects = new Set<string>();
  let dateMin: string | null = null;
  let dateMax: string | null = null;

  rawRecords.forEach((r) => {
    if (r['分類'] === 'SYSTEM' || r['主類別'] === 'SYSTEM') {
      systemSkipped += 1;
      return;
    }
    const date = (r['日期'] || '').toString();
    if (date.length >= 8) {
      if (!dateMin || date < dateMin) dateMin = date;
      if (!dateMax || date > dateMax) dateMax = date;
    }
    if (r['專案']) projects.add(r['專案']);

    const field = (r['商家(公司)'] || '').trim();
    if (field) {
      merchantFromField += 1;
      return;
    }
    const notes = r['備註'] || '';
    const lines = normalizeNoteLines(notes);
    const hasMerchantLine = lines.some((l) => l.startsWith('商家:') || l.startsWith('商家：'));
    if (hasMerchantLine || /商家[:：]/.test(notes)) {
      merchantFromNotes += 1;
      return;
    }
    const extracted = extractMerchantName(r);
    if (!extracted) merchantEmpty += 1;
    else merchantFallback += 1;
  });

  const reviewHints = auditRecordsForImport(rawRecords);
  const reviewHintCounts = { high: 0, medium: 0, low: 0, info: 0 };
  for (const h of reviewHints) {
    reviewHintCounts[h.severity] += 1;
  }

  return {
    totalRows: rawRecords.length,
    systemSkipped,
    importableRows: rawRecords.length - systemSkipped,
    merchantFromField,
    merchantFromNotes,
    merchantFallback,
    merchantEmpty,
    unmappedAccounts: findUnmappedAccounts(rawRecords, customMappings),
    uniqueProjects: projects.size,
    dateMin,
    dateMax,
    reviewHints,
    reviewHintCounts,
  };
};

export type UpsertResult = {
  records: RawRecord[];
  added: number;
  updated: number;
  kept: number;
  removed: number;
};

/** 依穩定 id（uid/Id）合併；CSV 有的更新／新增；syncDelete 時移除 CSV 沒有的本機列。
 * 更新同 id 時保留本機對帳欄位（isReconciled），除非 incoming 明確帶入。
 */
export const upsertRecordsById = (
  existing: RawRecord[],
  incoming: RawRecord[],
  options: { syncDelete?: boolean } = {}
): UpsertResult => {
  const { syncDelete = false } = options;
  const map = new Map<string, RawRecord>();
  existing.forEach((r) => {
    const id = String(r.id || '').trim();
    if (id) map.set(id, r);
  });

  const incomingIds = new Set<string>();
  let added = 0;
  let updated = 0;
  incoming.forEach((r) => {
    const id = String(r.id || '').trim();
    if (!id) {
      const gen = `gen_${Math.random().toString(36).slice(2, 11)}${Date.now().toString(36)}`;
      map.set(gen, { ...r, id: gen });
      incomingIds.add(gen);
      added += 1;
      return;
    }
    incomingIds.add(id);
    if (map.has(id)) {
      const prev = map.get(id)!;
      const merged: RawRecord = { ...r, id };
      // 本機對帳狀態優先：incoming 未帶時保留舊值
      if (r.isReconciled === undefined && prev.isReconciled !== undefined) {
        merged.isReconciled = prev.isReconciled;
      }
      // 清理已廢棄的延後入帳欄位
      delete merged.postponedToPeriod;
      map.set(id, merged);
      updated += 1;
    } else {
      map.set(id, { ...r, id });
      added += 1;
    }
  });

  let removed = 0;
  if (syncDelete) {
    for (const id of Array.from(map.keys())) {
      if (!incomingIds.has(id)) {
        map.delete(id);
        removed += 1;
      }
    }
  }

  const records = Array.from(map.values());
  const kept = syncDelete ? 0 : Math.max(0, records.length - added - updated);
  return { records, added, updated, kept, removed };
};

/** 縮短商家顯示名（去法人後綴／過長分店） */
export const shortenMerchantName = (name: string, maxLen = 18): string => {
  if (!name) return '';
  let s = name.trim();
  s = s
    .replace(/股份有限公司/g, '')
    .replace(/有限公司/g, '')
    .replace(/台灣分公司/g, '')
    .replace(/油品行銷事業部/g, '')
    .replace(/\s+/g, '')
    .trim();

  const gasStation = s.match(/(.+加油站)$/);
  if (gasStation && s.includes('中油')) {
    s = `中油${gasStation[1]}`;
  } else if (s.includes('統一超商')) {
    const branch = s.match(/統一超商.*?([^市縣區鄉鎮]{2,8}(?:分公司|門市|店))$/);
    s = branch ? `統一超商${branch[1]}` : '統一超商';
  } else if (s.includes('全家便利商店')) {
    const branch = s.match(/全家便利商店.*?([^市縣]{2,10}(?:分公司|店))$/);
    s = branch ? `全家${branch[1]}` : '全家';
  }

  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s || name.slice(0, maxLen);
};

export type MerchantAggregate = {
  name: string;
  shortName: string;
  total: number;
  count: number;
  avg: number;
};

export const aggregateMerchants = (
  rawRecords: RawRecord[],
  startDate: Date | null,
  endDate: Date | null
): MerchantAggregate[] => {
  const filtered = filterAndSortRecords(rawRecords, startDate, endDate);
  const map: { [name: string]: { total: number; count: number } } = {};

  filtered.forEach((row) => {
    const pay = row['付款(轉出)'];
    const recv = row['收款(轉入)'];
    const cat = row['分類'] || row['主類別'] || '';
    if (!pay || recv) return;
    if (cat === 'SYSTEM' || cat === '代付' || cat === '轉帳') return;

    const name = extractMerchantName(row);
    if (!name || name.startsWith('發票號碼')) return;
    // 略過純分類後備
    if (/^(餐飲食品|居家生活|運輸交通|休閒娛樂|人情交際|其他|費用|醫療保健|汽機車|理財投資)-/.test(name)) return;

    const amount = Math.abs(convertAmountToTwd(row['金額'], row['幣別']));

    if (!map[name]) map[name] = { total: 0, count: 0 };
    map[name].total += amount;
    map[name].count += 1;
  });

  return Object.entries(map)
    .map(([name, v]) => ({
      name,
      shortName: shortenMerchantName(name),
      total: Math.round(v.total),
      count: v.count,
      avg: Math.round(v.total / v.count),
    }))
    .sort((a, b) => b.total - a.total);
};

export type InvoiceProduct = {
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
};

export const parseInvoiceProducts = (notes: string): InvoiceProduct[] => {
  if (!notes) return [];
  const lines = normalizeNoteLines(notes);
  const products: InvoiceProduct[] = [];
  let afterMerchant = false;
  for (const line of lines) {
    if (line.startsWith('商家:') || line.startsWith('商家：')) {
      afterMerchant = true;
      continue;
    }
    if (line.startsWith('發票號碼:') || line.startsWith('發票號碼：')) {
      afterMerchant = false;
      continue;
    }
    if (!afterMerchant && !/\[NT\$/.test(line) && !/\sx\s/i.test(line)) continue;
    const regex = /(.*?)(?:\[NT\$(\-?\d+\.?\d*)\])?\s*x\s*(\d+\.?\d*)/i;
    const match = line.match(regex);
    if (!match) continue;
    const itemName = match[1].trim().replace(/^【.*?】/, '').trim();
    if (!itemName || itemName.length > 80) continue;
    const unitPrice = parseFloat(match[2]) || 0;
    const qty = parseFloat(match[3]) || 0;
    const lineTotal = Math.round(unitPrice * qty);
    if (lineTotal === 0 && unitPrice === 0) continue;
    products.push({ name: itemName, unitPrice, qty, lineTotal });
  }
  return products;
};

export type ProductAggregate = {
  name: string;
  total: number;
  count: number;
  avg: number;
};

export const aggregateInvoiceProducts = (
  rawRecords: RawRecord[],
  startDate: Date | null,
  endDate: Date | null
): ProductAggregate[] => {
  const filtered = filterAndSortRecords(rawRecords, startDate, endDate);
  const map: { [name: string]: { total: number; count: number } } = {};

  filtered.forEach((row) => {
    const pay = row['付款(轉出)'];
    const recv = row['收款(轉入)'];
    if (!pay || recv) return;
    const cat = row['分類'] || '';
    if (cat === 'SYSTEM' || cat === '轉帳' || cat === '代付') return;

    const products = parseInvoiceProducts(row['備註'] || '');
    products.forEach((p) => {
      // 外幣發票少見：品項金額已是發票幣列，此處用列金額比例不處理；以 lineTotal 為準
      // 若幣別非 TWD，用匯率換算品項
      let line = Math.abs(p.lineTotal);
      const currency = row['幣別'];
      if (currency && currency !== 'TWD' && EXCHANGE_RATES[currency]) {
        line *= EXCHANGE_RATES[currency];
      }
      if (!map[p.name]) map[p.name] = { total: 0, count: 0 };
      map[p.name].total += line;
      map[p.name].count += 1;
    });
  });

  return Object.entries(map)
    .map(([name, v]) => ({
      name,
      total: Math.round(v.total),
      count: v.count,
      avg: Math.round(v.total / v.count),
    }))
    .sort((a, b) => b.total - a.total);
};

/** 帳戶是否視為共享（含自訂對照） */
export const isSharedAccountName = (
  accountName: string,
  customMappings: CustomAccountMappings = {}
): boolean => {
  return isSharedAccountNameCore(accountName, customMappings);
};

/**
 * 支出分帳係數（最多 ×0.5 一次，避免專案＋共享帳戶疊加變成 0.25）
 * 優先：專案在 splitProjects；否則在 isSplitShared 時對共享付款帳戶分帳
 */
export const resolveExpenseSplitFactor = (
  project: string | undefined,
  payAccount: string | undefined,
  options: {
    splitProjects?: string[] | null;
    isSplitShared?: boolean;
    customMappings?: CustomAccountMappings;
  } = {}
): number => resolveExpenseSplitFactorCore(project, payAccount, options);

export type BurdenSplitSummary = {
  personalFull: number;
  sharedShare: number;
  sharedGross: number;
  personalCount: number;
  sharedCount: number;
};

/** 個人全額負擔 vs 共同相關（你的 50% 份額） */
export const summarizePersonalVsSharedBurden = (
  rawRecords: RawRecord[],
  startDate: Date | null,
  endDate: Date | null,
  options: {
    splitProjects?: string[];
    customMappings?: CustomAccountMappings;
  } = {}
): BurdenSplitSummary => {
  const { splitProjects = [], customMappings = {} } = options;
  const filtered = filterAndSortRecords(rawRecords, startDate, endDate);
  let personalFull = 0;
  let sharedShare = 0;
  let sharedGross = 0;
  let personalCount = 0;
  let sharedCount = 0;

  filtered.forEach((row) => {
    const pay = row['付款(轉出)'];
    const recv = row['收款(轉入)'];
    const cat = row['分類'] || row['主類別'] || '';
    if (!pay || recv) return;
    if (cat === 'SYSTEM' || cat === '代付' || cat === '轉帳') return;
    if (cat === '其他' && row['子分類'] === '代付') return;

    const amount = Math.abs(convertAmountToTwd(row['金額'], row['幣別']));

    const project = row['專案'] || '';
    const isSharedBurden =
      splitProjects.includes(project) || isSharedAccountName(pay, customMappings);

    if (isSharedBurden) {
      sharedGross += amount;
      sharedShare += amount * 0.5;
      sharedCount += 1;
    } else {
      personalFull += amount;
      personalCount += 1;
    }
  });

  return {
    personalFull: Math.round(personalFull),
    sharedShare: Math.round(sharedShare),
    sharedGross: Math.round(sharedGross),
    personalCount,
    sharedCount,
  };
};

export type ProjectLifecycle = {
  name: string;
  totalExpense: number;
  recordCount: number;
  firstDate: string;
  lastDate: string;
  monthSpan: number;
  monthlySpend: { month: string; amount: number }[];
};

const formatYmdDisplay = (ymd: string): string => {
  if (!ymd || ymd.length < 8) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
};

/** 大額／長期專案生命週期（全期間支出，不受列表日期篩選限制；不含未來日期） */
export const computeProjectLifecycles = (
  rawRecords: RawRecord[],
  excludeTravel = true
): ProjectLifecycle[] => {
  const buckets: {
    [name: string]: { expense: number; count: number; dates: string[]; byMonth: { [m: string]: number } };
  } = {};

  const now = new Date();
  const todayYmd =
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  rawRecords.forEach((row) => {
    const cat = row['分類'] || row['主類別'] || '';
    if (cat === 'SYSTEM' || cat === '代付' || cat === '轉帳') return;
    const pay = row['付款(轉出)'];
    const recv = row['收款(轉入)'];
    if (!pay || recv) return;
    const name = (row['專案'] || '').trim();
    if (!name) return;
    if (excludeTravel && /^\d{6}-/.test(name)) return;

    const date = (row['日期'] || '').toString();
    const ymd = date.replace(/\D/g, '').slice(0, 8);
    // 略過未來排程／預記帳
    if (ymd.length >= 8 && ymd > todayYmd) return;

    const amount = Math.abs(convertAmountToTwd(row['金額'], row['幣別']));

    if (!buckets[name]) buckets[name] = { expense: 0, count: 0, dates: [], byMonth: {} };
    buckets[name].expense += amount;
    buckets[name].count += 1;
    if (ymd.length >= 8) {
      buckets[name].dates.push(ymd);
      const monthKey = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
      buckets[name].byMonth[monthKey] = (buckets[name].byMonth[monthKey] || 0) + amount;
    }
  });

  return Object.entries(buckets)
    .map(([name, b]) => {
      const sortedDates = [...b.dates].sort();
      const first = sortedDates[0] || '';
      const last = sortedDates[sortedDates.length - 1] || '';
      let monthSpan = 1;
      if (first.length >= 6 && last.length >= 6) {
        const fy = parseInt(first.slice(0, 4), 10);
        const fm = parseInt(first.slice(4, 6), 10);
        const ly = parseInt(last.slice(0, 4), 10);
        const lm = parseInt(last.slice(4, 6), 10);
        monthSpan = Math.max(1, (ly - fy) * 12 + (lm - fm) + 1);
      }
      const monthlySpend = Object.entries(b.byMonth)
        .sort(([a], [c]) => a.localeCompare(c))
        .map(([month, amount]) => ({ month, amount: Math.round(amount) }));
      const totalExpense = Math.round(b.expense);
      return {
        name,
        totalExpense,
        recordCount: b.count,
        firstDate: formatYmdDisplay(first),
        lastDate: formatYmdDisplay(last),
        monthSpan,
        monthlySpend,
      };
    })
    .sort((a, b) => b.totalExpense - a.totalExpense);
};

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

export const formatProductDetailLine = (line: string): string => {
  const regex = /(.*?)(?:\[NT\$(\d+\.?\d*)\])?\s*x\s*(\d+\.?\d*)/;
  const match = line.match(regex);
  if (match) {
    const itemName = match[1].trim();
    const price = parseFloat(match[2]) || 0;
    const quantity = parseFloat(match[3]) || 0;
    const total = Math.round(price * quantity);
    return `${itemName} ($${Math.round(price)}) ✕ ${quantity} ＝ $${total}`;
  }
  return line.trim();
};

// NEW HELPER FUNCTION: Extracts merchant name from notes if available, otherwise returns raw field
export const extractMerchantName = (record: RawRecord): string => {
  const finalMerchant = record['商家(公司)'];
  const originalNotes = record['備註'] || '';

  // 1. Explicit merchant field (Highest priority)
  if (finalMerchant && finalMerchant.trim() !== '') {
    return finalMerchant.trim();
  }

  // 2. "商家:" / "商家：" in Notes（支援真換行、\\n、字面「 n 」）
  const noteLines = normalizeNoteLines(originalNotes);
  for (const line of noteLines) {
    if (line.startsWith('商家:')) {
      return line.substring('商家:'.length).trim();
    }
    if (line.startsWith('商家：')) {
      return line.substring('商家：'.length).trim();
    }
  }
  // 單行備註內嵌「商家:xxx」
  const inlineMatch = originalNotes.match(/商家[:：]\s*([^\n]+?)(?:\s+n\s+|$)/i);
  if (inlineMatch?.[1]) {
    return inlineMatch[1].replace(/\\n.*/s, '').trim();
  }

  // 3. Enhanced Extraction Logic from Notes (Payment Gateways, etc.)
  if (originalNotes.trim()) {
    const firstLine = (noteLines[0] || originalNotes.trim()).trim();

    // Strategy A: Check for Payment Gateway prefixes
    const paymentPrefixes = ['Line Pay', '街口', '台灣Pay', '悠遊付', '全支付', 'Uber Eats', 'Foodpanda', 'Uber'];
    for (const prefix of paymentPrefixes) {
      const regex = new RegExp(`^${prefix}[\\s-]*[:：\\-]?\\s*(.*)`, 'i');
      const match = firstLine.match(regex);
      if (match && match[1] && match[1].trim().length > 0) {
        return `${match[1].trim()} (${prefix})`;
      }
    }

    // Strategy B/C: short text-like note as merchant
    const isNumeric = /^\d+$/.test(firstLine);
    if (firstLine.length > 0 && firstLine.length < 20 && !isNumeric && !firstLine.startsWith('發票號碼')) {
      return firstLine;
    }
    if (firstLine.length >= 20 && firstLine.length <= 40 && !firstLine.startsWith('發票號碼')) {
      return firstLine;
    }
  }

  // 4. Fallback: Category - SubCategory
  const category = record['分類'] || record['主類別'];
  const subCategory = record['子分類'];
  if (category && category !== 'SYSTEM' && category.trim() !== '') {
    if (subCategory && subCategory.trim() !== '') {
      return `${category}-${subCategory}`;
    }
    return category;
  }

  return '';
};

export const transformRecord = (record: RawRecord): TransformedRecord[] | TransformedRecord | null => {
  if (record['分類'] === 'SYSTEM') return null;

  const amount = Math.round(convertAmountToTwd(record['金額'], record['幣別']));
  const incomeAccountName = record['收款(轉入)'] || '';
  const expenseAccountName = record['付款(轉出)'] || '';
  const originalDate = record['日期'] || '';
  const originalTimeStr = record['時間'] || '';
  const formattedTime = originalTimeStr.length >= 4 ? `${originalTimeStr.substring(0, 2)}:${originalTimeStr.substring(2, 4)}` : '09:00';
  const originalNotes = record['備註'];

  // Use the shared extraction logic
  const finalMerchant = extractMerchantName(record);

  let productDetailsRawLines: string[] = [];
  let otherNotesLines: string[] = [];

  const invoicePatternDetected = originalNotes && (originalNotes.includes('發票號碼:') || originalNotes.includes('發票號碼：'));
  if (invoicePatternDetected) {
    const noteLines = normalizeNoteLines(originalNotes);
    let parsingProductDetails = false;
    noteLines.forEach(line => {
      if (line.startsWith('商家:') || line.startsWith('商家：')) {
        parsingProductDetails = true;
      } else if (parsingProductDetails && !line.startsWith('發票號碼:') && !line.startsWith('發票號碼：')) {
        productDetailsRawLines.push(line);
      } else if (!line.startsWith('發票號碼:') && !line.startsWith('發票號碼：')) {
        otherNotesLines.push(line);
      }
    });
  } else if (originalNotes) {
    otherNotesLines.push(...normalizeNoteLines(originalNotes));
  }

  const formattedProductDetails = productDetailsRawLines.map(item => `◎ ${formatProductDetailLine(item)}`).join(' ');
  let finalDescriptionContent = otherNotesLines.filter(Boolean).join('\n').trim();
  if (formattedProductDetails) {
    finalDescriptionContent = finalDescriptionContent ? `${finalDescriptionContent}\n${formattedProductDetails}` : formattedProductDetails;
  }

  const formattedDate = zeroPadDate(originalDate);
  let recordType: TransformedRecord['記錄類型'] = '未知';
  if (incomeAccountName && !expenseAccountName) recordType = '收入';
  else if (expenseAccountName && !incomeAccountName) recordType = '支出';
  else if (incomeAccountName && expenseAccountName) recordType = '轉帳';

  const baseExportRecord: Omit<TransformedRecord, '帳戶' | '記錄類型' | '金額'> = {
    id: record.id,
    '幣種': 'TWD', '主類別': record['分類'] || record['主類別'] || '', '子類別': record['子分類'] || '',
    '手續費': 0, '折扣': 0, '名稱': '', '商家': finalMerchant ? finalMerchant.substring(0, 48) : '',
    '日期': formattedDate, '時間': formattedTime, '專案': record['專案'] || '', '描述': finalDescriptionContent,
    '標籤': '', '對象': '',
  };

  if (recordType === '收入' && incomeAccountName) return { ...baseExportRecord, '帳戶': incomeAccountName, '記錄類型': '收入', '金額': Math.abs(amount) };
  if (recordType === '支出' && expenseAccountName) return { ...baseExportRecord, '帳戶': expenseAccountName, '記錄類型': '支出', '金額': -Math.abs(amount) };
  if (recordType === '轉帳' && incomeAccountName && expenseAccountName) {
    return [
      { ...baseExportRecord, id: `${record.id}-out`, '帳戶': expenseAccountName, '記錄類型': '轉出', '主類別': '轉帳', '子類別': '轉帳', '金額': -Math.abs(amount) },
      { ...baseExportRecord, id: `${record.id}-in`, '帳戶': incomeAccountName, '記錄類型': '轉入', '主類別': '轉帳', '子類別': '轉帳', '金額': Math.abs(amount) },
    ];
  }
  return null;
};

export const transformRecordsForExport = (rawRecords: RawRecord[]): TransformedRecord[] => {
  return rawRecords.flatMap(record => {
    const transformed = transformRecord(record);
    return transformed ? (Array.isArray(transformed) ? transformed : [transformed]) : [];
  });
};

export const generateAndDownloadCsv = async (data: RawRecord[]): Promise<void> => {
  const exportColumnNames: (keyof TransformedRecord)[] = [
    '帳戶', '幣種', '記錄類型', '主類別', '子類別', '金額', '手續費', '折扣', '名稱', '商家', '日期', '時間', '專案', '描述', '標籤', '對象'
  ];
  let csvContent = exportColumnNames.join(',') + '\n';
  const transformedRecords = transformRecordsForExport(data);
  const csvDataRows = transformedRecords.map(row => {
    return exportColumnNames.map(header => {
      let value = row[header];
      if (value === undefined || value === null) value = '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  csvContent += csvDataRows.join('\n');

  try {
    const fileName = `exported_records_${new Date().getTime()}.csv`;
    const fileUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + fileName;

    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: 'utf8'
    });

    // Check availability and share
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: '匯出財務記錄'
      });
    } else {
      alert('此裝置不支援分享功能');
    }
  } catch (error) {
    console.error('Export error:', error);
    alert('匯出失敗');
  }
};

// Generates a concise summary string of the entire dataset for AI context
export const generateFinancialContext = (rawRecords: RawRecord[]): string => {
  if (rawRecords.length === 0) return "無數據";

  const transformed = transformRecordsForExport(rawRecords);
  let totalIncome = 0;
  let totalExpense = 0;
  const categoryExpenses: { [key: string]: number } = {};
  const merchantExpenses: { [key: string]: number } = {};
  const monthlyStats: { [key: string]: { income: number; expense: number } } = {};
  let minDate = '9999/99/99';
  let maxDate = '0000/00/00';

  transformed.forEach(r => {
    if (r['日期'] < minDate) minDate = r['日期'];
    if (r['日期'] > maxDate) maxDate = r['日期'];

    // Monthly Aggregation
    const monthKey = r['日期'].substring(0, 7); // YYYY/MM
    if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { income: 0, expense: 0 };

    if (r['記錄類型'] === '收入') {
      totalIncome += r['金額'];
      monthlyStats[monthKey].income += r['金額'];
    } else if (r['記錄類型'] === '支出') {
      const absAmount = Math.abs(r['金額']);
      totalExpense += absAmount;
      monthlyStats[monthKey].expense += absAmount;

      // Category Aggregation
      const cat = r['主類別'];
      categoryExpenses[cat] = (categoryExpenses[cat] || 0) + absAmount;

      // Merchant Aggregation
      const merch = r['商家'] || '未分類';
      merchantExpenses[merch] = (merchantExpenses[merch] || 0) + absAmount;
    }
  });

  const topCategories = Object.entries(categoryExpenses)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k, v]) => `${k}: $${Math.round(v)}`)
    .join(', ');

  const topMerchants = Object.entries(merchantExpenses)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k, v]) => `${k}: $${Math.round(v)}`)
    .join(', ');

  // Summarize last 6 months specifically
  const sortedMonths = Object.keys(monthlyStats).sort().slice(-6);
  const recentMonthsTrend = sortedMonths.map(m =>
    `${m} (收: $${Math.round(monthlyStats[m].income)}, 支: $${Math.round(monthlyStats[m].expense)})`
  ).join('\n');

  return `
    資料區間: ${minDate} 至 ${maxDate}
    總收入: $${Math.round(totalIncome)}
    總支出: $${Math.round(totalExpense)}
    淨資產變動: $${Math.round(totalIncome - totalExpense)}
    
    前五大支出類別:
    ${topCategories}
    
    前五大消費商家:
    ${topMerchants}
    
    近六個月收支趨勢:
    ${recentMonthsTrend}
  `;
};

// Calculate average monthly spending for a specific category over the last 3 complete months
export const getCategoryAverage = (
  records: RawRecord[],
  category: string,
  config: BudgetGlobalConfig
): number => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11

  // Start date: 1st day of 3 months ago
  // End date: Last day of previous month
  const endDate = new Date(currentYear, currentMonth, 0); // Last day of prev month
  const startDate = new Date(currentYear, currentMonth - 3, 1); // 1st day of 3 months ago

  let totalAmount = 0;

  // Convert Date to YYYYMMDD string for comparison
  const toYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  const startYMD = toYMD(startDate);
  const endYMD = toYMD(endDate);

  records.forEach(r => {
    // Date Check
    if (!r['日期'] || r['日期'] < startYMD || r['日期'] > endYMD) return;

    // Category Check
    if (r['分類'] !== category) return;

    // Expense Check
    if (!r['付款(轉出)'] || r['收款(轉入)'] || r['分類'] === 'SYSTEM' || r['分類'] === '代付' || (r['分類'] === '其他' && r['子分類'] === '代付')) return;

    // Project Check
    const project = r['專案'];
    // Filter Logic: Must be in includedProjects
    if (!config.includedProjects.includes(project || '')) return;

    // Amount
    let amount = Math.abs(convertAmountToTwd(r['金額'], r['幣別']));

    // Split Logic（專案分帳優先；否則共享帳戶；不疊加）
    amount *= resolveExpenseSplitFactor(project, r['付款(轉出)'], {
      splitProjects: config.splitProjects,
      isSplitShared: true,
      customMappings: {},
    });

    totalAmount += amount;
  });

  return Math.round(totalAmount / 3);
};

// 輔助函數：找出所有未在 constants 或 customMappings 中定義的帳戶名稱
export const findUnmappedAccounts = (
  rawRecords: RawRecord[],
  customMappings: CustomAccountMappings = {}
): string[] => {
  return findUnmappedAccountsCore(rawRecords, customMappings);
};

// 財務健檢：偵測異常消費 (Expense Spike Detection)
export const detectExpenseSpikes = (
  rawRecords: RawRecord[],
  startDate: Date,
  endDate: Date,
  accountFilter: string[] | null = null,
  isSplitShared: boolean = false,
  customMappings: CustomAccountMappings = {},
  projectFilter: string[] | null = null,
  splitProjects: string[] | null = null
): ExpenseSpike[] => {
  // 1. 計算本期天數 (L)
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24)) + 1;

  // 2. 定義歷史對照期：[startDate - L * 3, startDate - 1 day]
  const ONE_DAY_MS = 1000 * 60 * 60 * 24;
  const historyEndDate = new Date(startDate.getTime() - ONE_DAY_MS);
  historyEndDate.setHours(23, 59, 59, 999);
  const historyStartDate = new Date(startDate.getTime() - durationDays * 3 * ONE_DAY_MS);
  historyStartDate.setHours(0, 0, 0, 0);

  // 3. 統計本期各分類的支出
  const currentRecords = filterAndSortRecords(rawRecords, startDate, endDate);
  const currentSpentByCategory: { [cat: string]: number } = {};
  const currentCategoryRecordsMap: { [cat: string]: RawRecord[] } = {};

  const processExpenseRow = (row: RawRecord, targetMap: { [cat: string]: number }, collectMap?: { [cat: string]: RawRecord[] }) => {
    // 支出驗證邏輯：須有付款帳戶、無收款帳戶，且排除 SYSTEM、代付等
    if (!row['付款(轉出)'] || row['收款(轉入)'] || row['分類'] === 'SYSTEM' || row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) return;
    if (accountFilter && !accountFilter.includes(row['付款(轉出)'])) return;

    const project = row['專案'] || '';
    if (projectFilter && !projectFilter.includes(project)) return;

    const cat = row['分類'] || '未分類';
    let amount = Math.abs(convertAmountToTwd(row['金額'], row['幣別']));

    amount *= resolveExpenseSplitFactor(project, row['付款(轉出)'], {
      splitProjects,
      isSplitShared,
    });

    targetMap[cat] = (targetMap[cat] || 0) + amount;
    if (collectMap) {
      if (!collectMap[cat]) collectMap[cat] = [];
      collectMap[cat].push(row);
    }
  };

  currentRecords.forEach(row => processExpenseRow(row, currentSpentByCategory, currentCategoryRecordsMap));

  // 4. 統計歷史對照期各分類的支出
  const historyRecords = filterAndSortRecords(rawRecords, historyStartDate, historyEndDate);
  const historySpentByCategory: { [cat: string]: number } = {};
  historyRecords.forEach(row => processExpenseRow(row, historySpentByCategory));

  // 5. 進行異常比對
  const spikes: ExpenseSpike[] = [];

  Object.entries(currentSpentByCategory).forEach(([cat, currentSpent]) => {
    const historyTotal = historySpentByCategory[cat] || 0;
    const avgSpent = Math.round(historyTotal / 3);

    let ratio = 0;
    let status: ExpenseSpike['status'] | null = null;
    let difference = 0;

    if (avgSpent > 0) {
      ratio = currentSpent / avgSpent;
      difference = currentSpent - avgSpent;
      if (ratio >= 1.5) {
        status = 'red';
      } else if (ratio >= 1.3) {
        status = 'yellow';
      }
    } else if (currentSpent >= 1000) {
      // 歷史無消費，但本月新增支出 >= 1000
      status = 'new';
      ratio = Infinity;
      difference = currentSpent;
    }

    if (status) {
      // 找出本期該分類底下的所有交易，並轉為 TransformedRecord 格式
      const rawCatRecords = currentCategoryRecordsMap[cat] || [];
      const transformedRecords: TransformedRecord[] = rawCatRecords.flatMap(r => {
        const trans = transformRecord(r);
        if (!trans) return [];
        const tArr = Array.isArray(trans) ? trans : [trans];
        return tArr.map(t => {
          const project = r['專案'] || '';
          const factor = resolveExpenseSplitFactor(project, r['付款(轉出)'], {
            splitProjects,
            isSplitShared,
          });
          if (factor !== 1) {
            return {
              ...t,
              '金額': t['金額'] * factor,
              '專案': t['專案'] ? `${t['專案']} (50%)` : '(分帳 50%)'
            };
          }
          return t;
        });
      });

      // 依交易金額大小降序排序 (在 TransformedRecord 中支出為負數，所以取絕對值進行排序)
      const topTransactions = transformedRecords
        .sort((a, b) => Math.abs(b['金額']) - Math.abs(a['金額']))
        .slice(0, 5);

      spikes.push({
        category: cat,
        currentSpent: Math.round(currentSpent),
        avgSpent: Math.round(avgSpent),
        ratio: parseFloat(ratio.toFixed(2)),
        difference: Math.round(difference),
        status,
        topTransactions
      });
    }
  });

  // 依超額金額降序排序
  return spikes.sort((a, b) => b.difference - a.difference);
};
