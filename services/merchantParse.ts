import type { RawRecord } from '../types';

/** 正規化備註換行：真換行、\\n、以及 AndroMoney 常見的字面「 n 」 */
export function normalizeNoteLines(notes: string): string[] {
  if (!notes) return [];
  return notes
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\s+n\s+/gi, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 從商家欄或備註抽取顯示用商家名稱 */
export function extractMerchantName(record: RawRecord): string {
  const finalMerchant = record['商家(公司)'];
  const originalNotes = record['備註'] || '';

  if (finalMerchant && finalMerchant.trim() !== '') {
    return finalMerchant.trim();
  }

  const noteLines = normalizeNoteLines(originalNotes);
  for (const line of noteLines) {
    if (line.startsWith('商家:')) {
      return line.substring('商家:'.length).trim();
    }
    if (line.startsWith('商家：')) {
      return line.substring('商家：'.length).trim();
    }
  }

  const inlineMatch = originalNotes.match(/商家[:：]\s*([^\n]+?)(?:\s+n\s+|$)/i);
  if (inlineMatch?.[1]) {
    return inlineMatch[1].replace(/\\n.*/s, '').trim();
  }

  if (originalNotes.trim()) {
    const firstLine = (noteLines[0] || originalNotes.trim()).trim();
    const paymentPrefixes = ['Line Pay', '街口', '台灣Pay', '悠遊付', '全支付', 'Uber Eats', 'Foodpanda', 'Uber'];
    for (const prefix of paymentPrefixes) {
      const regex = new RegExp(`^${prefix}[\\s-]*[:：\\-]?\\s*(.*)`, 'i');
      const match = firstLine.match(regex);
      if (match && match[1] && match[1].trim().length > 0) {
        return `${match[1].trim()} (${prefix})`;
      }
    }

    const isNumeric = /^\d+$/.test(firstLine);
    if (firstLine.length > 0 && firstLine.length < 20 && !isNumeric && !firstLine.startsWith('發票號碼')) {
      return firstLine;
    }
    if (firstLine.length >= 20 && firstLine.length <= 40 && !firstLine.startsWith('發票號碼')) {
      return firstLine;
    }
  }

  const category = record['分類'] || record['主類別'];
  const subCategory = record['子分類'];
  if (category && category !== 'SYSTEM' && category.trim() !== '') {
    if (subCategory && subCategory.trim() !== '') {
      return `${category}-${subCategory}`;
    }
    return category;
  }

  return '';
}
