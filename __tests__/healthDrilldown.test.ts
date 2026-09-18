import {
  buildCategoryDrilldown,
  buildInsightDrilldown,
  buildKpiDrilldown,
  buildScoreDrilldown,
} from '../viewModels/healthDrilldown';
import type { BudgetGlobalConfig, TransformedRecord } from '../types';
import type { HealthInsight } from '../services/financialHealthService';

const config: BudgetGlobalConfig = {
  includedProjects: ['正常開銷', '共同開銷', '住家支出'],
  splitProjects: [],
  projectGroups: {
    住家支出: 'fixed',
  },
};

const july = new Date(2026, 6, 1);

function row(partial: Partial<TransformedRecord>): TransformedRecord {
  return {
    id: partial.id || '1',
    帳戶: 'Line bank',
    幣種: 'TWD',
    記錄類型: '支出',
    主類別: '餐飲食品',
    子類別: '午餐',
    金額: -100,
    手續費: 0,
    折扣: 0,
    名稱: '',
    商家: '測試',
    日期: '2026/07/10',
    時間: '',
    專案: '正常開銷',
    描述: '',
    標籤: '',
    對象: '',
    ...partial,
  } as TransformedRecord;
}

describe('healthDrilldown', () => {
  const rows: TransformedRecord[] = [
    row({ id: 'e1', 主類別: '餐飲食品', 金額: -500, 商家: '餐廳A' }),
    row({ id: 'e2', 主類別: '居家生活', 子類別: '電費', 金額: -800, 專案: '住家支出', 商家: '台電' }),
    row({ id: 'e3', 主類別: '理財投資', 子類別: '手續費', 金額: -50, 專案: '投資股票' }),
    row({
      id: 'i1',
      記錄類型: '收入',
      主類別: '一般收入',
      子類別: '公司薪資',
      金額: 50000,
      商家: '',
    }),
  ];

  it('opens category expenses for cat-rise insights', () => {
    const insight: HealthInsight = {
      id: 'cat-rise-餐飲食品',
      severity: 'warning',
      title: '全部｜餐飲食品連續三個月增加',
      detail: '…',
    };
    const result = buildInsightDrilldown({ insight, rows, targetMonth: july, budgetConfig: config });
    expect(result.records).toHaveLength(1);
    expect(result.records[0].id).toBe('e1');
  });

  it('opens housing rows for housingBurden score', () => {
    const result = buildScoreDrilldown({
      scoreKey: 'housingBurden',
      score: 8,
      rows,
      targetMonth: july,
      budgetConfig: config,
      budgets: [],
    });
    expect(result.title).toContain('住房固定');
    expect(result.records.some((r) => r.id === 'e2')).toBe(true);
  });

  it('opens income kpi records', () => {
    const result = buildKpiDrilldown({ kind: 'income', rows, targetMonth: july });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]['記錄類型']).toBe('收入');
  });

  it('opens structure category drilldown', () => {
    const result = buildCategoryDrilldown({ category: '餐飲食品', rows, targetMonth: july });
    expect(result.records).toHaveLength(1);
    expect(result.title).toContain('餐飲食品');
  });
});
