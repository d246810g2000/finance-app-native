/**
 * 財務健檢報告產生器（嚴格區間 2024-06 起）
 *
 * 用法：npm run analyze:report
 * 產出：
 *   data/financial-health-report.json
 *   docs/financial-health-report.md
 *
 * 涵蓋一般個人／家庭財務健檢會看的面向，方便每月回頭審視。
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseCsvData, extractMerchantName, summarizePersonalVsSharedBurden } from '../services/financeService';
import { EXCHANGE_RATES } from '../constants';
import {
  FOCUS_PROJECTS,
  PROJECT_DEFINITIONS,
  STRICT_ATTRIBUTION_FROM_YMD,
} from '../services/projectDefinitions';
import { RawRecord } from '../types';

const FIXTURE = path.join(__dirname, '..', 'data', 'AndroMoney.csv');
const JSON_OUT = path.join(__dirname, '..', 'data', 'financial-health-report.json');
const MD_OUT = path.join(__dirname, '..', 'docs', 'financial-health-report.md');
const exists = fs.existsSync(FIXTURE);
const describeFixture = exists ? describe : describe.skip;

function twd(r: RawRecord): number {
  let a = Math.abs(parseFloat(String(r['金額'] || '').replace(/[,￥$€£]/g, '').trim()) || 0);
  const c = String(r['幣別'] || 'TWD');
  if (EXCHANGE_RATES[c]) a *= EXCHANGE_RATES[c];
  return a;
}

function ymd(r: RawRecord): string {
  return String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
}

function monthKey(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}`;
}

function isExpense(r: RawRecord): boolean {
  const cat = r['分類'] || r['主類別'] || '';
  const sub = r['子分類'] || '';
  if (cat === 'SYSTEM' || cat === '代付' || cat === '轉帳') return false;
  if (sub === '代付') return false;
  return Boolean(r['付款(轉出)'] && !r['收款(轉入)']);
}

function isIncome(r: RawRecord): boolean {
  const cat = r['分類'] || r['主類別'] || '';
  if (cat === 'SYSTEM' || cat === '代付' || cat === '轉帳') return false;
  // 收入：有收款、無付款，或分類含收入
  if (r['收款(轉入)'] && !r['付款(轉出)']) return true;
  if (/收入/.test(cat)) return true;
  return false;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('zh-TW');
}

function money(n: number): string {
  return `$${fmt(n)}`;
}

describeFixture('財務健檢報告', () => {
  it('產生 JSON + Markdown 報告', () => {
    const rows = parseCsvData(fs.readFileSync(FIXTURE, 'utf8'));
    const from = STRICT_ATTRIBUTION_FROM_YMD;
    const now = new Date();
    const asOf = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const scoped = rows.filter((r) => {
      const d = ymd(r);
      return d.length >= 8 && d >= from && d <= asOf;
    });

    const expenses = scoped.filter(isExpense);
    const incomes = scoped.filter(isIncome);

    // —— 1. 總覽 ——
    const totalExpense = expenses.reduce((s, r) => s + twd(r), 0);
    const totalIncome = incomes.reduce((s, r) => s + twd(r), 0);
    const monthsSet = new Set(expenses.map((r) => monthKey(ymd(r))));
    const monthCount = monthsSet.size || 1;
    const avgMonthlyExpense = totalExpense / monthCount;
    const avgMonthlyIncome = totalIncome / monthCount;

    // —— 2. 每月趨勢 ——
    const byMonth: Record<
      string,
      { expense: number; income: number; count: number; byProject: Record<string, number>; byCat: Record<string, number> }
    > = {};
    for (const r of expenses) {
      const m = monthKey(ymd(r));
      if (!byMonth[m]) byMonth[m] = { expense: 0, income: 0, count: 0, byProject: {}, byCat: {} };
      const a = twd(r);
      byMonth[m].expense += a;
      byMonth[m].count += 1;
      const p = (r['專案'] || '').trim() || '(無專案)';
      byMonth[m].byProject[p] = (byMonth[m].byProject[p] || 0) + a;
      const cat = String(r['分類'] || '(未分類)');
      byMonth[m].byCat[cat] = (byMonth[m].byCat[cat] || 0) + a;
    }
    for (const r of incomes) {
      const m = monthKey(ymd(r));
      if (!byMonth[m]) byMonth[m] = { expense: 0, income: 0, count: 0, byProject: {}, byCat: {} };
      byMonth[m].income += twd(r);
    }

    const monthly = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => {
        const topProjects = Object.entries(v.byProject)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, amount]) => ({ name, amount: Math.round(amount) }));
        const topCats = Object.entries(v.byCat)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, amount]) => ({ name, amount: Math.round(amount) }));
        return {
          month,
          expense: Math.round(v.expense),
          income: Math.round(v.income),
          net: Math.round(v.income - v.expense),
          count: v.count,
          topProjects,
          topCats,
        };
      });

    const monthlyExpenses = monthly.map((m) => m.expense);
    const medMonthly = median(monthlyExpenses);
    const meanMonthly = monthlyExpenses.reduce((s, x) => s + x, 0) / (monthlyExpenses.length || 1);
    const spikeMonths = monthly
      .filter((m) => m.expense >= medMonthly * 1.8 && m.expense >= 50000)
      .map((m) => ({
        month: m.month,
        expense: m.expense,
        vsMedian: Math.round((m.expense / (medMonthly || 1)) * 10) / 10,
        topProjects: m.topProjects,
      }));

    // —— 3. 專案 ——
    const byProject: Record<string, { amount: number; count: number; byMonth: Record<string, number> }> = {};
    for (const name of FOCUS_PROJECTS) byProject[name] = { amount: 0, count: 0, byMonth: {} };
    byProject['(其他／無專案)'] = { amount: 0, count: 0, byMonth: {} };

    for (const r of expenses) {
      let p = (r['專案'] || '').trim();
      if (!FOCUS_PROJECTS.includes(p)) p = '(其他／無專案)';
      const a = twd(r);
      byProject[p].amount += a;
      byProject[p].count += 1;
      const m = monthKey(ymd(r));
      byProject[p].byMonth[m] = (byProject[p].byMonth[m] || 0) + a;
    }

    const projects = Object.entries(byProject)
      .map(([name, v]) => {
        const months = Object.entries(v.byMonth)
          .map(([month, amount]) => ({ month, amount: Math.round(amount) }))
          .sort((a, b) => a.month.localeCompare(b.month));
        const amts = months.map((x) => x.amount);
        return {
          name,
          amount: Math.round(v.amount),
          count: v.count,
          pct: Math.round((v.amount / (totalExpense || 1)) * 1000) / 10,
          medianMonthly: Math.round(median(amts)),
          avgMonthly: Math.round(v.amount / (months.length || 1)),
          definition: PROJECT_DEFINITIONS.find((d) => d.name === name)?.summary || '',
          topMonths: [...months].sort((a, b) => b.amount - a.amount).slice(0, 3),
        };
      })
      .filter((p) => p.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    // —— 4. 分類 ——
    const byCat: Record<string, number> = {};
    const bySub: Record<string, number> = {};
    for (const r of expenses) {
      const cat = String(r['分類'] || '(未分類)');
      const sub = `${cat}/${r['子分類'] || ''}`;
      byCat[cat] = (byCat[cat] || 0) + twd(r);
      bySub[sub] = (bySub[sub] || 0) + twd(r);
    }
    const categories = Object.entries(byCat)
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount),
        pct: Math.round((amount / (totalExpense || 1)) * 1000) / 10,
      }))
      .sort((a, b) => b.amount - a.amount);
    const subcategories = Object.entries(bySub)
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount),
        pct: Math.round((amount / (totalExpense || 1)) * 1000) / 10,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    // —— 5. 固定 vs 日常（依專案粗分）——
    const fixedProjects = new Set(['住家支出', '房屋購置']);
    const capitalProjects = new Set(['裝潢家具', '婚禮寶典']);
    let fixed = 0;
    let capital = 0;
    let dailyShared = 0;
    let dailyPersonal = 0;
    let other = 0;
    for (const r of expenses) {
      const p = (r['專案'] || '').trim();
      const a = twd(r);
      if (fixedProjects.has(p)) fixed += a;
      else if (capitalProjects.has(p)) capital += a;
      else if (p === '共同開銷') dailyShared += a;
      else if (p === '正常開銷') dailyPersonal += a;
      else other += a;
    }

    // —— 6. 個人 vs 共同負擔 ——
    const start = new Date(
      parseInt(from.slice(0, 4), 10),
      parseInt(from.slice(4, 6), 10) - 1,
      parseInt(from.slice(6, 8), 10)
    );
    const end = new Date(
      parseInt(asOf.slice(0, 4), 10),
      parseInt(asOf.slice(4, 6), 10) - 1,
      parseInt(asOf.slice(6, 8), 10),
      23,
      59,
      59
    );
    const burden = summarizePersonalVsSharedBurden(rows, start, end, {
      splitProjects: ['共同開銷'],
    });

    // —— 7. 商家 Top ——
    const byMerchant: Record<string, { amount: number; count: number }> = {};
    for (const r of expenses) {
      const m = (extractMerchantName(r) || '').trim();
      if (!m || /^(餐飲食品|居家生活|運輸交通|休閒娛樂|人情交際|汽機車|醫療保健)-/.test(m)) continue;
      if (!byMerchant[m]) byMerchant[m] = { amount: 0, count: 0 };
      byMerchant[m].amount += twd(r);
      byMerchant[m].count += 1;
    }
    const merchants = Object.entries(byMerchant)
      .map(([name, v]) => ({
        name,
        amount: Math.round(v.amount),
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    // —— 8. 單筆大額 ——
    const largeTx = expenses
      .map((r) => ({
        date: ymd(r),
        amount: Math.round(twd(r)),
        project: (r['專案'] || '').trim() || '(無)',
        category: `${r['分類']}/${r['子分類']}`,
        merchant: extractMerchantName(r) || '',
        notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 60),
      }))
      .filter((t) => t.amount >= 20000)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 25);

    // —— 9. 審視清單（每月可照著看）——
    const reviewChecklist = [
      {
        section: '每月總支出',
        questions: [
          '本月總支出相對近 3～6 個月中位數偏高還是偏低？',
          '若偏高，是哪個專案／哪幾筆造成的？',
          '收入扣除支出後，本月淨額是否可接受？',
        ],
      },
      {
        section: '專案檢視',
        questions: [
          '正常開銷：是否混入共同或住家費用？',
          '共同開銷：大額 Shopping／3C 是否真為兩人共同？',
          '住家支出：水電稅網路是否齊全、有無漏記到別的專案？',
          '裝潢家具／婚禮寶典：本月是否還有大額尾款或分期？',
          '房屋購置：房貸是否固定出現一筆？',
        ],
      },
      {
        section: '分類與備註',
        questions: [
          '≥$5,000 且無備註的支出，能否補上用途？',
          '「晚點再記」是否已清掉？',
          '子分類是否與專案一致（例如住家不該是休閒娛樂）？',
        ],
      },
      {
        section: '固定 vs 彈性',
        questions: [
          '固定支出（住家＋房貸）占月支出比例是否穩定？',
          '彈性支出（正常＋共同）本月有無異常衝高？',
          '資本型專案（裝潢／婚禮）是否仍在預期預算內？',
        ],
      },
    ];

    const report = {
      meta: {
        title: '財務健檢報告',
        generatedAt: now.toISOString(),
        strictFrom: from,
        asOf,
        source: 'data/AndroMoney.csv',
        note: '支出口径：有付款帳戶、排除 SYSTEM／轉帳／代付；共同開銷以 50% 計入個人負擔彙總',
      },
      overview: {
        totalExpense: Math.round(totalExpense),
        totalIncome: Math.round(totalIncome),
        net: Math.round(totalIncome - totalExpense),
        monthCount,
        avgMonthlyExpense: Math.round(avgMonthlyExpense),
        avgMonthlyIncome: Math.round(avgMonthlyIncome),
        medianMonthlyExpense: Math.round(medMonthly),
        meanMonthlyExpense: Math.round(meanMonthly),
        expenseRecordCount: expenses.length,
        incomeRecordCount: incomes.length,
      },
      structure: {
        fixed: Math.round(fixed),
        capital: Math.round(capital),
        dailyShared: Math.round(dailyShared),
        dailyPersonal: Math.round(dailyPersonal),
        other: Math.round(other),
        fixedPct: Math.round((fixed / (totalExpense || 1)) * 1000) / 10,
        capitalPct: Math.round((capital / (totalExpense || 1)) * 1000) / 10,
        dailyPct: Math.round(((dailyShared + dailyPersonal) / (totalExpense || 1)) * 1000) / 10,
      },
      burden: {
        personalFull: burden.personalFull,
        sharedShare: burden.sharedShare,
        sharedGross: burden.sharedGross,
        yourEstimatedBurden: burden.personalFull + burden.sharedShare,
      },
      projects,
      categories: categories.slice(0, 12),
      subcategories,
      monthly,
      spikeMonths,
      merchants,
      largeTx,
      reviewChecklist,
      howToUse: [
        '先看「總覽」與「每月趨勢」：哪個月份異常高？',
        '再到「專案」：高的那個月是哪個專案拉起來的？',
        '用「單筆大額」對帳：是否都認識、歸屬是否正確？',
        '每月結帳時照「審視清單」問自己 4 組問題。',
        '重跑：npm run analyze:report（CSV 更新後）',
      ],
    };

    // —— Markdown ——
    const lines: string[] = [];
    lines.push('# 財務健檢報告');
    lines.push('');
    lines.push(
      `期間：**${from.slice(0, 4)}.${from.slice(4, 6)}.${from.slice(6, 8)} ~ ${asOf.slice(0, 4)}.${asOf.slice(4, 6)}.${asOf.slice(6, 8)}**（嚴格規範起）`
    );
    lines.push(`產生時間：${now.toLocaleString('zh-TW')}`);
    lines.push('');
    lines.push('> 一般財務健檢會看：總覽、月趨勢、專案／分類結構、固定 vs 彈性、個人 vs 共同負擔、大額與異常月、以及每月回頭審視的問題清單。本報告依此架構產出。');
    lines.push('');

    lines.push('## 1. 總覽');
    lines.push('');
    lines.push('| 指標 | 數值 |');
    lines.push('|------|------|');
    lines.push(`| 總支出 | ${money(report.overview.totalExpense)} |`);
    lines.push(`| 總收入（可辨識） | ${money(report.overview.totalIncome)} |`);
    lines.push(`| 期間淨額 | ${money(report.overview.net)} |`);
    lines.push(`| 涵蓋月數 | ${report.overview.monthCount} |`);
    lines.push(`| 月均支出 | ${money(report.overview.avgMonthlyExpense)} |`);
    lines.push(`| 月支出中位數 | ${money(report.overview.medianMonthlyExpense)} |`);
    lines.push(`| 支出筆數 | ${report.overview.expenseRecordCount} |`);
    lines.push('');

    lines.push('## 2. 支出結構（固定 / 資本 / 日常）');
    lines.push('');
    lines.push('| 類型 | 金額 | 占比 | 對應專案 |');
    lines.push('|------|------|------|----------|');
    lines.push(
      `| 固定 | ${money(report.structure.fixed)} | ${report.structure.fixedPct}% | 住家支出、房屋購置 |`
    );
    lines.push(
      `| 資本／專案型 | ${money(report.structure.capital)} | ${report.structure.capitalPct}% | 裝潢家具、婚禮寶典 |`
    );
    lines.push(
      `| 日常（共同＋個人） | ${money(report.structure.dailyShared + report.structure.dailyPersonal)} | ${report.structure.dailyPct}% | 共同開銷、正常開銷 |`
    );
    lines.push(`| 其他 | ${money(report.structure.other)} | — | 旅遊等非焦點專案 |`);
    lines.push('');
    lines.push(
      `- 共同開銷毛額 ${money(report.structure.dailyShared)}；正常開銷 ${money(report.structure.dailyPersonal)}`
    );
    lines.push(
      `- 以分帳估算「你的負擔」≈ 個人全額 ${money(burden.personalFull)} ＋ 共同份額 ${money(burden.sharedShare)} ＝ **${money(burden.personalFull + burden.sharedShare)}**`
    );
    lines.push('');

    lines.push('## 3. 專案花費');
    lines.push('');
    lines.push('| 專案 | 總額 | 占比 | 筆數 | 月中位 | 定義 |');
    lines.push('|------|------|------|------|--------|------|');
    for (const p of projects) {
      lines.push(
        `| ${p.name} | ${money(p.amount)} | ${p.pct}% | ${p.count} | ${money(p.medianMonthly)} | ${p.definition || '—'} |`
      );
    }
    lines.push('');
    lines.push('### 各專案最高月份');
    lines.push('');
    for (const p of projects.filter((x) => FOCUS_PROJECTS.includes(x.name))) {
      const tops = p.topMonths.map((m) => `${m.month} ${money(m.amount)}`).join('；');
      lines.push(`- **${p.name}**：${tops || '—'}`);
    }
    lines.push('');

    lines.push('## 4. 分類結構（Top）');
    lines.push('');
    lines.push('| 主分類 | 金額 | 占比 |');
    lines.push('|--------|------|------|');
    for (const c of categories.slice(0, 10)) {
      lines.push(`| ${c.name} | ${money(c.amount)} | ${c.pct}% |`);
    }
    lines.push('');
    lines.push('### 子分類 Top 10');
    lines.push('');
    for (const c of subcategories.slice(0, 10)) {
      lines.push(`- ${c.name}：${money(c.amount)}（${c.pct}%）`);
    }
    lines.push('');

    lines.push('## 5. 每月趨勢');
    lines.push('');
    lines.push('| 月份 | 支出 | 收入 | 淨額 | 當月主因（專案） |');
    lines.push('|------|------|------|------|------------------|');
    for (const m of monthly) {
      const cause = m.topProjects
        .slice(0, 2)
        .map((p) => `${p.name} ${money(p.amount)}`)
        .join('、');
      lines.push(
        `| ${m.month} | ${money(m.expense)} | ${money(m.income)} | ${money(m.net)} | ${cause} |`
      );
    }
    lines.push('');
    if (spikeMonths.length) {
      lines.push('### 異常偏高月份（≥ 中位數 ×1.8 且 ≥$50,000）');
      lines.push('');
      for (const s of spikeMonths) {
        lines.push(
          `- **${s.month}** ${money(s.expense)}（約 ${s.vsMedian}× 中位）：${s.topProjects.map((p) => `${p.name} ${money(p.amount)}`).join('、')}`
        );
      }
      lines.push('');
    }

    lines.push('## 6. 單筆大額（≥$20,000）');
    lines.push('');
    lines.push('| 日期 | 金額 | 專案 | 內容 |');
    lines.push('|------|------|------|------|');
    for (const t of largeTx.slice(0, 20)) {
      lines.push(
        `| ${t.date} | ${money(t.amount)} | ${t.project} | ${(t.notes || t.merchant || t.category).slice(0, 40)} |`
      );
    }
    lines.push('');

    lines.push('## 7. 商家 Top 10（有真實商家名）');
    lines.push('');
    for (const m of merchants.slice(0, 10)) {
      lines.push(`- ${m.name}：${money(m.amount)}（${m.count} 筆）`);
    }
    lines.push('');

    lines.push('## 8. 每月回頭審視清單');
    lines.push('');
    for (const block of reviewChecklist) {
      lines.push(`### ${block.section}`);
      lines.push('');
      for (const q of block.questions) lines.push(`- [ ] ${q}`);
      lines.push('');
    }

    lines.push('## 9. 建議使用方式');
    lines.push('');
    for (const tip of report.howToUse) lines.push(`1. ${tip.replace(/^\d+\)\s*/, '')}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('重跑指令：`npm run analyze:report`');
    lines.push('');

    fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    fs.mkdirSync(path.dirname(MD_OUT), { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
    fs.writeFileSync(MD_OUT, lines.join('\n'));

    // eslint-disable-next-line no-console
    console.log(
      `\n[analyze:report]\n` +
        `JSON → ${JSON_OUT}\n` +
        `MD   → ${MD_OUT}\n` +
        `支出 ${money(report.overview.totalExpense)} / 月中位 ${money(report.overview.medianMonthlyExpense)} / 專案 ${projects.length} / 異常月 ${spikeMonths.length}`
    );

    expect(report.overview.totalExpense).toBeGreaterThan(0);
    expect(monthly.length).toBeGreaterThan(6);
  });
});

describe('財務健檢報告 gate', () => {
  it('提醒放置 CSV', () => {
    if (!exists) console.warn(`[skip] 找不到 ${FIXTURE}`);
    expect(true).toBe(true);
  });
});
