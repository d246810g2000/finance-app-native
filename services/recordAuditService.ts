/**
 * 唯讀記帳稽核：只產出建議，不修改 RawRecord。
 * 保守原則：不批次建議改利息/回饋專案、不偵測旅遊漏標。
 * 專案採用時間線見 .cursor/skills/andro-money-projects/SKILL.md
 */
import { extractMerchantName } from './financeService';
import {
  canSuggestProject,
  isProjectAdoptedBy,
  PROJECT_ADOPTION_FROM_YMD,
  PROJECT_GONGTONG_FROM_YMD,
  PROJECT_ZHUJIA_FROM_YMD,
} from './projectAdoptionDates';
import { PROJECT_DEFINITION_BY_NAME, ProjectDefinition } from './projectDefinitions';
import type { RawRecord } from '../types';

export {
  PROJECT_ADOPTION_FROM_YMD,
  PROJECT_GONGTONG_FROM_YMD,
  PROJECT_ZHUJIA_FROM_YMD,
  canSuggestProject,
  isProjectAdoptedBy,
  projectAdoptedFromYmd,
} from './projectAdoptionDates';

export type AuditSeverity = 'high' | 'medium' | 'low' | 'info';
export type AuditKind =
  | 'wrong_project'
  | 'suspicious_category'
  | 'empty_note'
  | 'unclear_note'
  | 'category_mismatch'
  | 'transfer_with_project'
  | 'empty_project'
  | 'daifu_unpaired'
  | 'info';

export type RecordAuditFinding = {
  id: string;
  severity: AuditSeverity;
  kind: AuditKind;
  recordId: string;
  date: string;
  amount: number;
  category: string;
  sub: string;
  project: string;
  pay: string;
  recv: string;
  merchant: string;
  notes: string;
  suggestProject: string | null;
  suggestCategory: string | null;
  suggestSub: string | null;
  reason: string;
  /** 改此欄是否影響帳戶餘額 */
  affectsBalance: boolean;
};

export type RecordAuditSummary = {
  totalRecords: number;
  findings: RecordAuditFinding[];
  byKind: Record<string, number>;
  bySeverity: Record<AuditSeverity, number>;
  hints: string[];
};

export type RecordAuditOptions = {
  /** YYYYMMDD，預設不過濾 */
  fromYmd?: string;
  /** 最多回傳筆數（依 severity 排序後截斷） */
  limit?: number;
};

function twdAmount(r: RawRecord): number {
  const raw = String(r['金額'] || '').replace(/[,￥$€£]/g, '').trim();
  return Math.abs(parseFloat(raw) || 0);
}

function ymd(r: RawRecord): string {
  return String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
}

function cat(r: RawRecord): string {
  return String(r['分類'] || r['主類別'] || '').trim();
}

function sub(r: RawRecord): string {
  return String(r['子分類'] || '').trim();
}

function project(r: RawRecord): string {
  return String(r['專案'] || '').trim();
}

function notes(r: RawRecord): string {
  return String(r['備註'] || '').trim();
}

function recordId(r: RawRecord): string {
  return String(r.id || r['Id'] || r.uid || r['uid'] || '').trim();
}

export function isSystemRecord(r: RawRecord): boolean {
  return cat(r) === 'SYSTEM';
}

export function isTransferRecord(r: RawRecord): boolean {
  return cat(r) === '轉帳' || Boolean(r['付款(轉出)'] && r['收款(轉入)']);
}

export function isPaidOnBehalfRecord(r: RawRecord): boolean {
  return cat(r) === '代付' || (cat(r) === '其他' && sub(r) === '代付');
}

export function isExpenseRecord(r: RawRecord): boolean {
  if (isSystemRecord(r) || isTransferRecord(r) || isPaidOnBehalfRecord(r)) return false;
  return Boolean(r['付款(轉出)'] && !r['收款(轉入)']);
}

export function isIncomeRecord(r: RawRecord): boolean {
  if (isSystemRecord(r) || isTransferRecord(r)) return false;
  return Boolean(r['收款(轉入)'] && !r['付款(轉出)']);
}

function isCategoryFallbackMerchant(merchant: string): boolean {
  return /^(餐飲食品|居家生活|運輸交通|休閒娛樂|人情交際|汽機車|其他|費用|理財投資|投資收入)-/.test(merchant);
}

function noteClarity(notesText: string, merchant: string): 'empty' | 'unclear' | 'ok' {
  const n = notesText.replace(/\s+/g, ' ').trim();
  const realMerchant = merchant && !isCategoryFallbackMerchant(merchant) ? merchant : '';
  if (!n && !realMerchant) return 'empty';

  const useful = n
    .replace(/發票號碼[:：]\S+/g, '')
    .replace(/商家[:：][^\n]+/g, '')
    .replace(/\[NT\$[^\]]+\]/g, '')
    .replace(/x\s*[\d.]+/gi, '')
    .replace(/\bn\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^(晚點再記|忘記了|補記|xxx+|？+\s*|待補)$/i.test(useful)) return 'unclear';
  if (!useful) return realMerchant ? 'ok' : isCategoryFallbackMerchant(merchant) ? 'unclear' : 'empty';
  return useful.length >= 2 ? 'ok' : realMerchant ? 'ok' : 'unclear';
}

function baseFinding(
  r: RawRecord,
  partial: Omit<RecordAuditFinding, 'recordId' | 'date' | 'amount' | 'category' | 'sub' | 'project' | 'pay' | 'recv' | 'merchant' | 'notes' | 'affectsBalance' | 'suggestCategory' | 'suggestSub'> & {
    suggestCategory?: string | null;
    suggestSub?: string | null;
  },
): RecordAuditFinding {
  const merchant = extractMerchantName(r) || '';
  return {
    recordId: recordId(r),
    date: ymd(r),
    amount: Math.round(twdAmount(r)),
    category: cat(r),
    sub: sub(r),
    project: project(r),
    pay: String(r['付款(轉出)'] || ''),
    recv: String(r['收款(轉入)'] || ''),
    merchant,
    notes: notes(r).slice(0, 120),
    affectsBalance: false,
    suggestCategory: partial.suggestCategory ?? null,
    suggestSub: partial.suggestSub ?? null,
    ...partial,
  };
}

/** 與 projectAttribution 對齊的專案規則（精簡版）；尊重專案採用時間線，不 retroactive 建議 */
function ruleBasedSuggest(
  dateYmd: string,
  proj: string,
  c: string,
  s: string,
  text: string,
): { suggestProject: string; reason: string; severity: AuditSeverity } | null {
  if (proj === '正常開銷') {
    const personalVehicleTax = /燃料稅|牌照稅|個人燃料/.test(text);
    if (
      canSuggestProject(dateYmd, '住家支出') &&
      !personalVehicleTax &&
      (/管理費|電費|水費|瓦斯|網路費/.test(s) ||
        (/繳稅/.test(s) && /房屋稅|地價稅|管理費|電費|水費|瓦斯|網路/.test(text)))
    ) {
      return { suggestProject: '住家支出', reason: '住家固定費', severity: 'medium' };
    }
    if (canSuggestProject(dateYmd, '房屋購置') && /頭期|房貸/.test(text)) {
      return { suggestProject: '房屋購置', reason: '購屋資本', severity: 'medium' };
    }
    if (canSuggestProject(dateYmd, '裝潢家具') && /裝修|裝潢|家具|沙發|床墊/.test(text)) {
      return { suggestProject: '裝潢家具', reason: '裝潢／家具', severity: 'medium' };
    }
  }

  if (proj === '共同開銷' && isProjectAdoptedBy('共同開銷', dateYmd)) {
    if (/孝養父母/.test(s)) {
      return { suggestProject: '正常開銷', reason: '孝親偏個人', severity: 'low' };
    }
    if (
      canSuggestProject(dateYmd, '住家支出') &&
      /房屋支出|管理費|繳稅|網路費|電費|水費|瓦斯/.test(`${c}/${s}`)
    ) {
      return { suggestProject: '住家支出', reason: '住家固定費不應進共同日常', severity: 'medium' };
    }
  }

  return null;
}

/** 正常開銷 + 住家子分類：採用專案前不報 suspicious */
function shouldSkipSuspiciousCategory(dateYmd: string, proj: string, c: string, s: string): boolean {
  if (proj !== '正常開銷') return false;
  const combo = `${c}/${s}`;
  if (/電費|水費|瓦斯|管理費|網路費/.test(s) && !canSuggestProject(dateYmd, '住家支出')) {
    return true;
  }
  if (/房屋支出/.test(combo) && !canSuggestProject(dateYmd, '裝潢家具')) {
    return true;
  }
  return false;
}

function scanKnownCategoryMismatch(r: RawRecord): RecordAuditFinding | null {
  const c = cat(r);
  const s = sub(r);
  const note = notes(r);

  if (s === '停車費' && /茶行|紅茶|飲料|珍奶|咖啡/.test(note)) {
    return baseFinding(r, {
      id: `cat-mismatch-${recordId(r)}`,
      severity: 'high',
      kind: 'category_mismatch',
      suggestProject: null,
      suggestCategory: '餐飲食品',
      suggestSub: '飲料',
      reason: '備註為飲料店，不應歸停車費',
    });
  }

  if (s === '跑去哪了') {
    return baseFinding(r, {
      id: `unclear-sub-${recordId(r)}`,
      severity: 'medium',
      kind: 'unclear_note',
      suggestProject: null,
      suggestCategory: '其他',
      suggestSub: '雜支',
      reason: '子分類「跑去哪了」語意不清，建議補備註或改雜支',
    });
  }

  if (c === '居家生活' && s === '房屋支出' && project(r) === '正常開銷') {
    const d = ymd(r);
    if (canSuggestProject(d, '裝潢家具')) {
      return baseFinding(r, {
        id: `proj-mismatch-${recordId(r)}`,
        severity: 'medium',
        kind: 'wrong_project',
        suggestProject: '裝潢家具',
        reason: '房屋支出不應掛正常開銷，可能是裝潢或購屋',
      });
    }
    if (canSuggestProject(d, '房屋購置') && /房貸|頭期/.test(note)) {
      return baseFinding(r, {
        id: `proj-mismatch-${recordId(r)}`,
        severity: 'medium',
        kind: 'wrong_project',
        suggestProject: '房屋購置',
        reason: '房屋支出不應掛正常開銷，可能是購屋',
      });
    }
  }

  return null;
}

function scanProjectRecord(r: RawRecord, def: ProjectDefinition | undefined): RecordAuditFinding[] {
  if (!isExpenseRecord(r)) return [];
  const proj = project(r);
  if (!proj || !def) return [];

  const c = cat(r);
  const s = sub(r);
  const merchant = extractMerchantName(r) || '';
  const text = [c, s, merchant, notes(r)].filter(Boolean).join(' ');
  const out: RecordAuditFinding[] = [];

  const ruled = ruleBasedSuggest(ymd(r), proj, c, s, text);
  if (ruled) {
    out.push(
      baseFinding(r, {
        id: `wrong-proj-${recordId(r)}`,
        severity: ruled.severity,
        kind: 'wrong_project',
        suggestProject: ruled.suggestProject,
        reason: ruled.reason,
      }),
    );
  } else if (
    !shouldSkipSuspiciousCategory(ymd(r), proj, c, s) &&
    def.suspiciousCategoryHints.some((re) => re.test(`${c}/${s}`) || re.test(s))
  ) {
    out.push(
      baseFinding(r, {
        id: `suspicious-cat-${recordId(r)}`,
        severity: 'low',
        kind: 'suspicious_category',
        suggestProject: null,
        reason: `分類「${c}/${s}」可能不太符合「${proj}」，請人工確認`,
      }),
    );
  }

  const clarity = noteClarity(notes(r), merchant);
  const amount = twdAmount(r);
  const needNote = amount >= 3000 || ['裝潢家具', '房屋購置', '婚禮寶典'].includes(proj);
  if (clarity === 'empty' && needNote) {
    out.push(
      baseFinding(r, {
        id: `empty-note-${recordId(r)}`,
        severity: amount >= 10000 ? 'medium' : 'low',
        kind: 'empty_note',
        suggestProject: null,
        reason: '大額支出無備註，建議補上用途（不影響餘額）',
      }),
    );
  }

  return out;
}

function detectDaifuUnpaired(records: RawRecord[]): RecordAuditFinding[] {
  const incomeKeys = new Set<string>();
  const expenseKeys = new Set<string>();

  for (const r of records) {
    if (isSystemRecord(r)) continue;
    const key = `${ymd(r)}|${Math.round(twdAmount(r))}`;
    if (cat(r) === '代付') incomeKeys.add(key);
    if (cat(r) === '其他' && sub(r) === '代付') expenseKeys.add(key);
  }

  const findings: RecordAuditFinding[] = [];
  for (const r of records) {
    if (isSystemRecord(r)) continue;
    const key = `${ymd(r)}|${Math.round(twdAmount(r))}`;
    const isIncomeSide = cat(r) === '代付';
    const isExpenseSide = cat(r) === '其他' && sub(r) === '代付';
    if (!isIncomeSide && !isExpenseSide) continue;

    const paired = isIncomeSide ? expenseKeys.has(key) : incomeKeys.has(key);
    if (!paired) {
      findings.push(
        baseFinding(r, {
          id: `daifu-${recordId(r)}`,
          severity: 'low',
          kind: 'daifu_unpaired',
          suggestProject: null,
          reason: '代付收支可能缺配對列，請人工對帳（不影響總資產）',
        }),
      );
    }
  }
  return findings;
}

const SEVERITY_RANK: Record<AuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

export function auditRecords(
  records: RawRecord[],
  options: RecordAuditOptions = {},
): RecordAuditSummary {
  const { fromYmd, limit = 200 } = options;
  const findings: RecordAuditFinding[] = [];
  let transferWithProject = 0;
  let expenseWithoutProject = 0;

  for (const r of records) {
    if (isSystemRecord(r)) continue;
    const date = ymd(r);
    if (fromYmd && date.length >= 8 && date < fromYmd) continue;

    const mismatch = scanKnownCategoryMismatch(r);
    if (mismatch) findings.push(mismatch);

    if (isTransferRecord(r) && project(r)) {
      transferWithProject += 1;
      if (findings.filter((f) => f.kind === 'transfer_with_project').length < 5) {
        findings.push(
          baseFinding(r, {
            id: `transfer-proj-${recordId(r)}`,
            severity: 'info',
            kind: 'transfer_with_project',
            suggestProject: null,
            reason: '轉帳通常不需專案標籤（不影響總資產；歷史資料可不急著改）',
          }),
        );
      }
    }

    if (isExpenseRecord(r) && !project(r)) {
      expenseWithoutProject += 1;
    }

    const def = PROJECT_DEFINITION_BY_NAME[project(r)];
    findings.push(...scanProjectRecord(r, def));
  }

  findings.push(...detectDaifuUnpaired(records));

  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    const key = `${f.recordId}|${f.kind}|${f.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const byKind: Record<string, number> = {};
  const bySeverity: Record<AuditSeverity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of deduped) {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
    bySeverity[f.severity] += 1;
  }

  const hints = [
    `轉帳帶專案：${transferWithProject} 筆（info，不影響總資產）`,
    `支出無專案：${expenseWithoutProject} 筆（只影響分帳報表）`,
    '利息/回饋標正常開銷：合理，不列入修正',
    '通勤高鐵標正常開銷：合理，不建議改旅遊專案',
  ];

  return {
    totalRecords: records.length,
    findings: deduped.slice(0, limit),
    byKind,
    bySeverity,
    hints,
  };
}

/** 匯入預覽用：只取 high/medium，最多 20 筆 */
export function auditRecordsForImport(records: RawRecord[]): RecordAuditFinding[] {
  const summary = auditRecords(records, { limit: 50 });
  return summary.findings.filter((f) => f.severity === 'high' || f.severity === 'medium').slice(0, 20);
}

export type SingleRecordFix = {
  recordId: string;
  field: '分類' | '子分類' | '專案' | '備註' | '商家(公司)';
  newValue: string;
};

export type SingleRecordFixPreview = {
  record: RawRecord;
  before: Partial<RawRecord>;
  after: Partial<RawRecord>;
  affectsBalance: boolean;
  warnings: string[];
};

const SAFE_FIELDS = new Set(['分類', '子分類', '專案', '備註', '商家(公司)']);

export function previewSingleRecordFix(
  records: RawRecord[],
  fix: SingleRecordFix,
): SingleRecordFixPreview | null {
  const target = records.find(
    (r) => recordId(r) === fix.recordId || String(r['Id']) === fix.recordId,
  );
  if (!target) return null;

  if (!SAFE_FIELDS.has(fix.field)) {
    return {
      record: target,
      before: { [fix.field]: target[fix.field] },
      after: { [fix.field]: fix.newValue },
      affectsBalance: true,
      warnings: [`「${fix.field}」可能影響餘額，不建議透過此工具修改`],
    };
  }

  const warnings: string[] = [];
  if (fix.field === '專案' && isTransferRecord(target)) {
    warnings.push('轉帳清專案通常安全，但請確認專案分帳報表變化');
  }

  return {
    record: target,
    before: { [fix.field]: target[fix.field] },
    after: { [fix.field]: fix.newValue },
    affectsBalance: false,
    warnings,
  };
}

export function applySingleRecordFix(record: RawRecord, fix: SingleRecordFix): RawRecord {
  if (!SAFE_FIELDS.has(fix.field)) {
    throw new Error(`不允許修改欄位：${fix.field}`);
  }
  return { ...record, [fix.field]: fix.newValue };
}
