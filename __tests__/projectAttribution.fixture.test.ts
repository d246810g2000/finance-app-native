/**
 * 依專案定義掃描不合理歸屬、空白／語意不清備註。
 *
 * 預設只檢視 STRICT_ATTRIBUTION_FROM_YMD（2024-06-01）起的資料——
 * 此日前記帳較鬆，不納入嚴格覆核。
 *
 * 用法：
 *   npm run analyze:attribution
 *
 * 產出：
 *   data/project-attribution-review.report.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseCsvData, extractMerchantName } from '../services/financeService';
import { EXCHANGE_RATES } from '../constants';
import {
  FOCUS_PROJECTS,
  PROJECT_DEFINITION_BY_NAME,
  PROJECT_DEFINITIONS,
  ProjectDefinition,
  STRICT_ATTRIBUTION_FROM_YMD,
} from '../services/projectDefinitions';
import { RawRecord } from '../types';

const FIXTURE_PATH = path.join(__dirname, '..', 'data', 'AndroMoney.csv');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'project-attribution-review.report.json');
const DOCS_PATH = path.join(__dirname, '..', 'docs', 'project-definitions.md');
const fixtureExists = fs.existsSync(FIXTURE_PATH);
const describeFixture = fixtureExists ? describe : describe.skip;

type Finding = {
  severity: 'high' | 'medium' | 'low';
  kind: 'wrong_project' | 'unclear_note' | 'empty_note' | 'suspicious_category' | 'zero_amount';
  project: string;
  suggestProject: string | null;
  reason: string;
  date: string;
  amount: number;
  category: string;
  sub: string;
  pay: string;
  merchant: string;
  notes: string;
  uid: string;
};

function twdAmount(r: RawRecord): number {
  let amount = Math.abs(parseFloat(String(r['金額'] || '').replace(/[,￥$€£]/g, '').trim()) || 0);
  const currency = String(r['幣別'] || 'TWD');
  if (EXCHANGE_RATES[currency]) amount *= EXCHANGE_RATES[currency];
  return amount;
}

function isExpense(r: RawRecord): boolean {
  const cat = r['分類'] || r['主類別'] || '';
  if (cat === 'SYSTEM' || cat === '代付' || cat === '轉帳') return false;
  return Boolean(r['付款(轉出)'] && !r['收款(轉入)']);
}

function noteText(r: RawRecord): string {
  return String(r['備註'] || '').trim();
}

function normalizeNote(notes: string): string {
  return notes.replace(/\s+/g, ' ').trim();
}

function isCategoryFallbackMerchant(merchant: string): boolean {
  return /^(餐飲食品|居家生活|運輸交通|休閒娛樂|人情交際|汽機車|其他|費用)-/.test(merchant);
}

/** 備註是否「說得出這筆是什麼」（分類後備名不算） */
function noteClarity(notes: string, merchant: string): 'empty' | 'unclear' | 'ok' {
  const n = normalizeNote(notes);
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

  // 有真實商家名即可接受（之後可再補用途）；僅有分類後備名則算不清
  if (!useful) {
    if (realMerchant) return 'ok';
    if (isCategoryFallbackMerchant(merchant)) return 'unclear';
    return 'empty';
  }

  // 發票商品列有實際品名
  if (useful.length >= 2) return 'ok';
  return realMerchant ? 'ok' : 'unclear';
}

function haystack(r: RawRecord, merchant: string): string {
  return [
    r['分類'],
    r['子分類'],
    merchant,
    noteText(r),
  ]
    .filter(Boolean)
    .join(' ');
}

function suggestFromHints(
  def: ProjectDefinition,
  text: string
): { suggestProject: string; reason: string } | null {
  for (const h of def.reassignHints) {
    if (h.pattern.test(text)) return { suggestProject: h.suggestProject, reason: h.reason };
  }
  return null;
}

/** 依專案＋分類的硬規則（「誰一起／誰受益」優先） */
function ruleBasedSuggest(
  project: string,
  cat: string,
  sub: string,
  text: string
): { suggestProject: string; reason: string; severity: Finding['severity'] } | null {
  const cs = `${cat}/${sub}`;

  // —— 裝潢家具 ——
  if (project === '裝潢家具') {
    // 家庭娛樂 3C → 共同開銷（非裝潢）
    if (/遊戲|Switch|任天堂|Joy-Con/.test(text) || (cat === '休閒娛樂' && /遊戲/.test(sub))) {
      return {
        suggestProject: '共同開銷',
        reason: '家庭／共同娛樂設備，非裝潢家具',
        severity: 'high',
      };
    }
    if (/電費|水費|瓦斯|網路費|管理費|繳稅/.test(sub) || /電費|水費|瓦斯|管理費|房屋稅/.test(text)) {
      return { suggestProject: '住家支出', reason: '住家固定費', severity: 'high' };
    }
    if (/頭期|房貸/.test(text) && !/裝修|裝潢|家具/.test(text)) {
      return { suggestProject: '房屋購置', reason: '購屋款而非裝潢', severity: 'high' };
    }
  }

  // —— 房屋購置 ——
  if (project === '房屋購置') {
    if (/裝修|裝潢|第[一二三四五]期|尾款.*裝修|沙發|床墊|家具/.test(text)) {
      return { suggestProject: '裝潢家具', reason: '裝潢／家具內容', severity: 'high' };
    }
    if (/管理費|電費|水費|瓦斯|網路/.test(sub + text) && !/頭期|房貸/.test(text)) {
      return { suggestProject: '住家支出', reason: '住家營運費', severity: 'high' };
    }
  }

  // —— 共同開銷 ——
  // 他人禮金、家庭遊戲、共同演唱會：依使用者定義屬共同，不改掛
  if (project === '共同開銷') {
    if (/喜餅|婚紗|喜宴|婚戒|拍拍印/.test(text)) {
      return { suggestProject: '婚禮寶典', reason: '我們自己的結婚花費', severity: 'high' };
    }
    if (/孝養父母/.test(sub)) {
      return { suggestProject: '正常開銷', reason: '孝親偏個人', severity: 'medium' };
    }
    if (/房屋支出|管理費|繳稅|網路費|電費|水費|瓦斯/.test(cs) || /房貸|頭期/.test(text)) {
      if (/房貸|頭期/.test(text)) {
        return { suggestProject: '房屋購置', reason: '購屋資本', severity: 'high' };
      }
      if (/裝修|家具|沙發/.test(text)) {
        return { suggestProject: '裝潢家具', reason: '裝潢家具', severity: 'high' };
      }
      return { suggestProject: '住家支出', reason: '住家固定費不應進共同日常', severity: 'high' };
    }
  }

  // —— 住家支出 ——
  if (project === '住家支出') {
    if (/餐飲食品|休閒娛樂|婚喪|孝養/.test(cat)) {
      const dest =
        /婚喪|喜餅|婚紗/.test(text)
          ? '婚禮寶典'
          : /餐飲|日常|全聯|家樂福|遊戲|Switch|演唱會/.test(text + cat)
            ? '共同開銷'
            : '正常開銷';
      return { suggestProject: dest, reason: '非住家固定費', severity: 'high' };
    }
    if (/裝修|裝潢|家具|沙發|床墊/.test(text) || (/房屋支出/.test(sub) && /裝修|家具|期/.test(text))) {
      return { suggestProject: '裝潢家具', reason: '裝潢／家具', severity: 'high' };
    }
    if (/頭期|房貸/.test(text)) {
      return { suggestProject: '房屋購置', reason: '購屋款', severity: 'high' };
    }
  }

  // —— 婚禮寶典 ——
  if (project === '婚禮寶典') {
    if (/小羊結婚|朋友結婚|同事結婚|同學結婚/.test(text)) {
      return {
        suggestProject: '共同開銷',
        reason: '他人婚禮禮金；兩人一起則共同開銷',
        severity: 'high',
      };
    }
    if (/房屋支出|管理費|繳稅|電費/.test(cs)) {
      return {
        suggestProject: /裝修|家具/.test(text) ? '裝潢家具' : '住家支出',
        reason: '非婚禮花費',
        severity: 'high',
      };
    }
  }

  // —— 正常開銷 ——
  if (project === '正常開銷') {
    // 個人燃料稅／牌照稅留在正常開銷
    const personalVehicleTax = /燃料稅|牌照稅|個人燃料/.test(text);
    if (
      !personalVehicleTax &&
      (/管理費|電費|水費|瓦斯|網路費/.test(sub) ||
        (/繳稅/.test(sub) && !personalVehicleTax) ||
        /房屋稅|地價稅|管理費/.test(text))
    ) {
      // 空白「繳稅」仍提示改住家；有個人燃料備註則略過
      if (/繳稅/.test(sub) && !/房屋稅|地價稅|管理費|電費|水費|瓦斯|網路/.test(text)) {
        // 僅子分類繳稅、無住家關鍵字：改為 medium 人工確認，避免誤傷
        return {
          suggestProject: '住家支出',
          reason: '繳稅類：若是房屋稅／地價稅改住家；個人燃料稅請留正常並在備註註明',
          severity: 'medium',
        };
      }
      return { suggestProject: '住家支出', reason: '住家固定費', severity: 'high' };
    }
    if (/頭期|房貸/.test(text)) {
      return { suggestProject: '房屋購置', reason: '購屋資本', severity: 'high' };
    }
    if (/裝修|裝潢第|家具|沙發床墊|洗碗机|氣密窗/.test(text)) {
      return { suggestProject: '裝潢家具', reason: '裝潢／家具', severity: 'high' };
    }
    // 避免商品 SEO 關鍵字誤判（例如蝦皮標題含「婚禮」）
    if (
      /婚紗|喜餅|喜宴|拍拍印|婚戒|婚戒金飾/.test(text) &&
      !/七夕|情人節|永生花|乾燥花|求婚禮物/.test(text)
    ) {
      return { suggestProject: '婚禮寶典', reason: '結婚花費', severity: 'high' };
    }
  }

  return null;
}

function scanProject(
  rows: RawRecord[],
  project: string,
  asOf: string,
  fromYmd: string = STRICT_ATTRIBUTION_FROM_YMD
): Finding[] {
  const def = PROJECT_DEFINITION_BY_NAME[project];
  if (!def) return [];
  const findings: Finding[] = [];

  for (const r of rows) {
    if (!isExpense(r)) continue;
    if ((r['專案'] || '').trim() !== project) continue;
    const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
    if (ymd.length >= 8 && ymd > asOf) continue;
    // 嚴格規範區間：略過規範生效前
    if (ymd.length >= 8 && ymd < fromYmd) continue;

    const amount = Math.round(twdAmount(r));
    const cat = String(r['分類'] || '');
    const sub = String(r['子分類'] || '');
    const merchant = extractMerchantName(r) || '';
    const notes = normalizeNote(noteText(r));
    const text = haystack(r, merchant);
    const base = {
      project,
      date: ymd,
      amount,
      category: cat,
      sub,
      pay: String(r['付款(轉出)'] || ''),
      merchant,
      notes: notes.slice(0, 120),
      uid: String(r.uid || r['uid'] || r.id || ''),
    };

    if (amount === 0) {
      findings.push({
        ...base,
        severity: 'low',
        kind: 'zero_amount',
        suggestProject: null,
        reason: '金額為 0（可能是點數／折抵列），建議確認是否保留',
      });
    }

    const ruled = ruleBasedSuggest(project, cat, sub, text);
    if (ruled) {
      findings.push({
        ...base,
        severity: ruled.severity,
        kind: 'wrong_project',
        suggestProject: ruled.suggestProject,
        reason: ruled.reason,
      });
    } else {
      const hinted = suggestFromHints(def, text);
      if (hinted && hinted.suggestProject !== project) {
        findings.push({
          ...base,
          severity: 'medium',
          kind: 'wrong_project',
          suggestProject: hinted.suggestProject,
          reason: hinted.reason,
        });
      } else if (def.suspiciousCategoryHints.some((re) => re.test(`${cat}/${sub}`) || re.test(sub))) {
        // 分類可疑但沒對上具體改掛規則 → 標記人工看
        findings.push({
          ...base,
          severity: 'medium',
          kind: 'suspicious_category',
          suggestProject: null,
          reason: `分類「${cat}/${sub}」不太符合「${project}」定義，請人工確認`,
        });
      }
    }

    const clarity = noteClarity(notes, merchant);
    // 房屋購置固定月繳：批次提示即可，不逐筆刷 high
    const looksLikeMortgage =
      project === '房屋購置' && amount === 15375 && (clarity === 'empty' || clarity === 'unclear');
    if (looksLikeMortgage) {
      findings.push({
        ...base,
        severity: 'low',
        kind: 'empty_note',
        suggestProject: null,
        reason: '疑似房貸月繳且無備註，建議統一補「房貸」以便辨識',
      });
    } else {
      const needNote =
        amount >= 3000 ||
        project === '裝潢家具' ||
        project === '房屋購置' ||
        project === '婚禮寶典';
      if (clarity === 'empty' && needNote) {
        findings.push({
          ...base,
          severity: amount >= 10000 ? 'high' : 'medium',
          kind: 'empty_note',
          suggestProject: null,
          reason: '無備註且無真實商家名，建議補上這筆是什麼',
        });
      } else if (clarity === 'unclear' && (amount >= 5000 || (needNote && amount >= 2000))) {
        findings.push({
          ...base,
          severity: amount >= 10000 ? 'high' : 'medium',
          kind: 'unclear_note',
          suggestProject: null,
          reason: '備註語意不清（例如「晚點再記」或僅有分類後備名），建議補用途',
        });
      }
    }
  }

  // 去重：同 uid+kind 只留一筆
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.uid}|${f.kind}|${f.suggestProject}|${f.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function writeDefinitionsMarkdown() {
  const lines: string[] = [
    '# 專案定義（記帳歸屬）',
    '',
    '依目前記帳習慣整理。App 內「共同開銷」預設 50% 分帳。',
    '',
    `**嚴格覆核起點：** ${STRICT_ATTRIBUTION_FROM_YMD.slice(0, 4)}-${STRICT_ATTRIBUTION_FROM_YMD.slice(4, 6)}-${STRICT_ATTRIBUTION_FROM_YMD.slice(6, 8)}（此前較鬆，分析預設不挑刺）。`,
    '',
    '| 專案 | 一句話 |',
    '|------|--------|',
  ];
  for (const d of PROJECT_DEFINITIONS) {
    lines.push(`| ${d.name} | ${d.summary} |`);
  }
  lines.push('');

  for (const d of PROJECT_DEFINITIONS) {
    lines.push(`## ${d.name}`);
    lines.push('');
    lines.push(d.summary);
    lines.push('');
    lines.push('**應記入**');
    for (const x of d.includes) lines.push(`- ${x}`);
    lines.push('');
    lines.push('**不應記入**');
    for (const x of d.excludes) lines.push(`- ${x}`);
    lines.push('');
    lines.push(`**常見分類：** ${d.expectedCategories.join('、')}`);
    lines.push('');
  }

  lines.push('## 快速分流');
  lines.push('');
  lines.push('```');
  lines.push('是購屋頭期／房貸？ → 房屋購置');
  lines.push('是裝潢工程或家具家電？ → 裝潢家具');
  lines.push('是水電瓦斯網路稅管理費？ → 住家支出');
  lines.push('是我們結婚相關？ → 婚禮寶典');
  lines.push('是我和謦伊的日常？ → 共同開銷');
  lines.push('是我個人日常？ → 正常開銷');
  lines.push('```');
  lines.push('');

  fs.mkdirSync(path.dirname(DOCS_PATH), { recursive: true });
  fs.writeFileSync(DOCS_PATH, lines.join('\n'));
}

function ymdToDate(ymd: string): Date {
  return new Date(
    parseInt(ymd.slice(0, 4), 10),
    parseInt(ymd.slice(4, 6), 10) - 1,
    parseInt(ymd.slice(6, 8), 10)
  );
}

function daysBetween(a: string, b: string): number {
  return Math.abs(ymdToDate(a).getTime() - ymdToDate(b).getTime()) / 86400000;
}

/** 裝潢家具空白大額＋前後一週有備註的同專案明細（幫助回想） */
function buildBlankRenoWithContext(rows: RawRecord[], asOf: string, fromYmd = STRICT_ATTRIBUTION_FROM_YMD) {
  const reno = rows.filter((r) => {
    if (!isExpense(r)) return false;
    if ((r['專案'] || '').trim() !== '裝潢家具') return false;
    const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
    if (ymd.length < 8 || ymd < fromYmd || ymd > asOf) return false;
    return true;
  });

  const blanks = reno
    .map((r) => {
      const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
      const amount = Math.round(twdAmount(r));
      const notes = normalizeNote(noteText(r));
      const merchant = extractMerchantName(r) || '';
      return { r, ymd, amount, notes, merchant };
    })
    .filter((x) => x.amount >= 5000 && noteClarity(x.notes, x.merchant) !== 'ok')
    .sort((a, b) => b.amount - a.amount);

  return blanks.map((b) => {
    const nearby = reno
      .filter((r) => {
        const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
        if (ymd === b.ymd && String(r.uid || r['uid'] || r.id) === String(b.r.uid || b.r['uid'] || b.r.id)) {
          return false;
        }
        return daysBetween(ymd, b.ymd) <= 7;
      })
      .map((r) => {
        const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
        const notes = normalizeNote(noteText(r));
        const merchant = extractMerchantName(r) || '';
        return {
          date: ymd,
          amount: Math.round(twdAmount(r)),
          merchant,
          notes: notes.slice(0, 80),
          hasUsefulNote: noteClarity(notes, merchant) === 'ok',
        };
      })
      .filter((x) => x.hasUsefulNote || x.amount >= 3000)
      .sort((a, c) => a.date.localeCompare(c.date) || c.amount - a.amount)
      .slice(0, 8);

    return {
      date: b.ymd,
      amount: b.amount,
      pay: String(b.r['付款(轉出)'] || ''),
      category: `${b.r['分類'] || ''}/${b.r['子分類'] || ''}`,
      uid: String(b.r.uid || b.r['uid'] || b.r.id || ''),
      nearbyNoted: nearby,
    };
  });
}

/** 嚴格區間：各大專案大額明細抽樣＋可能需人工確認項 */
function buildDeepReview(rows: RawRecord[], asOf: string, fromYmd = STRICT_ATTRIBUTION_FROM_YMD) {
  const items: Array<{
    project: string;
    date: string;
    amount: number;
    category: string;
    pay: string;
    merchant: string;
    notes: string;
    flag: string;
  }> = [];

  for (const r of rows) {
    if (!isExpense(r)) continue;
    const project = (r['專案'] || '').trim();
    if (!FOCUS_PROJECTS.includes(project)) continue;
    const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
    if (ymd.length < 8 || ymd < fromYmd || ymd > asOf) continue;
    const amount = Math.round(twdAmount(r));
    if (amount < 8000 && !(project === '住家支出' && amount >= 5000)) continue;

    const merchant = extractMerchantName(r) || '';
    const notes = normalizeNote(noteText(r));
    const cat = `${r['分類'] || ''}/${r['子分類'] || ''}`;
    const text = haystack(r, merchant);
    let flag = '大額抽樣';

    if (project === '裝潢家具' && /遊戲|Switch|任天堂/.test(text)) flag = '疑似應改共同開銷（家庭娛樂）';
    else if (project === '裝潢家具' && noteClarity(notes, merchant) !== 'ok') flag = '空白／不清，建議補用途';
    else if (project === '婚禮寶典' && /晚點再記/.test(notes)) flag = '待補註';
    else if (
      (project === '共同開銷' || project === '正常開銷') &&
      /電費|水費|瓦斯|網路費|管理費|房屋稅/.test(cat + text) &&
      !/燃料稅|牌照稅|個人燃料/.test(text)
    ) {
      flag = '疑似應改住家支出';
    } else if (project === '正常開銷' && /燃料稅|個人燃料/.test(text)) {
      flag = 'OK：個人燃料稅，留正常開銷';
    } else if (amount >= 30000) {
      flag = '大額（≥3萬）請確認專案與備註';
    }

    items.push({
      project,
      date: ymd,
      amount,
      category: cat,
      pay: String(r['付款(轉出)'] || ''),
      merchant: merchant.slice(0, 40),
      notes: notes.slice(0, 80),
      flag,
    });
  }

  return items.sort((a, b) => b.amount - a.amount).slice(0, 60);
}

describeFixture('專案歸屬覆核（data/AndroMoney.csv）', () => {
  it('掃描不合理支出與空白備註，並寫出專案定義', () => {
    writeDefinitionsMarkdown();

    const csv = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const rows = parseCsvData(csv);
    const now = new Date();
    const asOf = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const byProject: Record<string, Finding[]> = {};
    let all: Finding[] = [];
    for (const name of FOCUS_PROJECTS) {
      const list = scanProject(rows, name, asOf);
      byProject[name] = list.sort((a, b) => {
        const sev = { high: 0, medium: 1, low: 2 };
        if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
        return b.amount - a.amount;
      });
      all = all.concat(list);
    }

    const summary = FOCUS_PROJECTS.map((name) => {
      const list = byProject[name];
      return {
        project: name,
        totalFindings: list.length,
        high: list.filter((f) => f.severity === 'high').length,
        medium: list.filter((f) => f.severity === 'medium').length,
        low: list.filter((f) => f.severity === 'low').length,
        wrongProject: list.filter((f) => f.kind === 'wrong_project').length,
        emptyOrUnclear: list.filter((f) => f.kind === 'empty_note' || f.kind === 'unclear_note').length,
        top: list.slice(0, 12),
      };
    });

    const blankRenoLarge = buildBlankRenoWithContext(rows, asOf);
    const deepReview = buildDeepReview(rows, asOf);

    const report = {
      asOfYmd: asOf,
      strictFromYmd: STRICT_ATTRIBUTION_FROM_YMD,
      csvMetaHint: '僅檢視嚴格規範日起（含）之後的支出',
      definitionsPath: DOCS_PATH,
      summary,
      highPriority: all
        .filter((f) => f.severity === 'high')
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 80),
      blankRenoLarge,
      deepReview,
      byProject,
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    // eslint-disable-next-line no-console
    console.log(
      `\n[analyze:attribution] wrote ${REPORT_PATH}\n` +
        `strict from ${STRICT_ATTRIBUTION_FROM_YMD} → asOf ${asOf}\n` +
        `definitions → ${DOCS_PATH}\n` +
        summary
          .map(
            (s) =>
              `${s.project}: findings=${s.totalFindings} high=${s.high} wrong=${s.wrongProject} empty/unclear=${s.emptyOrUnclear}`
          )
          .join('\n') +
        `\nblank reno >=5k: ${blankRenoLarge.length}` +
        `\ndeep review items: ${deepReview.length}`
    );

    expect(fs.existsSync(DOCS_PATH)).toBe(true);
    expect(summary.length).toBe(FOCUS_PROJECTS.length);
  });
});

describe('專案歸屬覆核 gate', () => {
  it('提醒放置 CSV', () => {
    if (!fixtureExists) {
      // eslint-disable-next-line no-console
      console.warn(`[skip] 找不到 ${FIXTURE_PATH}`);
    }
    expect(true).toBe(true);
  });
});
