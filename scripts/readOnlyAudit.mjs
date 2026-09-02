#!/usr/bin/env node
/**
 * 唯讀記帳稽核入口（委派 jest fixture）。
 * 不修改 CSV，只產 data/record-optimization.report.json
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvArg = process.argv[2];

execSync('npm run audit:records:jest --silent', {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(csvArg ? { AUDIT_CSV_PATH: path.resolve(csvArg) } : {}),
  },
});
