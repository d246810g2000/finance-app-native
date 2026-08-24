import {
  normalizeTransaction,
} from '../services/core/transactionNormalization';
import { resolveExpenseSplitFactor } from '../services/core/attribution';

describe('finance core normalization', () => {
  it('normalizes income, expense, transfer, and special records', () => {
    const base = {
      id: 'tx-1',
      '日期': '2026/07/02',
      '時間': '0930',
      '分類': '',
      '子分類': '',
      '金額': '1,000',
      '幣別': 'USD',
      '專案': '日常',
    };

    expect(normalizeTransaction({ ...base, '收款(轉入)': '現金' })).toMatchObject({
      id: 'tx-1',
      kind: 'income',
      amountTwd: 32276,
      dateKey: '2026-07-02',
    });
    expect(
      normalizeTransaction({ ...base, '付款(轉出)': '現金', '幣別': 'TWD' })
    ).toMatchObject({ kind: 'expense', amountTwd: 1000 });
    expect(
      normalizeTransaction({
        ...base,
        '收款(轉入)': '將來銀行',
        '付款(轉出)': '現金',
        '幣別': 'TWD',
      })
    ).toMatchObject({ kind: 'transfer' });
    expect(
      normalizeTransaction({
        ...base,
        '付款(轉出)': '現金',
        '分類': '代付',
        '幣別': 'TWD',
      })
    ).toMatchObject({ kind: 'special', splitFactor: 1 });
  });

  it('applies shared-account splitting only once and lets project splitting win', () => {
    const shared = normalizeTransaction({
      '日期': '20260702',
      '分類': '餐飲',
      '金額': '1000',
      '幣別': 'TWD',
      '付款(轉出)': '共享樂天帳戶',
    }, { isSplitShared: true });

    const projectWins = normalizeTransaction({
      '日期': '20260702',
      '分類': '餐飲',
      '金額': '1000',
      '幣別': 'TWD',
      '專案': '共同開銷',
      '付款(轉出)': '現金',
    }, { splitProjects: ['共同開銷'], isSplitShared: true });

    expect(shared.splitFactor).toBe(0.5);
    expect(projectWins.splitFactor).toBe(0.5);
    expect(resolveExpenseSplitFactor('共同開銷', '小伊帳戶', {
      splitProjects: ['共同開銷'],
      isSplitShared: true,
    })).toBe(0.5);
  });
});
