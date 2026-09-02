import * as fs from 'fs';
import * as path from 'path';
import { parseCsvData } from '../services/financeService';
import {
  ANDRO_MONEY_CSV_HEADERS,
  recordToAndroMoneyRow,
  serializeAndroMoneyCsv,
} from '../services/androMoneyCsvExport';
import type { RawRecord } from '../types';

const FIXTURE_PATH = path.join(__dirname, '..', 'data', 'AndroMoney.csv');
const DESKTOP_PATH = path.join(process.env.HOME || '', 'Desktop', 'AndroMoney.csv');
const fixturePath = fs.existsSync(FIXTURE_PATH) ? FIXTURE_PATH : DESKTOP_PATH;
const fixtureExists = fs.existsSync(fixturePath);

const describeFixture = fixtureExists ? describe : describe.skip;

describe('androMoneyCsvExport', () => {
  it('uses AndroMoney header columns', () => {
    expect(ANDRO_MONEY_CSV_HEADERS).toEqual([
      'Id', '幣別', '金額', '分類', '子分類', '日期', '付款(轉出)', '收款(轉入)',
      '備註', 'Periodic', '專案', '商家(公司)', 'uid', '時間',
    ]);
  });

  it('maps a raw record to AndroMoney row shape', () => {
    const record = {
      id: 'abc123uid',
      Id: '42',
      '幣別': 'TWD',
      '金額': '100',
      '分類': '餐飲食品',
      '子分類': '午餐',
      '日期': '20260815',
      '付款(轉出)': '玉山 Unicard',
      '收款(轉入)': '',
      '備註': '測試',
      'Periodic': '',
      '專案': '正常開銷',
      '商家(公司)': '',
      uid: 'abc123uid',
      '時間': '14:30',
    } as RawRecord;

    expect(recordToAndroMoneyRow(record)).toMatchObject({
      Id: '42',
      uid: 'abc123uid',
      時間: '1430',
      分類: '餐飲食品',
      日期: '20260815',
    });
  });

  it('includes Google Documents meta line', () => {
    const csv = serializeAndroMoneyCsv([], { exportDate: new Date('2026-08-29T12:00:00+08:00') });
    expect(csv.startsWith('"Google Documents","理財幫手AndroMoney","20260829"\n')).toBe(true);
  });
});

describeFixture('AndroMoney CSV round-trip', () => {
  let originalText: string;
  let rows: RawRecord[];

  beforeAll(() => {
    originalText = fs.readFileSync(fixturePath, 'utf8');
    rows = parseCsvData(originalText);
  });

  it('re-exports same row count and stable ids', () => {
    const exported = serializeAndroMoneyCsv(rows, { exportDate: new Date('2026-08-29T12:00:00+08:00') });
    const roundTripped = parseCsvData(exported);
    expect(roundTripped.length).toBe(rows.length);
    expect(new Set(roundTripped.map((r) => r.id))).toEqual(new Set(rows.map((r) => r.id)));
  });

  it('preserves key fields for non-SYSTEM sample rows', () => {
    const sample = rows.filter((r) => r['分類'] !== 'SYSTEM').slice(0, 200);
    const exported = serializeAndroMoneyCsv(sample, { exportDate: new Date('2026-08-29T12:00:00+08:00') });
    const roundTripped = parseCsvData(exported);
    const byId = new Map(roundTripped.map((r) => [r.id, r]));

    for (const orig of sample) {
      const back = byId.get(orig.id);
      expect(back).toBeTruthy();
      expect(back!['分類']).toBe(orig['分類']);
      expect(back!['子分類']).toBe(orig['子分類']);
      expect(back!['金額']).toBe(String(orig['金額']));
      expect(back!['付款(轉出)']).toBe(orig['付款(轉出)'] || '');
      expect(back!['收款(轉入)']).toBe(orig['收款(轉入)'] || '');
      expect(back!['備註']).toBe(orig['備註'] || '');
      expect(back!['專案']).toBe(orig['專案'] || '');
      expect(back!['Periodic']).toBe(orig['Periodic'] || '');
    }
  });
});
