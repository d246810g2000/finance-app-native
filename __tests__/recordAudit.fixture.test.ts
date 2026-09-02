/**
 * 唯讀記帳稽核報告（不修改 CSV）。
 *
 * 用法：
 *   npm run audit:records
 *   AUDIT_CSV_PATH=/path/to/AndroMoney.csv npm run audit:records
 *
 * 產出：data/record-optimization.report.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseCsvData } from '../services/financeService';
import { auditRecords } from '../services/recordAuditService';

const ROOT = path.join(__dirname, '..');
const DEFAULT_CSV = path.join(ROOT, 'data', 'AndroMoney.csv');
const DESKTOP_CSV = path.join(process.env.HOME || '', 'Desktop', 'AndroMoney.csv');
const REPORT_PATH = path.join(ROOT, 'data', 'record-optimization.report.json');

function resolveCsvPath(): string | null {
  const env = process.env.AUDIT_CSV_PATH;
  if (env && fs.existsSync(env)) return env;
  if (fs.existsSync(DEFAULT_CSV)) return DEFAULT_CSV;
  if (fs.existsSync(DESKTOP_CSV)) return DESKTOP_CSV;
  return null;
}

describe('recordAudit (read-only)', () => {
  const csvPath = resolveCsvPath();
  const describeIfCsv = csvPath ? describe : describe.skip;

  describeIfCsv('write audit report', () => {
    it('writes data/record-optimization.report.json without modifying source CSV', () => {
      const csvText = fs.readFileSync(csvPath!, 'utf8');
      const records = parseCsvData(csvText);
      const summary = auditRecords(records, { limit: 500 });

      const report = {
        generatedAt: new Date().toISOString(),
        sourceCsv: csvPath,
        totalRecords: summary.totalRecords,
        bySeverity: summary.bySeverity,
        byKind: summary.byKind,
        hints: summary.hints,
        findings: summary.findings,
        note: '唯讀報告：不修改 CSV。改分類/專案/備註不影響帳戶餘額。',
      };

      fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
      fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

      expect(summary.totalRecords).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log(
        `\n[audit:records] wrote ${REPORT_PATH}\n` +
          `  records: ${summary.totalRecords}\n` +
          `  findings: ${summary.findings.length} (high ${summary.bySeverity.high} / medium ${summary.bySeverity.medium})\n`,
      );
    });
  });
});
