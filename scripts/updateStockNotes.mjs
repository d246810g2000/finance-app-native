#!/usr/bin/env node
/**
 * Standardize AndroMoney stock-trade notes and write AndroMoney_update.csv.
 * Does not modify amounts, categories, accounts, Id, or uid.
 */
import fs from 'node:fs';

const SRC = '/Users/d246810g2000/Desktop/AndroMoney.csv';
const OUT = '/Users/d246810g2000/Desktop/AndroMoney_update.csv';
const REPORT = '/Users/d246810g2000/Desktop/stock-notes-report.md';

const SECURITIES = new Set(['股票', '元大股票', '共享股票帳戶']);
const NON_TRADE = new Set(['錼創信託']);
const CASH = new Set([
  '現金', '午餐帳戶',
  '將來銀行', 'iLEO 數位帳戶', 'New New Bank', '臺灣企銀', '大戶 DAWHO', '富邦銀行', 'Line bank', 'Richart',
  '悠遊卡 (u-bear)', '悠遊卡 (Samsung)', '悠遊卡 (Eazy Wallet)',
  '共享現金帳戶', '共享國外帳戶',
  '共享樂天帳戶', '小伊帳戶', '共享定存帳戶',
]);

const QUANTITY_PATTERN = /(([一二兩三四五六七八九十百千]+)張|([0-9]+(?:\.[0-9]+)?)\s*(?:張|股|故))/i;
const CHINESE_DIGITS = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ARROW = /([0-9]+(?:\.[0-9]+)?)\s*(?:->|→|=>)\s*([0-9]+(?:\.[0-9]+)?)/i;

function chineseNumberToInteger(input) {
  if (/^\d+$/.test(input)) return Number(input);
  let total = 0;
  let current = 0;
  for (const char of input) {
    if (char in CHINESE_DIGITS) {
      current = CHINESE_DIGITS[char];
      continue;
    }
    if (char === '十') {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    if (char === '百') {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    if (char === '千') {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    return null;
  }
  return total + current;
}

function parseQuantity(line) {
  const match = line.match(QUANTITY_PATTERN);
  if (!match) return {};
  const text = match[0].replace(/\s+/g, '');
  if (text.endsWith('張')) {
    const value = chineseNumberToInteger(text.slice(0, -1));
    return value && value > 0 ? { shares: value * 1000, match: match[0] } : {};
  }
  const value = Number(text.replace(/(股|故)$/i, ''));
  return Number.isFinite(value) && value > 0 ? { shares: value, match: match[0] } : {};
}

function stripTradePrefix(line) {
  return line.replace(/^(買入|賣出|買|賣)\s*[:：]?\s*/, '');
}

function parseName(line) {
  const beforeNumber = stripTradePrefix(line).match(/^[^\d+>\-→]+/)?.[0] || '';
  return beforeNumber.replace(/[：:，,、|]/g, '').trim();
}

function normalizeStockNoteLines(note) {
  return String(note || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\s+n\s+/gi, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^發票號碼[:：]/.test(line) && !/^商家[:：]/.test(line));
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

function formatShares(shares) {
  return Number.isInteger(shares) ? String(shares) : formatPrice(shares);
}

function formatBuyLine(name, price, shares) {
  return `${name} ${formatPrice(price)} ${formatShares(shares)}股`;
}

function formatSellLine(name, cost, sale, shares) {
  return `${name} ${formatPrice(cost)}->${formatPrice(sale)} ${formatShares(shares)}股`;
}

function amountTolerance(amount) {
  return Math.max(1, Math.abs(amount) * 0.005);
}

function nearlyEqual(a, b, amount = Math.max(Math.abs(a), Math.abs(b))) {
  return Math.abs(a - b) <= amountTolerance(amount);
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (char === '\r') continue;
    field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(item => item.some(cell => String(cell).trim() !== ''));
}

function escapeCsvField(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function serializeCsv(rows) {
  return `${rows.map(row => row.map(escapeCsvField).join(',')).join('\n')}\n`;
}

function rowObject(headers, cells) {
  const record = {};
  headers.forEach((header, index) => {
    record[header] = cells[index] ?? '';
  });
  return record;
}

function getSide(record) {
  const from = String(record['付款(轉出)'] || '').trim();
  const to = String(record['收款(轉入)'] || '').trim();
  if (NON_TRADE.has(from) || NON_TRADE.has(to)) return null;
  if (CASH.has(from) && SECURITIES.has(to)) return 'buy';
  if (SECURITIES.has(from) && CASH.has(to)) return 'sell';
  return null;
}

function fmtDate(value) {
  const text = String(value || '');
  return /^\d{8}$/.test(text)
    ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
    : text;
}

function dateWindow(date, delta = 2) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6)) - 1;
  const day = Number(date.slice(6, 8));
  const base = new Date(year, month, day);
  const dates = new Set();
  for (let offset = -delta; offset <= delta; offset += 1) {
    const next = new Date(base);
    next.setDate(base.getDate() + offset);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    dates.add(`${yyyy}${mm}${dd}`);
  }
  return dates;
}

function splitNoteChunks(note) {
  return normalizeStockNoteLines(note)
    .flatMap(line => line.split(/[，,；;]/))
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^[0-9]+(?:\.[0-9]+)?$/.test(line));
}

function extractLotsFromNote(note, side, recordAmount) {
  const lots = [];
  let inheritedName = '';
  splitNoteChunks(note).forEach(line => {
    const cleaned = stripTradePrefix(line).replace(/賣出/g, '').trim();
    const quantity = parseQuantity(cleaned);
    const name = parseName(cleaned) || inheritedName;
    if (name) inheritedName = name;
    if (!name || !quantity.shares) return;

    const arrow = cleaned.match(ARROW);
    if (arrow) {
      lots.push({
        name,
        shares: quantity.shares,
        costPrice: Number(arrow[1]),
        salePrice: Number(arrow[2]),
        purchasePrice: side === 'buy' ? Number(arrow[1]) : undefined,
      });
      return;
    }

    const withoutQty = cleaned.replace(QUANTITY_PATTERN, ' ');
    let numbers = (withoutQty.match(/[0-9]+(?:\.[0-9]+)?/g) || []).map(Number);
    if (recordAmount != null) {
      numbers = numbers.filter(value => !nearlyEqual(value, recordAmount, recordAmount));
    }

    if (side === 'buy') {
      if (numbers.length === 0) return;
      lots.push({ name, shares: quantity.shares, purchasePrice: numbers[0] });
      return;
    }

    const prices = numbers.filter(value => !nearlyEqual(value, numbers[0] * quantity.shares));
    if (prices.length === 0) {
      lots.push({ name, shares: quantity.shares });
      return;
    }
    lots.push({ name, shares: quantity.shares, singlePrice: prices[0] });
  });
  return lots;
}

function inferBuyLots(record) {
  const amount = Number(record['金額'] || 0) || 0;
  const lots = extractLotsFromNote(record['備註'], 'buy', amount);
  if (lots.length === 0) return { lots: [], reason: 'missing_note' };

  if (lots.length === 1) {
    const lot = lots[0];
    const written = (lot.purchasePrice || 0) * lot.shares;
    if (!nearlyEqual(written, amount, amount) && lot.shares) {
      const inferred = amount / lot.shares;
      if (Number.isFinite(inferred) && inferred > 0) {
        return {
          lots: [{ ...lot, purchasePrice: inferred }],
          inferred: true,
          reason: `買入價由金額反推 ${formatPrice(lot.purchasePrice)}→${formatPrice(inferred)}`,
        };
      }
    }
  }

  const expected = lots.reduce((sum, lot) => sum + (lot.purchasePrice || 0) * lot.shares, 0);
  if (!lots.every(lot => lot.purchasePrice) || !nearlyEqual(expected, amount, amount)) {
    return { lots, reason: `買入備註合計 ${formatPrice(expected)} ≠ 金額 ${amount}` };
  }
  return { lots };
}

function companionKind(record) {
  const category = `${record['分類']}/${record['子分類']}`;
  const note = String(record['備註'] || '');
  if (category === '理財投資/手續費') return 'fee';
  if (category.includes('手續費') && /理財|投資/.test(String(record['分類']))) return 'fee';
  if (category === '理財投資/股票' && /手續費/.test(note) && !ARROW.test(note)) return 'fee';
  if (category.includes('公司配股') || category.includes('回饋')) return null;
  if (category === '投資收入/股票') return 'pnl';
  if (category === '理財投資/股票') return 'pnl';
  if (category === '理財投資/投資損失') return 'pnl';
  return null;
}

function signedPnl(record) {
  const amount = Number(record['金額'] || 0) || 0;
  if (String(record['分類']) === '投資收入') return amount;
  return -amount;
}

function pickCompanions(trade, records) {
  const window = dateWindow(String(trade['日期']), 2);
  const names = extractLotsFromNote(trade['備註'], getSide(trade) || 'sell', Number(trade['金額'] || 0))
    .map(lot => lot.name)
    .filter(Boolean);
  const nearby = records.filter(item => (
    window.has(String(item['日期']))
    && String(item.Id) !== String(trade.Id)
    && companionKind(item)
  ));

  const named = nearby.filter(item => {
    const note = String(item['備註'] || '');
    return names.length > 0 && names.some(name => note.includes(name));
  });
  const empty = nearby.filter(item => !String(item['備註'] || '').trim());
  const chosen = named.length ? named : (empty.length && names.length <= 1 ? nearby : nearby);

  return {
    fee: chosen.filter(item => companionKind(item) === 'fee'),
    pnl: chosen.filter(item => companionKind(item) === 'pnl'),
    all: nearby,
  };
}

function inferSalePrice(lots, companions, amount) {
  const name = lots[0]?.name;
  const shareTotal = lots.reduce((sum, lot) => sum + lot.shares, 0);
  const sameNameLots = companions.pnl
    .flatMap(item => extractLotsFromNote(item['備註'], 'sell', Number(item['金額'] || 0)))
    .filter(lot => !name || lot.name === name);
  const arrow = sameNameLots.find(lot => lot.costPrice && lot.salePrice);
  if (arrow) return arrow.salePrice;
  const saleOnly = sameNameLots.find(lot => lot.singlePrice || lot.salePrice);
  if (saleOnly) return saleOnly.salePrice || saleOnly.singlePrice;
  const matchedPnl = companions.pnl.filter(item => {
    const note = String(item['備註'] || '');
    return !name || note.includes(name) || !note.trim();
  });
  const incomePnl = matchedPnl.filter(item => String(item['分類']) === '投資收入');
  const usePnl = incomePnl.length ? incomePnl : matchedPnl;
  if (usePnl.length > 0 && shareTotal > 0) {
    const pnlTotal = usePnl.reduce((sum, item) => sum + signedPnl(item), 0);
    return (amount + pnlTotal) / shareTotal;
  }
  return undefined;
}

function inferSellFromCompanions(record, records) {
  const amount = Number(record['金額'] || 0) || 0;
  const sameDay = records.filter(item => (
    String(item['日期']) === String(record['日期'])
    && String(item.Id) !== String(record.Id)
    && companionKind(item) === 'pnl'
  ));

  for (const item of sameDay) {
    const lots = extractLotsFromNote(item['備註'], 'sell', Number(item['金額'] || 0));
    if (lots.length !== 1 || !lots[0].shares) continue;
    const lot = lots[0];
    const listed = lot.salePrice || lot.singlePrice;
    const pnlAmt = signedPnl(item);
    if (listed && nearlyEqual(listed * lot.shares - pnlAmt, amount, amount)) {
      return [{
        name: lot.name,
        shares: lot.shares,
        costPrice: amount / lot.shares,
        salePrice: listed,
      }];
    }
    if (!listed && lot.shares) {
      return [{
        name: lot.name,
        shares: lot.shares,
        costPrice: amount / lot.shares,
        salePrice: (amount + pnlAmt) / lot.shares,
      }];
    }
  }
  return [];
}

function inferSellLots(record, records) {
  const amount = Number(record['金額'] || 0) || 0;
  const companions = pickCompanions(record, records);
  const noteLots = extractLotsFromNote(record['備註'], 'sell', amount);
  const lots = noteLots.length ? noteLots : inferSellFromCompanions(record, records);
  const namedSame = lots.length > 0 && lots.every(lot => lot.name === lots[0].name);
  const shareTotal = lots.reduce((sum, lot) => sum + lot.shares, 0);

  if (lots.length === 0) {
    return { lots: [], companions, reason: 'missing_note' };
  }

  const complete = lots.every(lot => lot.costPrice && lot.salePrice && lot.shares);
  if (complete) {
    const costTotal = lots.reduce((sum, lot) => sum + lot.costPrice * lot.shares, 0);
    if (!nearlyEqual(costTotal, amount, amount)) {
      return {
        lots,
        companions,
        reason: `成本合計 ${formatPrice(costTotal)} ≠ 轉帳 ${amount}`,
      };
    }
    return { lots, companions };
  }

  const singleTotal = lots.reduce((sum, lot) => {
    const price = lot.costPrice || lot.singlePrice || lot.salePrice || 0;
    return sum + price * lot.shares;
  }, 0);
  const singlesAreCosts = lots.every(lot => lot.singlePrice || lot.costPrice)
    && Math.abs(singleTotal - amount) <= Math.max(1, shareTotal * 0.01);

  if (lots.length === 1 && lots[0].shares) {
    const lot = { ...lots[0] };
    const listed = lot.singlePrice || lot.salePrice;
    if (singlesAreCosts) {
      lot.costPrice = lot.costPrice || lot.singlePrice;
    } else if (!lot.costPrice) {
      lot.costPrice = amount / lot.shares;
      if (listed) lot.salePrice = listed;
    }
    if (!lot.salePrice) lot.salePrice = inferSalePrice([lot], companions, amount);
    if (lot.costPrice && lot.salePrice) {
      return {
        lots: [lot],
        companions,
        inferred: true,
        reason: '由轉帳金額與配套損益反推成本/賣價',
      };
    }
    return { lots: [lot], companions, reason: '缺賣出價，無法從配套反推' };
  }

  if (namedSame && shareTotal > 0) {
    const filled = lots.map(lot => {
      const next = { ...lot };
      if (singlesAreCosts) next.costPrice = next.costPrice || next.singlePrice;
      else if (!next.costPrice && next.singlePrice) next.costPrice = next.singlePrice;
      return next;
    });
    const salePrice = inferSalePrice(filled, companions, amount);
    filled.forEach(lot => {
      if (!lot.salePrice && salePrice) lot.salePrice = salePrice;
    });

    const costTotal = filled.reduce((sum, lot) => sum + (lot.costPrice || 0) * lot.shares, 0);
    if (filled.every(lot => lot.costPrice && lot.salePrice) && nearlyEqual(costTotal, amount, amount)) {
      return { lots: filled, companions, inferred: true, reason: '多筆同股票由配套反推賣價' };
    }
    if (filled.every(lot => lot.costPrice && lot.salePrice) && !nearlyEqual(costTotal, amount, amount)) {
      const averageCost = amount / shareTotal;
      return {
        lots: [{
          name: filled[0].name,
          shares: shareTotal,
          costPrice: averageCost,
          salePrice: salePrice || filled[0].salePrice,
        }],
        companions,
        inferred: true,
        reason: `原分批成本 ${formatPrice(costTotal)} ≠ 轉帳 ${amount}，改寫為平均成本 ${formatPrice(averageCost)}`,
      };
    }
  }

  return { lots, companions, reason: '無法組成完整賣出備註' };
}

function joinNote(lines) {
  return lines.join(' n ');
}

function isStandardBuyNote(note) {
  const lines = normalizeStockNoteLines(note);
  return lines.length > 0 && lines.every(line => /^.+\s+[0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?股$/.test(stripTradePrefix(line)));
}

function isStandardSellNote(note) {
  const lines = normalizeStockNoteLines(note);
  return lines.length > 0 && lines.every(line => /^.+\s+[0-9]+(?:\.[0-9]+)?->[0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?股$/.test(stripTradePrefix(line)));
}

const raw = fs.readFileSync(SRC, 'utf8');
const table = parseCsv(raw);
const meta = table[0];
const headers = table[1];
const dataRows = table.slice(2);
const records = dataRows.map(cells => rowObject(headers, cells));
const noteIndex = headers.indexOf('備註');
if (noteIndex < 0) throw new Error('CSV 沒有備註欄');

const changes = [];
const inferred = [];
const unresolved = [];
const synced = [];
const updatedNotes = new Map();

records.forEach((record, index) => {
  if (String(record['分類'] || '') === 'SYSTEM') return;
  const side = getSide(record);
  if (!side) return;

  const result = side === 'buy' ? inferBuyLots(record) : inferSellLots(record, records);
  const complete = side === 'buy'
    ? result.lots.length > 0 && result.lots.every(lot => lot.name && lot.shares && lot.purchasePrice)
    : result.lots.length > 0 && result.lots.every(lot => lot.name && lot.shares && lot.costPrice && lot.salePrice);

  if (!complete) {
    unresolved.push({
      id: record.Id,
      date: record['日期'],
      side,
      amount: record['金額'],
      from: record['付款(轉出)'],
      to: record['收款(轉入)'],
      note: record['備註'],
      reason: result.reason || '無法解析',
    });
    return;
  }

  const nextNote = joinNote(result.lots.map(lot => (
    side === 'buy'
      ? formatBuyLine(lot.name, lot.purchasePrice, lot.shares)
      : formatSellLine(lot.name, lot.costPrice, lot.salePrice, lot.shares)
  )));
  const previous = String(record['備註'] || '');
  const alreadyStandard = side === 'buy' ? isStandardBuyNote(previous) : isStandardSellNote(previous);
  if (nextNote !== previous.replace(/\\n/g, '\n').replace(/\s+n\s+/gi, ' n ').trim()) {
    dataRows[index][noteIndex] = nextNote;
    updatedNotes.set(String(record.Id), { note: nextNote, lots: result.lots, side, record });
    changes.push({
      id: record.Id,
      date: record['日期'],
      side,
      amount: record['金額'],
      from: record['付款(轉出)'],
      to: record['收款(轉入)'],
      before: previous,
      after: nextNote,
      inferred: Boolean(result.inferred),
      reason: result.reason || (alreadyStandard ? '已是標準格式' : '格式標準化'),
    });
    if (result.inferred) {
      inferred.push(changes[changes.length - 1]);
    }
  } else {
    updatedNotes.set(String(record.Id), { note: nextNote, lots: result.lots, side, record });
  }

  if (result.reason && /≠|缺|無法/.test(result.reason)) {
    unresolved.push({
      id: record.Id,
      date: record['日期'],
      side,
      amount: record['金額'],
      from: record['付款(轉出)'],
      to: record['收款(轉入)'],
      note: nextNote,
      reason: result.reason,
    });
  }
});

records.forEach((record, index) => {
  const kind = companionKind(record);
  if (!kind) return;
  const window = dateWindow(String(record['日期']), 2);
  const note = String(record['備註'] || '');
  const sells = [...updatedNotes.values()].filter(item => (
    item.side === 'sell'
    && window.has(String(item.record['日期']))
  ));
  if (sells.length === 0) return;

  const named = sells.filter(item => item.lots.some(lot => note.includes(lot.name)));
  const candidates = named.length ? named : sells;
  if (candidates.length !== 1 && named.length !== 1) return;
  const match = (named[0] || candidates[0]);
  if (note === match.note) return;
  if (/股息|配股|配息/.test(note)) return;
  if (note.trim() && extractLotsFromNote(note, 'sell').length === 0 && !/手續費/.test(note) && named.length === 0) {
    return;
  }

  dataRows[index][noteIndex] = match.note;
  synced.push({
    id: record.Id,
    date: record['日期'],
    category: `${record['分類']}/${record['子分類']}`,
    amount: record['金額'],
    kind,
    before: note,
    after: match.note,
    sourceId: match.record.Id,
  });
});

const output = [meta, headers, ...dataRows];
fs.writeFileSync(OUT, serializeCsv(output), 'utf8');

function displayNote(note) {
  return String(note || '(空)').replace(/\s+n\s+/gi, ' / ').replace(/\\n/g, ' / ').replace(/\n/g, ' / ');
}

const report = [
  '# 股票備註更新報告',
  '',
  `- 來源：\`${SRC}\``,
  `- 輸出：\`${OUT}\``,
  `- 買賣轉帳備註更新：${changes.length} 筆`,
  `- 其中反推成本/賣價：${inferred.length} 筆`,
  `- 配套損益/手續費同步：${synced.length} 筆`,
  `- 需人工確認：${unresolved.length} 筆`,
  '',
  '## 標準格式',
  '',
  '- 買入：`鴻海 250 100股`',
  '- 賣出：`鴻海 240->255 100股`（轉帳金額 = 成本 × 股數）',
  '- 手續費、投資收入/股票、理財投資/股票：備註與對應賣出轉帳相同，金額仍放在金額欄',
  '',
  '## 已更新的買賣轉帳',
  '',
];

changes.forEach((item, index) => {
  report.push(
    `### ${index + 1}. ${fmtDate(item.date)} ${item.side === 'buy' ? '買入' : '賣出'} $${Number(item.amount).toLocaleString()}`,
    '',
    `- 轉帳：${item.from || '-'} → ${item.to || '-'}`,
    `- Id：${item.id}`,
    `- 處理：${item.reason}`,
    `- 原備註：${displayNote(item.before)}`,
    `- 新備註：${displayNote(item.after)}`,
    '',
  );
});

report.push('## 已同步的配套紀錄', '');
if (synced.length === 0) {
  report.push('沒有需要同步的配套備註。', '');
} else {
  synced.forEach((item, index) => {
    report.push(
      `### ${index + 1}. ${fmtDate(item.date)} ${item.category} $${Number(item.amount).toLocaleString()}`,
      '',
      `- Id：${item.id}（對應轉帳 Id ${item.sourceId}）`,
      `- 原備註：${displayNote(item.before)}`,
      `- 新備註：${displayNote(item.after)}`,
      '',
    );
  });
}

report.push('## 需人工確認', '');
if (unresolved.length === 0) {
  report.push('沒有無法處理的列。', '');
} else {
  unresolved.forEach((item, index) => {
    report.push(
      `### ${index + 1}. ${fmtDate(item.date)} ${item.side === 'buy' ? '買入' : '賣出'} $${Number(item.amount).toLocaleString()}`,
      '',
      `- 轉帳：${item.from || '-'} → ${item.to || '-'}`,
      `- Id：${item.id}`,
      `- 原因：${item.reason}`,
      `- 備註：${displayNote(item.note)}`,
      '',
    );
  });
}

fs.writeFileSync(REPORT, `${report.join('\n')}\n`, 'utf8');

console.log(`updated transfers: ${changes.length}`);
console.log(`inferred: ${inferred.length}`);
console.log(`synced companions: ${synced.length}`);
console.log(`unresolved: ${unresolved.length}`);
console.log(`wrote ${OUT}`);
console.log(`wrote ${REPORT}`);
