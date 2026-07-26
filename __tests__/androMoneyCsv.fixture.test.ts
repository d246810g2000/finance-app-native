/**
 * 本機以 data/AndroMoney.csv 驗證匯入解析（該路徑已 gitignore，勿提交真實消費資料）。
 * 檔案不存在時整組 skip。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  parseCsvData,
  extractMerchantName,
  analyzeImport,
  transformRecord,
  upsertRecordsById,
  summarizePersonalVsSharedBurden,
  computeProjectLifecycles,
  resolveExpenseSplitFactor,
  aggregateMerchants,
  aggregateInvoiceProducts,
  parseInvoiceProducts,
  shortenMerchantName,
} from '../services/financeService';
import { aggregateTravelProjects, rankTravelSpendByYear } from '../services/shared';
import { RawRecord } from '../types';

const FIXTURE_PATH = path.join(__dirname, '..', 'data', 'AndroMoney.csv');
const fixtureExists = fs.existsSync(FIXTURE_PATH);

const describeFixture = fixtureExists ? describe : describe.skip;

describeFixture('AndroMoney.csv fixture（data/AndroMoney.csv）', () => {
  let csvText: string;
  let rows: RawRecord[];

  beforeAll(() => {
    csvText = fs.readFileSync(FIXTURE_PATH, 'utf8');
    rows = parseCsvData(csvText);
  });

  it('解析出預期規模的資料列', () => {
    // 6650 行檔案 = 1 meta + 1 header + 6648 data（含 SYSTEM）
    expect(rows.length).toBeGreaterThanOrEqual(6600);
    expect(rows.length).toBeLessThanOrEqual(6700);
  });

  it('表頭欄位對應正確且穩定 id 來自 uid', () => {
    const sample = rows.find((r) => r['分類'] !== 'SYSTEM');
    expect(sample).toBeTruthy();
    expect(sample!['日期']).toMatch(/^\d{8}$/);
    expect(sample!).toHaveProperty('付款(轉出)');
    expect(sample!).toHaveProperty('收款(轉入)');
    expect(sample!).toHaveProperty('商家(公司)');
    expect(sample!).toHaveProperty('備註');
    expect(sample!).toHaveProperty('專案');
    expect(sample!.uid || sample!['uid']).toBeTruthy();
    expect(sample!.id).toBe(String(sample!.uid || sample!['uid']));
  });

  it('所有 id 唯一（可做增量合併鍵）', () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('商家(公司) 欄幾乎全空，但備註可抽出商家', () => {
    const nonSystem = rows.filter((r) => r['分類'] !== 'SYSTEM');
    const fieldFilled = nonSystem.filter((r) => (r['商家(公司)'] || '').trim()).length;
    expect(fieldFilled).toBeLessThan(50);

    const withMerchantInNotes = nonSystem.filter((r) => {
      const n = r['備註'] || '';
      return n.includes('商家:') || n.includes('商家：');
    });
    expect(withMerchantInNotes.length).toBeGreaterThan(1800);

    let extractedOk = 0;
    let looksLikeInvoiceBlob = 0;
    for (const r of withMerchantInNotes) {
      const name = extractMerchantName(r);
      if (!name) continue;
      if (name.startsWith('發票號碼')) {
        looksLikeInvoiceBlob += 1;
        continue;
      }
      // 不應再退化成超長發票字串
      expect(name.length).toBeLessThan(80);
      expect(name.includes(' n ')).toBe(false);
      extractedOk += 1;
    }

    expect(extractedOk).toBeGreaterThan(1800);
    expect(looksLikeInvoiceBlob).toBe(0);
  });

  it('transform 後商家欄位多數來自備註抽取', () => {
    let merchantCount = 0;
    let categoryFallback = 0;
    for (const r of rows) {
      const t = transformRecord(r);
      if (!t) continue;
      const list = Array.isArray(t) ? t : [t];
      for (const row of list) {
        const m = row['商家'] || '';
        if (!m) continue;
        merchantCount += 1;
        if (/^(餐飲食品|居家生活|運輸交通|休閒娛樂)-/.test(m)) categoryFallback += 1;
        expect(m.startsWith('發票號碼')).toBe(false);
      }
    }
    expect(merchantCount).toBeGreaterThan(2000);
    // 備註抽取修好後，分類後備應遠少於備註成功數
    expect(categoryFallback).toBeLessThan(merchantCount * 0.5);
  });

  it('analyzeImport 報告數字合理', () => {
    const report = analyzeImport(rows);
    expect(report.totalRows).toBe(rows.length);
    expect(report.systemSkipped).toBeGreaterThan(30);
    expect(report.importableRows).toBe(report.totalRows - report.systemSkipped);
    expect(report.merchantFromField).toBeLessThan(50);
    expect(report.merchantFromNotes).toBeGreaterThan(1800);
    expect(report.unmappedAccounts).toEqual([]);
    expect(report.uniqueProjects).toBeGreaterThan(10);
    expect(report.dateMin).toBeTruthy();
    expect(report.dateMax).toBeTruthy();
  });

  it('uid upsert：更新既有、新增新列、保留本機多出的', () => {
    const existing = rows.slice(0, 20);
    const incoming = [
      { ...rows[10], '備註': 'UPDATED_BY_TEST' },
      { ...rows[20], '備註': 'NEW_OR_UPDATE' },
    ];
    const result = upsertRecordsById(existing, incoming);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(result.removed).toBe(0);
    expect(result.records.find((r) => r.id === rows[10].id)?.['備註']).toBe('UPDATED_BY_TEST');
    expect(result.records.length).toBeGreaterThanOrEqual(20);
  });

  it('syncDelete 會移除 CSV 沒有的本機 id', () => {
    const existing = rows.slice(0, 30);
    const incoming = rows.slice(10, 25);
    const result = upsertRecordsById(existing, incoming, { syncDelete: true });
    expect(result.removed).toBeGreaterThan(0);
    const incomingIds = new Set(incoming.map((r) => r.id));
    result.records.forEach((r) => {
      expect(incomingIds.has(r.id)).toBe(true);
    });
  });

  it('商家聚合與短名', () => {
    const list = aggregateMerchants(rows, null, null);
    expect(list.length).toBeGreaterThan(50);
    expect(list[0].total).toBeGreaterThan(0);
    const short = shortenMerchantName(
      '台灣中油股份有限公司油品行銷事業部竹苗營業處科學園區加油站'
    );
    expect(short.length).toBeLessThan(30);
    expect(short.includes('加油站')).toBe(true);
  });

  it('發票品項解析與聚合', () => {
    const sample = parseInvoiceProducts(
      '發票號碼:AA n 商家:測試店 n 丰潤紅茶[NT$30.0000] x 2.0000'
    );
    expect(sample.length).toBe(1);
    expect(sample[0].name).toContain('丰潤紅茶');
    expect(sample[0].lineTotal).toBe(60);

    const products = aggregateInvoiceProducts(rows, null, null);
    expect(products.length).toBeGreaterThan(20);
    expect(products[0].count).toBeGreaterThan(0);
  });

  it('旅遊年度花費排名', () => {
    const projects = aggregateTravelProjects(rows);
    const years = rankTravelSpendByYear(projects);
    expect(years.length).toBeGreaterThanOrEqual(1);
    expect(years[0].tripCount).toBeGreaterThan(0);
    expect(years[0].totalExpense).toBeGreaterThan(0);
  });

  it('個人 vs 共同負擔彙總（共同開銷 50%）', () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 11, 31, 23, 59, 59);
    const summary = summarizePersonalVsSharedBurden(rows, start, end, {
      splitProjects: ['共同開銷'],
    });
    expect(summary.personalFull + summary.sharedShare).toBeGreaterThan(0);
    expect(summary.sharedGross).toBeGreaterThanOrEqual(summary.sharedShare);
    // 共同開銷存在時，sharedShare 應約為 gross 的一半
    if (summary.sharedCount > 0) {
      expect(summary.sharedShare).toBe(Math.round(summary.sharedGross * 0.5) || summary.sharedShare);
      // 允許四捨五入：share ≈ gross/2
      expect(Math.abs(summary.sharedShare * 2 - summary.sharedGross)).toBeLessThanOrEqual(1);
    }
  });

  it('分帳係數不會對共同開銷＋共享帳戶疊加成 0.25', () => {
    const factor = resolveExpenseSplitFactor('共同開銷', '共享樂天帳戶', {
      splitProjects: ['共同開銷'],
      isSplitShared: true,
    });
    expect(factor).toBe(0.5);
  });

  it('大額專案生命週期含裝潢／房屋／婚禮等', () => {
    const lives = computeProjectLifecycles(rows, true);

    const names = lives.map((l) => l.name);
    expect(names).toEqual(expect.arrayContaining(['裝潢家具', '正常開銷', '共同開銷']));

    const reno = lives.find((l) => l.name === '裝潢家具');
    expect(reno).toBeTruthy();
    expect(reno!.totalExpense).toBeGreaterThan(100_000);
    expect(reno!.monthSpan).toBeGreaterThanOrEqual(2);
    expect(reno!.monthlySpend.length).toBeGreaterThan(0);

    // 旅遊專案應被 excludeTravel 排除
    expect(names.some((n) => /^\d{6}-/.test(n))).toBe(false);
  });
});

describe('AndroMoney fixture gate', () => {
  it('提醒：請放置 data/AndroMoney.csv 作為固定驗證檔', () => {
    if (!fixtureExists) {
      console.warn(
        `[skip] 找不到 ${FIXTURE_PATH}。請將 AndroMoney 匯出檔放在 data/AndroMoney.csv 後再跑測試。`
      );
    }
    expect(true).toBe(true);
  });
});
