import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { RawRecord } from '../types';
import { zeroPadDate } from '../utils/dateUtils';

/** AndroMoney Google 匯出表頭（與 Desktop AndroMoney.csv 一致） */
export const ANDRO_MONEY_CSV_HEADERS = [
  'Id',
  '幣別',
  '金額',
  '分類',
  '子分類',
  '日期',
  '付款(轉出)',
  '收款(轉入)',
  '備註',
  'Periodic',
  '專案',
  '商家(公司)',
  'uid',
  '時間',
] as const;

export type AndroMoneyCsvHeader = (typeof ANDRO_MONEY_CSV_HEADERS)[number];

export type SerializeAndroMoneyCsvOptions = {
  /** 預設為匯出當日 */
  exportDate?: Date;
};

function strField(record: RawRecord, key: string): string {
  const v = record[key];
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function formatExportDate(raw: string | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(0, 8);
  return zeroPadDate(raw).replace(/\D/g, '').slice(0, 8);
}

/** AndroMoney 使用 HHMM；App 內可能存 HH:MM */
function formatExportTime(raw: string | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(0, 4);
  return '';
}

function resolveAndroMoneyId(record: RawRecord): string {
  const explicit = strField(record, 'Id');
  if (explicit) return explicit;
  const id = strField(record, 'id');
  if (/^\d+$/.test(id)) return id;
  return '';
}

function resolveAndroMoneyUid(record: RawRecord): string {
  return strField(record, 'uid') || strField(record, 'id');
}

function compareExportOrder(a: RawRecord, b: RawRecord): number {
  const aSystem = strField(a, '分類') === 'SYSTEM' ? 0 : 1;
  const bSystem = strField(b, '分類') === 'SYSTEM' ? 0 : 1;
  if (aSystem !== bSystem) return aSystem - bSystem;

  const dateA = formatExportDate(strField(a, '日期'));
  const dateB = formatExportDate(strField(b, '日期'));
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  const idA = resolveAndroMoneyId(a);
  const idB = resolveAndroMoneyId(b);
  const numA = /^\d+$/.test(idA) ? Number(idA) : Number.NaN;
  const numB = /^\d+$/.test(idB) ? Number(idB) : Number.NaN;
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
  return idA.localeCompare(idB);
}

export function escapeAndroMoneyCsvField(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function recordToAndroMoneyRow(record: RawRecord): Record<AndroMoneyCsvHeader, string> {
  const category = strField(record, '分類') || strField(record, '主類別');
  return {
    Id: resolveAndroMoneyId(record),
    幣別: strField(record, '幣別') || 'TWD',
    金額: strField(record, '金額'),
    分類: category,
    子分類: strField(record, '子分類'),
    日期: formatExportDate(strField(record, '日期')),
    '付款(轉出)': strField(record, '付款(轉出)'),
    '收款(轉入)': strField(record, '收款(轉入)'),
    備註: strField(record, '備註'),
    Periodic: strField(record, 'Periodic'),
    專案: strField(record, '專案'),
    '商家(公司)': strField(record, '商家(公司)'),
    uid: resolveAndroMoneyUid(record),
    時間: formatExportTime(strField(record, '時間')),
  };
}

export function serializeAndroMoneyCsv(
  records: RawRecord[],
  options: SerializeAndroMoneyCsvOptions = {},
): string {
  const exportDate = options.exportDate ?? new Date();
  const y = exportDate.getFullYear();
  const m = String(exportDate.getMonth() + 1).padStart(2, '0');
  const d = String(exportDate.getDate()).padStart(2, '0');
  const metaLine = `"Google Documents","理財幫手AndroMoney","${y}${m}${d}"`;
  const headerLine = ANDRO_MONEY_CSV_HEADERS.join(',');

  const sorted = [...records].sort(compareExportOrder);
  const body = sorted.map((record) => {
    const row = recordToAndroMoneyRow(record);
    return ANDRO_MONEY_CSV_HEADERS.map((key) => escapeAndroMoneyCsvField(row[key])).join(',');
  });

  return [metaLine, headerLine, ...body].join('\n') + '\n';
}

/** 匯出 AndroMoney 相容 CSV 並開啟系統分享（可存檔後匯入 AndroMoney App） */
export async function shareAndroMoneyCsv(
  records: RawRecord[],
  options: SerializeAndroMoneyCsvOptions = {},
): Promise<void> {
  const csvContent = serializeAndroMoneyCsv(records, options);
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, '0');
  const d = String(stamp.getDate()).padStart(2, '0');
  const fileName = `AndroMoney_${y}${m}${d}.csv`;

  try {
    const fileUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory || '') + fileName;
    if (!fileUri) {
      throw new Error('無法取得本機儲存路徑');
    }

    await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: '匯出 AndroMoney CSV',
        UTI: 'public.comma-separated-values-text',
      });
      return;
    }

    if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    throw new Error('此裝置不支援分享或下載');
  } catch (error) {
    console.error('AndroMoney export error:', error);
    throw error instanceof Error ? error : new Error('匯出失敗');
  }
}
