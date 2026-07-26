/**
 * 各專案支出健檢：找「特別奇怪」的組成／單筆／月型態
 *
 * 用法：npm run analyze:health
 * 產出：data/project-health-review.report.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseCsvData, extractMerchantName } from '../services/financeService';
import { EXCHANGE_RATES } from '../constants';
import {
  FOCUS_PROJECTS,
  STRICT_ATTRIBUTION_FROM_YMD,
  PROJECT_DEFINITION_BY_NAME,
} from '../services/projectDefinitions';
import { RawRecord } from '../types';

const FIXTURE = path.join(__dirname, '..', 'data', 'AndroMoney.csv');
const OUT = path.join(__dirname, '..', 'data', 'project-health-review.report.json');

function twd(r: RawRecord): number {
  let a = Math.abs(parseFloat(String(r['金額'] || '').replace(/[,￥$€£]/g, '').trim()) || 0);
  const c = String(r['幣別'] || 'TWD');
  if (EXCHANGE_RATES[c]) a *= EXCHANGE_RATES[c];
  return a;
}

function isExpense(r: RawRecord): boolean {
  const cat = r['分類'] || r['主類別'] || '';
  if (cat === 'SYSTEM' || cat === '代付' || cat === '轉帳') return false;
  return Boolean(r['付款(轉出)'] && !r['收款(轉入)']);
}

function ymd(r: RawRecord): string {
  return String(r['日期'] || '').replace(/\D/g, '').slice(0, 8);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

describe('專案支出健檢', () => {
  it('產出奇怪點報告', () => {
    if (!fs.existsSync(FIXTURE)) {
      expect(true).toBe(true);
      return;
    }
    const rows = parseCsvData(fs.readFileSync(FIXTURE, 'utf8'));
    const asOf = '20260727';
    const from = STRICT_ATTRIBUTION_FROM_YMD;

    const byProject: Record<string, RawRecord[]> = {};
    for (const name of FOCUS_PROJECTS) byProject[name] = [];

    for (const r of rows) {
      if (!isExpense(r)) continue;
      const p = (r['專案'] || '').trim();
      if (!byProject[p]) continue;
      const d = ymd(r);
      if (d.length < 8 || d < from || d > asOf) continue;
      byProject[p].push(r);
    }

    const weird: Array<{
      project: string;
      severity: 'high' | 'medium' | 'info';
      kind: string;
      detail: string;
      samples?: any[];
    }> = [];

    const projectStats = FOCUS_PROJECTS.map((name) => {
      const list = byProject[name];
      const amounts = list.map(twd);
      const total = Math.round(amounts.reduce((s, x) => s + x, 0));
      const byCat: Record<string, { amount: number; count: number }> = {};
      const byMonth: Record<string, number> = {};
      const byPay: Record<string, number> = {};

      for (const r of list) {
        const cat = `${r['分類'] || ''}/${r['子分類'] || ''}`;
        const a = twd(r);
        if (!byCat[cat]) byCat[cat] = { amount: 0, count: 0 };
        byCat[cat].amount += a;
        byCat[cat].count += 1;
        const m = `${ymd(r).slice(0, 4)}-${ymd(r).slice(4, 6)}`;
        byMonth[m] = (byMonth[m] || 0) + a;
        const pay = String(r['付款(轉出)'] || '');
        byPay[pay] = (byPay[pay] || 0) + a;
      }

      const catMix = Object.entries(byCat)
        .map(([cat, v]) => ({
          cat,
          amount: Math.round(v.amount),
          count: v.count,
          pct: Math.round((v.amount / (total || 1)) * 1000) / 10,
        }))
        .sort((a, b) => b.amount - a.amount);

      const months = Object.entries(byMonth)
        .map(([month, amount]) => ({ month, amount: Math.round(amount) }))
        .sort((a, b) => a.month.localeCompare(b.month));

      const monthAmts = months.map((m) => m.amount);
      const med = median(monthAmts);
      const topMonths = [...months].sort((a, b) => b.amount - a.amount).slice(0, 3);

      const topTx = [...list]
        .map((r) => ({
          date: ymd(r),
          amount: Math.round(twd(r)),
          cat: `${r['分類']}/${r['子分類']}`,
          pay: r['付款(轉出)'],
          merchant: extractMerchantName(r) || '',
          notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 70),
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 12);

      // —— 專案特定奇怪規則 ——
      const def = PROJECT_DEFINITION_BY_NAME[name];

      // 分類偏離：占比>5% 且命中 suspicious
      for (const c of catMix) {
        if (c.pct < 3) continue;
        if (def.suspiciousCategoryHints.some((re) => re.test(c.cat))) {
          // 例外：正常開銷的個人燃料稅
          if (name === '正常開銷' && /繳稅/.test(c.cat)) continue;
          weird.push({
            project: name,
            severity: c.pct >= 10 ? 'high' : 'medium',
            kind: 'unexpected_category',
            detail: `分類「${c.cat}」占 ${c.pct}%（$${c.amount.toLocaleString()} / ${c.count} 筆），與「${name}」定義較不符`,
            samples: list
              .filter((r) => `${r['分類']}/${r['子分類']}` === c.cat)
              .slice(0, 5)
              .map((r) => ({
                date: ymd(r),
                amount: Math.round(twd(r)),
                notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 50),
                merchant: extractMerchantName(r),
              })),
          });
        }
      }

      // 單筆相對月中位數過大（非資本專案）
      if (name === '共同開銷' || name === '正常開銷' || name === '住家支出') {
        const threshold = Math.max(med * 3, 15000);
        for (const t of topTx) {
          if (t.amount >= threshold) {
            weird.push({
              project: name,
              severity: t.amount >= med * 5 ? 'high' : 'medium',
              kind: 'large_vs_monthly_median',
              detail: `${t.date} $${t.amount.toLocaleString()} 遠高於月中位數 $${Math.round(med).toLocaleString()}（${t.cat}｜${t.merchant || t.notes || '無備註'}）`,
              samples: [t],
            });
          }
        }
      }

      // 重複金額大量出現（可能漏備註的固定費）
      const amtCount: Record<string, number> = {};
      for (const r of list) {
        const a = Math.round(twd(r));
        if (a < 500) continue;
        amtCount[String(a)] = (amtCount[String(a)] || 0) + 1;
      }
      const repeats = Object.entries(amtCount)
        .filter(([, n]) => n >= 6)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [amt, n] of repeats) {
        const sample = list.find((r) => Math.round(twd(r)) === Number(amt));
        weird.push({
          project: name,
          severity: 'info',
          kind: 'repeated_amount',
          detail: `金額 $${Number(amt).toLocaleString()} 出現 ${n} 次（可能是固定繳費；樣本備註：「${String(sample?.['備註'] || '').replace(/\s+/g, ' ').slice(0, 40) || '空白'}」）`,
        });
      }

      // 零金額
      const zeros = list.filter((r) => twd(r) === 0).length;
      if (zeros >= 5) {
        weird.push({
          project: name,
          severity: 'info',
          kind: 'zero_amount_rows',
          detail: `有 ${zeros} 筆金額為 0（分期／點數列？），可確認是否需保留`,
        });
      }

      return {
        name,
        total,
        count: list.length,
        medianMonthly: Math.round(med),
        monthCount: months.length,
        topCats: catMix.slice(0, 8),
        topMonths,
        topTx,
        payMix: Object.entries(byPay)
          .map(([pay, amount]) => ({ pay, amount: Math.round(amount) }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 6),
      };
    });

    // 跨專案：同商家出現在不該出現的專案
    const merchantProject: Record<string, Set<string>> = {};
    for (const name of FOCUS_PROJECTS) {
      for (const r of byProject[name]) {
        const m = (extractMerchantName(r) || '').trim();
        if (!m || /^(餐飲食品|居家生活|運輸交通|休閒娛樂|人情交際)-/.test(m)) continue;
        if (m.length < 4) continue;
        if (!merchantProject[m]) merchantProject[m] = new Set();
        merchantProject[m].add(name);
      }
    }

    // 專案特定人工規則
    // 1) 裝潢後期（2025-08後）仍有大額？
    {
      const late = byProject['裝潢家具'].filter((r) => ymd(r) >= '20250801' && twd(r) >= 10000);
      if (late.length) {
        weird.push({
          project: '裝潢家具',
          severity: 'medium',
          kind: 'late_large_spend',
          detail: `2025-08 後仍有 ${late.length} 筆 ≥$10,000（裝潢高峰應已過，確認是否為分期／追加）`,
          samples: late
            .map((r) => ({
              date: ymd(r),
              amount: Math.round(twd(r)),
              notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 60),
              merchant: extractMerchantName(r),
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 8),
        });
      }
    }

    // 2) 共同開銷：單筆購物過大
    {
      const shop = byProject['共同開銷'].filter((r) => {
        const cat = `${r['分類']}/${r['子分類']}`;
        return /Shopping|休閒娛樂/.test(cat) && twd(r) >= 8000;
      });
      if (shop.length) {
        weird.push({
          project: '共同開銷',
          severity: 'medium',
          kind: 'large_shared_shopping',
          detail: `共同開銷內休閒／Shopping ≥$8,000 有 ${shop.length} 筆（確認是否真為共同）`,
          samples: shop
            .map((r) => ({
              date: ymd(r),
              amount: Math.round(twd(r)),
              cat: `${r['分類']}/${r['子分類']}`,
              notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 60),
              merchant: extractMerchantName(r),
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10),
        });
      }
    }

    // 3) 婚禮寶典：非婚喪／送禮分類
    {
      const odd = byProject['婚禮寶典'].filter((r) => {
        const cat = String(r['分類'] || '');
        return !/人情交際/.test(cat) && twd(r) >= 1000;
      });
      if (odd.length) {
        weird.push({
          project: '婚禮寶典',
          severity: 'medium',
          kind: 'non_social_category',
          detail: `婚禮寶典有 ${odd.length} 筆非「人情交際」且 ≥$1,000`,
          samples: odd
            .map((r) => ({
              date: ymd(r),
              amount: Math.round(twd(r)),
              cat: `${r['分類']}/${r['子分類']}`,
              notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 60),
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 8),
        });
      }
    }

    // 4) 房屋購置：金額不是 15375 且不是頭期的
    {
      const odd = byProject['房屋購置'].filter((r) => {
        const a = Math.round(twd(r));
        const notes = String(r['備註'] || '');
        return a !== 15375 && !/頭期/.test(notes);
      });
      if (odd.length) {
        weird.push({
          project: '房屋購置',
          severity: 'medium',
          kind: 'non_mortgage_amount',
          detail: `房屋購置有 ${odd.length} 筆既非 $15,375 也非備註「頭期」`,
          samples: odd
            .map((r) => ({
              date: ymd(r),
              amount: Math.round(twd(r)),
              notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 60),
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10),
        });
      }
    }

    // 5) 住家支出：非預期分類
    {
      const odd = byProject['住家支出'].filter((r) => {
        const sub = String(r['子分類'] || '');
        return !/電費|水費|瓦斯|網路|管理費|繳稅|車位/.test(sub) && twd(r) >= 1000;
      });
      if (odd.length) {
        weird.push({
          project: '住家支出',
          severity: 'medium',
          kind: 'unexpected_household_sub',
          detail: `住家支出有 ${odd.length} 筆子分類不像公用事業／稅／管理費`,
          samples: odd
            .map((r) => ({
              date: ymd(r),
              amount: Math.round(twd(r)),
              cat: `${r['分類']}/${r['子分類']}`,
              notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 60),
              merchant: extractMerchantName(r),
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10),
        });
      }
    }

    // 6) 正常開銷：房屋支出／管理費等
    {
      const odd = byProject['正常開銷'].filter((r) => {
        const cat = `${r['分類']}/${r['子分類']}`;
        const notes = String(r['備註'] || '');
        if (/燃料稅|個人燃料|牌照稅/.test(notes)) return false;
        return /房屋支出|管理費|網路費|電費|水費|瓦斯/.test(cat);
      });
      if (odd.length) {
        weird.push({
          project: '正常開銷',
          severity: 'high',
          kind: 'household_in_personal',
          detail: `正常開銷仍有 ${odd.length} 筆像住家固定費`,
          samples: odd
            .map((r) => ({
              date: ymd(r),
              amount: Math.round(twd(r)),
              cat: `${r['分類']}/${r['子分類']}`,
              notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 60),
            }))
            .sort((a, b) => b.amount - a.amount),
        });
      }
    }

    // 7) 月異常解讀
    for (const p of projectStats) {
      for (const m of p.topMonths) {
        if (p.medianMonthly > 0 && m.amount >= p.medianMonthly * 3 && m.amount >= 25000) {
          const monthRows = byProject[p.name].filter((r) => ymd(r).startsWith(m.month.replace('-', '')));
          const top = [...monthRows]
            .map((r) => ({
              date: ymd(r),
              amount: Math.round(twd(r)),
              notes: String(r['備註'] || '').replace(/\s+/g, ' ').slice(0, 50),
              merchant: extractMerchantName(r),
              cat: `${r['分類']}/${r['子分類']}`,
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
          weird.push({
            project: p.name,
            severity: 'info',
            kind: 'spike_month',
            detail: `${m.month} 月支出 $${m.amount.toLocaleString()}（月中位數 $${p.medianMonthly.toLocaleString()}）`,
            samples: top,
          });
        }
      }
    }

    // dedupe similar
    const seen = new Set<string>();
    const weirdUnique = weird.filter((w) => {
      const key = `${w.project}|${w.kind}|${w.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const report = {
      from,
      asOf,
      projectStats,
      weird: weirdUnique.sort((a, b) => {
        const s = { high: 0, medium: 1, info: 2 };
        return s[a.severity] - s[b.severity] || a.project.localeCompare(b.project);
      }),
    };

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

    // eslint-disable-next-line no-console
    console.log(
      `\n[project-health] ${OUT}\n` +
        projectStats.map((p) => `${p.name}: $${p.total} / ${p.count}筆 / 月中位$${p.medianMonthly}`).join('\n') +
        `\nweird=${weirdUnique.length}\n` +
        weirdUnique
          .slice(0, 40)
          .map((w) => `[${w.severity}] ${w.project} ${w.kind}: ${w.detail}`)
          .join('\n')
    );

    expect(projectStats.length).toBe(6);
  });
});
