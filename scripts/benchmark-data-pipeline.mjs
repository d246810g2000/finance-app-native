#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
execSync('npx jest __tests__/performanceBenchmark.test.ts --runInBand --no-coverage', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, RUN_PERF_BENCHMARK: '1' },
});
