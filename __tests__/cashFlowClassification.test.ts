import {
  classifyCashFlowBucket,
  accumulateCashFlowSplit,
  emptyCashFlowSplit,
} from '../services/cashFlowClassification';

describe('cashFlowClassification', () => {
  it('classifies investment income by category not project', () => {
    expect(classifyCashFlowBucket('收入', '投資收入', '利息')).toBe('investment');
    expect(classifyCashFlowBucket('收入', '一般收入', '公司薪資')).toBe('living');
  });

  it('classifies investment expense categories', () => {
    expect(classifyCashFlowBucket('支出', '理財投資', '手續費')).toBe('investment');
    expect(classifyCashFlowBucket('支出', '費用', '轉帳費用')).toBe('investment');
    expect(classifyCashFlowBucket('支出', '餐飲食品', '午餐')).toBe('living');
  });

  it('accumulates split totals', () => {
    const split = emptyCashFlowSplit();
    accumulateCashFlowSplit(split, '收入', '投資收入', 100, '利息');
    accumulateCashFlowSplit(split, '收入', '一般收入', 50000, '公司薪資');
    accumulateCashFlowSplit(split, '支出', '餐飲食品', 3000, '午餐');
    accumulateCashFlowSplit(split, '支出', '理財投資', 50, '手續費');

    expect(split.investmentIncome).toBe(100);
    expect(split.livingIncome).toBe(50000);
    expect(split.livingExpense).toBe(3000);
    expect(split.investmentExpense).toBe(50);
    expect(split.livingNet).toBe(47000);
    expect(split.investmentNet).toBe(50);
  });
});
