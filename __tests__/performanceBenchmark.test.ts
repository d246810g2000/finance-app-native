import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { parseCsvData } from '../services/financeService';
import { buildRecordIndex } from '../services/core/recordIndex';
import { calculateBudgetStatusForMonths } from '../services/budgetService';
import { buildWidgetPayload } from '../services/WidgetService';
import type { BudgetGlobalConfig, BudgetRule } from '../types';

const run = process.env.RUN_PERF_BENCHMARK === '1' ? it : it.skip;

run('benchmarks normalized import and 25-month budget calculation', () => {
  const csv = fs.readFileSync(path.join(__dirname, '..', 'data', 'AndroMoney.csv'), 'utf8');
  const parseStart = performance.now();
  const records = parseCsvData(csv);
  const indexStart = performance.now();
  const index = buildRecordIndex(records);
  const targetMonths = Array.from({ length: 25 }, (_, offset) => new Date(2026, offset - 12, 1));
  const config: BudgetGlobalConfig = { includedProjects: [], splitProjects: [], projectGroups: {} };
  const budgets: BudgetRule[] = [{ id: 'benchmark', category: '餐飲食品', monthlyLimit: 10000 }];
  const budgetStart = performance.now();
  calculateBudgetStatusForMonths(records, budgets, targetMonths, config, index);
  const budgetEnd = performance.now();
  const widgetStart = performance.now();
  buildWidgetPayload(records, budgets, config, new Date(2026, 8, 11), 12);
  const end = performance.now();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    records: records.length,
    parseMs: +(indexStart - parseStart).toFixed(2),
    indexMs: +(budgetStart - indexStart).toFixed(2),
    budget25MonthsMs: +(budgetEnd - budgetStart).toFixed(2),
    widget25MonthsMs: +(end - widgetStart).toFixed(2),
  }));
  expect(records.length).toBeGreaterThan(0);
});
