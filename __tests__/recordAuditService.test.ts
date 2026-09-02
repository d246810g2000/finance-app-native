import {
  auditRecords,
  previewSingleRecordFix,
  applySingleRecordFix,
} from '../services/recordAuditService';
import type { RawRecord } from '../types';

function expense(partial: Partial<RawRecord> = {}): RawRecord {
  return {
    id: 'test-1',
    Id: 'test-1',
    '日期': '20250301',
    '分類': '汽機車',
    '子分類': '停車費',
    '金額': '30',
    '付款(轉出)': '現金',
    '收款(轉入)': '',
    '備註': '發票號碼:MM77565449 n 商家:百分之三十茶行 n 丰潤紅茶',
    '專案': '正常開銷',
    ...partial,
  } as RawRecord;
}

describe('recordAuditService', () => {
  it('flags tea shop misclassified as parking', () => {
    const summary = auditRecords([expense()], { limit: 10 });
    const mismatch = summary.findings.find((f) => f.kind === 'category_mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.suggestCategory).toBe('餐飲食品');
    expect(mismatch?.affectsBalance).toBe(false);
  });

  it('does not suggest 住家支出 for 電費 before project adoption date', () => {
    const oldBill: RawRecord = {
      id: 'elec-old',
      '日期': '20230505',
      '分類': '居家生活',
      '子分類': '電費',
      '金額': '968',
      '付款(轉出)': '現金',
      '收款(轉入)': '',
      '專案': '正常開銷',
    } as RawRecord;
    const summary = auditRecords([oldBill], { limit: 20 });
    const wrongProj = summary.findings.filter((f) => f.kind === 'wrong_project');
    expect(wrongProj.length).toBe(0);
  });

  it('suggests 住家支出 for 電費 after project adoption date', () => {
    const newBill: RawRecord = {
      id: 'elec-new',
      '日期': '20240815',
      '分類': '居家生活',
      '子分類': '電費',
      '金額': '500',
      '付款(轉出)': '現金',
      '收款(轉入)': '',
      '專案': '正常開銷',
    } as RawRecord;
    const summary = auditRecords([newBill], { limit: 20 });
    const wrongProj = summary.findings.find((f) => f.kind === 'wrong_project');
    expect(wrongProj?.suggestProject).toBe('住家支出');
  });

  it('does not suggest 裝潢家具 for 2023 房屋支出 on 正常開銷', () => {
    const old: RawRecord = {
      id: 'old-house',
      '日期': '20230625',
      '分類': '居家生活',
      '子分類': '房屋支出',
      '金額': '20618',
      '付款(轉出)': '台新 GoGo 卡',
      '收款(轉入)': '',
      '專案': '正常開銷',
    } as RawRecord;
    const summary = auditRecords([old], { limit: 20 });
    expect(summary.findings.filter((f) => f.kind === 'wrong_project').length).toBe(0);
    expect(summary.findings.filter((f) => f.kind === 'suspicious_category').length).toBe(0);
  });

  it('does not flag 電費 on 正常開銷 as suspicious before 住家支出 adoption', () => {
    const oldBill: RawRecord = {
      id: 'elec-susp',
      '日期': '20230505',
      '分類': '居家生活',
      '子分類': '電費',
      '金額': '968',
      '付款(轉出)': '現金',
      '收款(轉入)': '',
      '專案': '正常開銷',
    } as RawRecord;
    const summary = auditRecords([oldBill], { limit: 20 });
    expect(summary.findings.filter((f) => f.kind === 'suspicious_category').length).toBe(0);
  });

  it('does not flag investment income on 正常開銷 as wrong project', () => {
    const income: RawRecord = {
      id: 'inc-1',
      '日期': '20250301',
      '分類': '投資收入',
      '子分類': '利息',
      '金額': '100',
      '收款(轉入)': '銀行',
      '付款(轉出)': '',
      '專案': '正常開銷',
    } as RawRecord;
    const summary = auditRecords([income], { limit: 20 });
    const wrongProj = summary.findings.filter((f) => f.kind === 'wrong_project');
    expect(wrongProj.length).toBe(0);
  });

  it('previewSingleRecordFix marks safe fields as not affecting balance', () => {
    const records = [expense()];
    const preview = previewSingleRecordFix(records, {
      recordId: 'test-1',
      field: '分類',
      newValue: '餐飲食品',
    });
    expect(preview?.affectsBalance).toBe(false);
  });

  it('applySingleRecordFix only allows safe fields', () => {
    const record = expense();
    const updated = applySingleRecordFix(record, {
      recordId: 'test-1',
      field: '子分類',
      newValue: '飲料',
    });
    expect(updated['子分類']).toBe('飲料');
    expect(() =>
      applySingleRecordFix(record, {
        recordId: 'test-1',
        field: '金額' as '分類',
        newValue: '999',
      }),
    ).toThrow();
  });
});
