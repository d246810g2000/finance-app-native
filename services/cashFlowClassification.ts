/**
 * 依「分類」區分投資 vs 生活現金流（不看專案欄）。
 * 利息標在「正常開銷」仍算投資收入，不會被當成生活支出。
 */

export const INVESTMENT_INCOME_CATEGORIES = new Set(['投資收入']);
export const INVESTMENT_EXPENSE_CATEGORIES = new Set(['理財投資']);
export const INVESTMENT_FEE_SUBCATEGORIES = new Set(['轉帳費用']);

export type CashFlowBucket = 'investment' | 'living' | 'neutral';

export function classifyCashFlowBucket(
  recordType: '收入' | '支出' | string | undefined,
  mainCategory: string,
  subCategory = '',
): CashFlowBucket {
  const cat = (mainCategory || '').trim();
  const sub = (subCategory || '').trim();

  if (recordType === '收入') {
    if (INVESTMENT_INCOME_CATEGORIES.has(cat)) return 'investment';
    if (cat === '一般收入') return 'living';
    return 'living';
  }

  if (recordType === '支出') {
    if (INVESTMENT_EXPENSE_CATEGORIES.has(cat)) return 'investment';
    if (cat === '費用' && INVESTMENT_FEE_SUBCATEGORIES.has(sub)) return 'investment';
    return 'living';
  }

  return 'neutral';
}

export type CashFlowSplit = {
  livingIncome: number;
  investmentIncome: number;
  livingExpense: number;
  investmentExpense: number;
  livingNet: number;
  investmentNet: number;
};

export function emptyCashFlowSplit(): CashFlowSplit {
  return {
    livingIncome: 0,
    investmentIncome: 0,
    livingExpense: 0,
    investmentExpense: 0,
    livingNet: 0,
    investmentNet: 0,
  };
}

export function accumulateCashFlowSplit(
  split: CashFlowSplit,
  recordType: '收入' | '支出' | string | undefined,
  mainCategory: string,
  amount: number,
  subCategory = '',
): CashFlowSplit {
  const abs = Math.abs(amount);
  const bucket = classifyCashFlowBucket(recordType, mainCategory, subCategory);

  if (recordType === '收入') {
    if (bucket === 'investment') split.investmentIncome += abs;
    else split.livingIncome += abs;
  } else if (recordType === '支出') {
    if (bucket === 'investment') split.investmentExpense += abs;
    else split.livingExpense += abs;
  }

  split.livingNet = split.livingIncome - split.livingExpense;
  split.investmentNet = split.investmentIncome - split.investmentExpense;
  return split;
}
