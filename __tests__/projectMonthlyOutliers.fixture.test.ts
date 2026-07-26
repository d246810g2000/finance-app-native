/**
 * 專案月度異常值分析（本機 data/AndroMoney.csv）
 *
 * 用法：
 *   npm run analyze:projects
 *
 * 產出（已在 /data gitignore）：
 *   data/project-monthly-outliers.report.json
 *
 * 可改 FOCUS_PROJECTS 或加上關鍵字搜尋，繼續做分類／專案歸屬分析。
 * 檔案不存在時整組 skip。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  parseCsvData,
  computeProjectLifecycles,
  extractMerchantName,
} from '../services/financeService';
import { EXCHANGE_RATES } from '../constants';
import { FOCUS_PROJECTS, STRICT_ATTRIBUTION_FROM_YMD } from '../services/projectDefinitions';
import { RawRecord } from '../types';

const FIXTURE_PATH = path.join(__dirname, '..', 'data', 'AndroMoney.csv');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'project-monthly-outliers.report.json');
const fixtureExists = fs.existsSync(FIXTURE_PATH);
const describeFixture = fixtureExists ? describe : describe.skip;

/** @deprecated 改從 services/projectDefinitions 匯入；此處再 export 以相容舊用法 */
export { FOCUS_PROJECTS };

/** 額外用關鍵字抓近似專案（例如婚禮相關） */
export const EXTRA_NAME_PATTERNS = [/婚禮|婚宴|結婚/];

type TxSample = {
  date: string;
  amount: number;
  category: string;
  sub: string;
  pay: string;
  merchant: string;
  notes: string;
};

type MonthRow = {
  month: string;
  amount: number;
  count: number;
  byCategory: Record<string, number>;
  topTx: TxSample[];
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
  const pay = r['付款(轉出)'];
  const recv = r['收款(轉入)'];
  return Boolean(pay && !recv);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mad(nums: number[], med: number): number {
  if (!nums.length) return 0;
  return median(nums.map((n) => Math.abs(n - med)));
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function sampleTx(r: RawRecord, noteLen = 100): TxSample {
  const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
  return {
    date: ymd,
    amount: Math.round(twdAmount(r)),
    category: String(r['分類'] || ''),
    sub: String(r['子分類'] || ''),
    pay: String(r['付款(轉出)'] || ''),
    merchant: extractMerchantName(r) || '',
    notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, noteLen),
  };
}

export function analyzeProjectMonthlyOutliers(
  rows: RawRecord[],
  options: {
    focusProjects?: string[];
    extraNamePatterns?: RegExp[];
    asOfYmd?: string;
    /** 只統計此日（含）之後；預設嚴格規範起點 2024-06-01 */
    fromYmd?: string;
  } = {}
) {
  const focus = options.focusProjects ?? FOCUS_PROJECTS;
  const patterns = options.extraNamePatterns ?? EXTRA_NAME_PATTERNS;
  const asOf = options.asOfYmd ?? todayYmd();
  const fromYmd = options.fromYmd ?? STRICT_ATTRIBUTION_FROM_YMD;

  const lives = computeProjectLifecycles(rows, true);
  const allNames = lives.map((l) => l.name);
  const weddingLike = allNames.filter((n) => patterns.some((re) => re.test(n)));
  const focusNames = focus.filter((n) => allNames.includes(n));
  const missing = focus.filter((n) => !allNames.includes(n));
  const targetNames = [...new Set([...focusNames, ...weddingLike])];

  const projects = targetNames.map((name) => {
    const life = lives.find((l) => l.name === name)!;
    const projectRows = rows.filter((r) => {
      if (!isExpense(r)) return false;
      if ((r['專案'] || '').trim() !== name) return false;
      const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
      if (ymd.length >= 8 && ymd > asOf) return false;
      if (ymd.length >= 8 && ymd < fromYmd) return false;
      return true;
    });

    const byMonth: Record<string, MonthRow> = {};
    for (const r of projectRows) {
      const ymd = String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
      if (ymd.length < 8) continue;
      const month = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
      const amount = twdAmount(r);
      const cat = `${r['分類'] || ''}/${r['子分類'] || ''}`;
      if (!byMonth[month]) {
        byMonth[month] = { month, amount: 0, count: 0, byCategory: {}, topTx: [] };
      }
      byMonth[month].amount += amount;
      byMonth[month].count += 1;
      byMonth[month].byCategory[cat] = (byMonth[month].byCategory[cat] || 0) + amount;
      byMonth[month].topTx.push(sampleTx(r, 80));
    }

    const months = Object.values(byMonth)
      .map((m) => {
        m.amount = Math.round(m.amount);
        m.topTx.sort((a, b) => b.amount - a.amount);
        m.topTx = m.topTx.slice(0, 8);
        return m;
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    const amounts = months.map((m) => m.amount);
    const med = median(amounts);
    const madVal = mad(amounts, med);
    const mean = amounts.reduce((s, x) => s + x, 0) / (amounts.length || 1);
    const variance =
      amounts.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, amounts.length - 1);
    const std = Math.sqrt(variance);
    const thresholdMad = med + 3.5 * 1.4826 * madVal;
    const thresholdStd = mean + 2 * std;

    const outliers = months
      .map((mo) => {
        const zMad = madVal > 0 ? (0.6745 * (mo.amount - med)) / madVal : 0;
        const zStd = std > 0 ? (mo.amount - mean) / std : 0;
        const isOut = madVal > 0 ? Math.abs(zMad) >= 3.5 : mo.amount >= thresholdStd;
        const isHigh = isOut && mo.amount > med;
        return {
          ...mo,
          zMad: Math.round(zMad * 100) / 100,
          zStd: Math.round(zStd * 100) / 100,
          isOut,
          isHigh,
        };
      })
      .filter((mo) => mo.isHigh)
      .sort((a, b) => b.amount - a.amount);

    const bigTx = projectRows
      .map((r) => sampleTx(r))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    const byCat: Record<string, { amount: number; count: number }> = {};
    for (const r of projectRows) {
      const key = `${r['分類'] || ''}/${r['子分類'] || ''}`;
      if (!byCat[key]) byCat[key] = { amount: 0, count: 0 };
      byCat[key].amount += twdAmount(r);
      byCat[key].count += 1;
    }
    const total = Object.values(byCat).reduce((s, v) => s + v.amount, 0) || 1;
    const catMix = Object.entries(byCat)
      .map(([k, v]) => ({
        cat: k,
        amount: Math.round(v.amount),
        count: v.count,
        pct: Math.round((v.amount / total) * 1000) / 10,
      }))
      .sort((a, b) => b.amount - a.amount);

    const periodTotal = Math.round(projectRows.reduce((s, r) => s + twdAmount(r), 0));
    const periodDates = projectRows
      .map((r) => String(r['日期'] || '').replace(/\D/g, '').slice(0, 8))
      .filter((d) => d.length >= 8)
      .sort();

    return {
      name,
      totalExpense: periodTotal,
      recordCount: projectRows.length,
      firstDate: periodDates[0]
        ? `${periodDates[0].slice(0, 4)}.${periodDates[0].slice(4, 6)}.${periodDates[0].slice(6, 8)}`
        : life.firstDate,
      lastDate: periodDates.length
        ? `${periodDates[periodDates.length - 1].slice(0, 4)}.${periodDates[periodDates.length - 1].slice(4, 6)}.${periodDates[periodDates.length - 1].slice(6, 8)}`
        : life.lastDate,
      monthSpan: life.monthSpan,
      monthCount: months.length,
      medianMonthly: Math.round(med),
      meanMonthly: Math.round(mean),
      stdMonthly: Math.round(std),
      madMonthly: Math.round(madVal),
      thresholdMad: Math.round(thresholdMad),
      thresholdStd: Math.round(thresholdStd),
      monthlySeries: months.map((mo) => ({
        month: mo.month,
        amount: mo.amount,
        count: mo.count,
      })),
      outliers: outliers.map((o) => ({
        month: o.month,
        amount: o.amount,
        count: o.count,
        zMad: o.zMad,
        zStd: o.zStd,
        topCats: Object.entries(o.byCategory)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => ({ cat: k, amount: Math.round(v) })),
        topTx: o.topTx,
      })),
      bigTx,
      catMix: catMix.slice(0, 12),
    };
  });

  return {
    asOfYmd: asOf,
    fromYmd,
    missing,
    weddingLike,
    focusProjects: focus,
    projects,
    allProjectsTop: lives.slice(0, 30).map((l) => ({
      name: l.name,
      total: l.totalExpense,
      months: l.monthSpan,
      count: l.recordCount,
    })),
  };
}

describeFixture('專案月度異常分析（data/AndroMoney.csv）', () => {
  it('產出報告並標出高異常月', () => {
    const csv = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const rows = parseCsvData(csv);
    const report = analyzeProjectMonthlyOutliers(rows);

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    // eslint-disable-next-line no-console
    console.log(
      `\n[analyze:projects] wrote ${REPORT_PATH}\n` +
        `from ${STRICT_ATTRIBUTION_FROM_YMD}\n` +
        report.projects
          .map(
            (p) =>
              `${p.name}: total=${p.totalExpense} months=${p.monthCount} med=${p.medianMonthly} outliers=${p.outliers.length} [${p.outliers
                .slice(0, 5)
                .map((o) => `${o.month}:${o.amount}`)
                .join(', ')}]`
          )
          .join('\n')
    );

    expect(report.projects.length).toBeGreaterThan(0);
    for (const name of FOCUS_PROJECTS) {
      expect(report.missing).not.toContain(name);
    }
    const reno = report.projects.find((p) => p.name === '裝潢家具');
    expect(reno).toBeTruthy();
    expect(reno!.outliers.length).toBeGreaterThan(0);
  });
});

describe('專案月度異常分析 gate', () => {
  it('提醒：請放置 data/AndroMoney.csv', () => {
    if (!fixtureExists) {
      // eslint-disable-next-line no-console
      console.warn(`[skip] 找不到 ${FIXTURE_PATH}`);
    }
    expect(true).toBe(true);
  });
});
