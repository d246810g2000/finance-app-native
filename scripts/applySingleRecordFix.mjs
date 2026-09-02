#!/usr/bin/env node
/**
 * 單筆記帳修正預覽（保守模式）。
 * 預設只預覽，加 --apply 才寫入新 CSV（不覆蓋原檔）。
 *
 * 用法：
 *   node scripts/applySingleRecordFix.mjs --csv ~/Desktop/AndroMoney.csv --id 50 --field 分類 --value 餐飲食品 --sub 飲料
 *   node scripts/applySingleRecordFix.mjs ... --apply --out ~/Desktop/AndroMoney_patched.csv
 */
import fs from 'node:fs';
import path from 'node:path';

const SAFE_FIELDS = new Set(['分類', '子分類', '專案', '備註', '商家(公司)']);

function parseArgs(argv) {
  const args = {
    csv: null,
    id: null,
    field: null,
    value: null,
    sub: null,
    apply: false,
    out: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--csv') args.csv = argv[++i];
    else if (a === '--id') args.id = argv[++i];
    else if (a === '--field') args.field = argv[++i];
    else if (a === '--value') args.value = argv[++i];
    else if (a === '--sub') args.sub = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function parseCsvAll(csvText) {
  const lines = csvText.split(/\r?\n/);
  const meta = lines[0];
  const headerLine = lines[1];
  const headers = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { headers.push(cur); cur = ''; continue; }
    cur += ch;
  }
  headers.push(cur);

  const dataLines = lines.slice(2);
  const rows = dataLines.map((line, li) => {
    const values = [];
    cur = '';
    inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(cur); cur = ''; continue; }
      cur += ch;
    }
    values.push(cur);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    row._lineIndex = li + 2;
    return row;
  });

  return { meta, headers, rows };
}

function escapeCsvField(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return `"${s}"`;
}

function serializeCsv(meta, headers, rows) {
  const headerLine = headers.map(escapeCsvField).join(',');
  const body = rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(','));
  return [meta, headerLine, ...body].join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.csv || !args.id || !args.field || args.value === null) {
    console.error(`用法:
  node scripts/applySingleRecordFix.mjs --csv <path> --id <Id> --field <欄位> --value <新值> [--sub <子分類>] [--apply] [--out <path>]

安全欄位：分類、子分類、專案、備註、商家(公司)
預設只預覽；加 --apply 才輸出新 CSV（不覆蓋原檔）`);
    process.exit(1);
  }

  if (!SAFE_FIELDS.has(args.field)) {
    console.error(`不允許修改「${args.field}」。僅支援：${[...SAFE_FIELDS].join('、')}`);
    process.exit(1);
  }

  const csvPath = path.resolve(args.csv);
  if (!fs.existsSync(csvPath)) {
    console.error(`找不到 ${csvPath}`);
    process.exit(1);
  }

  const { meta, headers, rows } = parseCsvAll(fs.readFileSync(csvPath, 'utf8'));
  const target = rows.find((r) => String(r.Id) === String(args.id) || String(r.uid) === String(args.id));
  if (!target) {
    console.error(`找不到 Id/uid = ${args.id}`);
    process.exit(1);
  }

  const before = { [args.field]: target[args.field] };
  target[args.field] = args.value;
  if (args.sub && args.field === '分類') {
    before['子分類'] = target['子分類'];
    target['子分類'] = args.sub;
  }

  console.log('=== 單筆修正預覽 ===');
  console.log(`Id: ${args.id}`);
  console.log(`日期: ${target['日期']}  金額: ${target['金額']}`);
  console.log(`分類: ${target['分類']}/${target['子分類']}  專案: ${target['專案'] || '(空)'}`);
  console.log(`變更: ${args.field} ${JSON.stringify(before[args.field])} → ${JSON.stringify(target[args.field])}`);
  if (args.sub) {
    console.log(`      子分類 ${JSON.stringify(before['子分類'])} → ${JSON.stringify(target['子分類'])}`);
  }
  console.log('影響餘額: 否（僅 metadata）');

  if (!args.apply) {
    console.log('\n未套用。確認無誤後加 --apply --out <新檔路径>');
    return;
  }

  const outPath = path.resolve(args.out || csvPath.replace(/\.csv$/i, '_patched.csv'));
  fs.writeFileSync(outPath, serializeCsv(meta, headers, rows));
  console.log(`\n已寫入 ${outPath}（原檔未修改）`);
}

main();
