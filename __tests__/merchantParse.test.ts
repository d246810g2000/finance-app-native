import {
  normalizeNoteLines,
  extractMerchantName,
  upsertRecordsById,
  resolveExpenseSplitFactor,
  parseCsvData,
} from '../services/financeService';
import { RawRecord } from '../types';

describe('normalizeNoteLines', () => {
  it('splits literal space-n-space used by AndroMoney exports', () => {
    const lines = normalizeNoteLines(
      '發票號碼:MM77565449 n 商家:百分之三十茶行 n 丰潤紅茶[NT$30.0000] x 1.0000'
    );
    expect(lines).toEqual([
      '發票號碼:MM77565449',
      '商家:百分之三十茶行',
      '丰潤紅茶[NT$30.0000] x 1.0000',
    ]);
  });

  it('also handles real newlines and escaped \\n', () => {
    expect(normalizeNoteLines('商家:甲\\n品項A')).toEqual(['商家:甲', '品項A']);
    expect(normalizeNoteLines('商家:乙\n品項B')).toEqual(['商家:乙', '品項B']);
  });
});

describe('extractMerchantName', () => {
  it('extracts merchant from invoice notes with literal n separators', () => {
    const record = {
      '商家(公司)': '',
      '備註': '發票號碼:LY68223885 n 商家:家城股份有限公司竹科店 n 餐品[NT$114] x 1',
      '分類': '餐飲食品',
      '子分類': '飲料',
    } as RawRecord;
    expect(extractMerchantName(record)).toBe('家城股份有限公司竹科店');
  });

  it('prefers explicit 商家(公司) field', () => {
    const record = {
      '商家(公司)': '7-ELEVEN',
      '備註': '商家:忽略我',
      '分類': '餐飲食品',
    } as RawRecord;
    expect(extractMerchantName(record)).toBe('7-ELEVEN');
  });
});

describe('resolveExpenseSplitFactor', () => {
  it('applies project split only once even if account is also shared', () => {
    const factor = resolveExpenseSplitFactor('共同開銷', '共享樂天帳戶', {
      splitProjects: ['共同開銷'],
      isSplitShared: true,
    });
    expect(factor).toBe(0.5);
  });

  it('falls back to shared-account split when project is not in list', () => {
    const factor = resolveExpenseSplitFactor('正常開銷', '共享樂天帳戶', {
      splitProjects: ['共同開銷'],
      isSplitShared: true,
    });
    expect(factor).toBe(0.5);
  });
});

describe('parseCsvData + upsertRecordsById', () => {
  it('uses uid as stable id', () => {
    const csv = [
      '"meta","AndroMoney","20260101"',
      '"Id","幣別","金額","分類","子分類","日期","付款(轉出)","收款(轉入)","備註","Periodic","專案","商家(公司)","uid","時間"',
      '"1","TWD","100","餐飲食品","午餐","20260101","現金","","","","正常開銷","","UID-AAA","1200"',
    ].join('\n');
    const rows = parseCsvData(csv);
    expect(rows[0].id).toBe('UID-AAA');
  });

  it('merges by id without dropping local-only rows', () => {
    const existing: RawRecord[] = [
      { id: 'A', '日期': '20260101', '分類': '餐飲食品' } as RawRecord,
      { id: 'B', '日期': '20260102', '分類': '餐飲食品' } as RawRecord,
    ];
    const incoming: RawRecord[] = [
      { id: 'B', '日期': '20260102', '分類': '居家生活', '金額': '50' } as RawRecord,
      { id: 'C', '日期': '20260103', '分類': '運輸交通' } as RawRecord,
    ];
    const result = upsertRecordsById(existing, incoming);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.records).toHaveLength(3);
    expect(result.records.find((r) => r.id === 'B')?.['分類']).toBe('居家生活');
    expect(result.records.find((r) => r.id === 'A')).toBeTruthy();
  });

  it('syncDelete drops local-only ids', () => {
    const existing: RawRecord[] = [
      { id: 'A', '日期': '20260101', '分類': '餐飲食品' } as RawRecord,
      { id: 'B', '日期': '20260102', '分類': '餐飲食品' } as RawRecord,
    ];
    const incoming: RawRecord[] = [
      { id: 'B', '日期': '20260102', '分類': '居家生活' } as RawRecord,
    ];
    const result = upsertRecordsById(existing, incoming, { syncDelete: true });
    expect(result.removed).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].id).toBe('B');
  });
});
