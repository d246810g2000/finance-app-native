import fs from 'fs';
import { analyzeImport, parseCsvData } from '../services/financeService';

describe('csv import path', () => {
  it('parses AndroMoney fixture and analyzes without throwing', () => {
    const csv = fs.readFileSync('data/AndroMoney.csv', 'utf8');
    const rows = parseCsvData(csv);
    expect(rows.length).toBeGreaterThan(10);
    const report = analyzeImport(rows.slice(0, 200));
    expect(report.importableRows).toBeGreaterThan(0);
    expect(report.reviewHintCounts).toBeTruthy();
  });
});
