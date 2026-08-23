import * as fs from 'fs';
import { parseCsvData } from '../services/financeService';
import { deriveStockData, normalizeStockNoteLines } from '../services/stockTradeService';
import { RawRecord } from '../types';

const CSV = '/Users/d246810g2000/Desktop/AndroMoney_update.csv';
const exists = fs.existsSync(CSV);
const describeIf = exists ? describe : describe.skip;

describeIf('AndroMoney_update.csv stock note audit', () => {
  it('prints audit report', () => {
    const rows = parseCsvData(fs.readFileSync(CSV, 'utf8'));
    const { trades, issues } = deriveStockData(rows);

    const REASON_ZH: Record<string, string> = {
      missing_note: '備註空白',
      missing_name: '缺股票名稱',
      missing_buy_price: '缺買入價',
      missing_sell_prices: '缺成本/賣價',
      missing_shares: '缺股數',
      unparsed_line: '備註格式無法解析',
      amount_mismatch: '金額與備註不符',
      corporate_action: '公司配股',
    };

    const CASH = new Set([
      '現金', '午餐帳戶', '將來銀行', 'iLEO 數位帳戶', 'New New Bank', '臺灣企銀', '大戶 DAWHO',
      '富邦銀行', 'Line bank', 'Richart', '悠遊卡 (u-bear)', '悠遊卡 (Samsung)', '悠遊卡 (Eazy Wallet)',
      '共享現金帳戶', '共享國外帳戶', '共享樂天帳戶', '小伊帳戶', '共享定存帳戶',
    ]);
    const SEC = new Set(['股票', '元大股票', '共享股票帳戶']);
    const COMPANION_CATS = new Set([
      '投資收入/股票', '理財投資/股票', '理財投資/手續費', '理財投資/投資損失',
    ]);

    const fmtDate = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);
    const getSide = (record: RawRecord): 'buy' | 'sell' | null => {
      const from = String(record['付款(轉出)'] || '').trim();
      const to = String(record['收款(轉入)'] || '').trim();
      if (CASH.has(from) && SEC.has(to)) return 'buy';
      if (SEC.has(from) && CASH.has(to)) return 'sell';
      return null;
    };

    const report: string[] = [];
    report.push(`trades=${trades.length} issues=${issues.length}`);

    const tradeIssues = issues.filter(i => i.side !== 'corporate_action');
    tradeIssues.forEach(item => {
      const rec = rows.find(r => String(r.id || r.uid || '') === item.id);
      report.push(`ISSUE Id=${rec?.['Id']} ${fmtDate(item.date)} ${item.side} $${item.amount} ${item.reasons.map(r => REASON_ZH[r]).join(',')} note=${item.note || '(空)'}`);
    });

    const buyStd = /^.+\s+[0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?股$/;
    const sellStd = /^.+\s+[0-9]+(?:\.[0-9]+)?->[0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?股$/;
    rows.forEach(record => {
      if (String(record['分類']) === 'SYSTEM') return;
      const side = getSide(record);
      if (!side) return;
      const lines = normalizeStockNoteLines(String(record['備註'] || ''));
      if (lines.length === 0) return;
      const bad = lines.some(line => {
        const cleaned = line.replace(/^(買入|賣出|買|賣)\s*[:：]?\s*/, '');
        return side === 'buy' ? !buyStd.test(cleaned) : !sellStd.test(cleaned);
      });
      if (bad) report.push(`NONSTD Id=${record['Id']} ${fmtDate(String(record['日期']))} ${side} ${String(record['備註']).slice(0, 80)}`);
    });

    const legacy = rows.filter(r => /^(買入|賣出|買|賣)\s*[:：]/.test(String(r['備註'] || '').trim()));
    report.push(`legacy_prefix=${legacy.length}`);

    // companion diff
    rows.filter(r => getSide(r) === 'sell').forEach(sell => {
      const note = String(sell['備註'] || '').trim();
      if (!note) return;
      const d = String(sell['日期']);
      rows.forEach(comp => {
        if (String(comp['Id']) === String(sell['Id'])) return;
        if (Math.abs(Number(comp['日期']) - Number(d)) > 2) return;
        const cat = `${comp['分類']}/${comp['子分類']}`;
        if (!COMPANION_CATS.has(cat)) return;
        const cn = String(comp['備註'] || '').trim();
        if (/股息|配股|配息/.test(cn)) return;
        if (!cn) report.push(`COMP_EMPTY sell=${sell['Id']} comp=${comp['Id']} ${cat}`);
        else if (cn !== note) {
          const names = normalizeStockNoteLines(note).map(l => l.match(/^[^\d+>\-→]+/)?.[0]?.trim()).filter(Boolean);
          if (names.some(n => cn.includes(String(n)))) {
            report.push(`COMP_DIFF sell=${sell['Id']} comp=${comp['Id']} sellNote=${note.slice(0,50)} compNote=${cn.slice(0,50)}`);
          }
        }
      });
    });

    // tolerance diff
    const issueIds = new Set(tradeIssues.map(i => i.id));
    const parsedBySource = new Map<string, typeof trades>();
    trades.forEach(t => {
      const sid = t.sourceId.split(':')[0];
      if (!parsedBySource.has(sid)) parsedBySource.set(sid, []);
      parsedBySource.get(sid)!.push(t);
    });
    rows.forEach(record => {
      const side = getSide(record);
      if (!side) return;
      const id = String(record.id || record.uid || record['Id']);
      if (issueIds.has(id)) return;
      const lots = parsedBySource.get(id);
      if (!lots?.length) return;
      const expected = lots.reduce((sum, lot) => sum + (side === 'buy' ? (lot.purchasePrice || 0) * lot.shares : (lot.costPrice || 0) * lot.shares), 0);
      const amt = Number(record['金額'] || 0);
      const diff = Math.abs(expected - amt);
      if (diff > 0.01 && diff <= Math.max(1, amt * 0.005)) {
        report.push(`TOL_DIFF Id=${record['Id']} ${fmtDate(String(record['日期']))} diff=${diff.toFixed(2)} amt=${amt} expected=${expected.toFixed(2)}`);
      }
    });

    console.log('\n' + report.join('\n') + '\n');
    expect(true).toBe(true);
  });
});
