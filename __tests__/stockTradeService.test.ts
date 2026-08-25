import { RawRecord } from '../types';
import {
  deriveStockData,
  normalizeStockNoteLines,
  StockTrade,
} from '../services/stockTradeService';
import { buildPortfolio, buildPortfolioInsights } from '../services/portfolioService';

const buyRecord = (overrides: Partial<RawRecord> = {}): RawRecord => ({
  id: 'buy-1',
  '日期': '20260801',
  '時間': '',
  '分類': '轉帳',
  '子分類': '一般轉帳',
  '收款(轉入)': '股票',
  '付款(轉出)': '大戶 DAWHO',
  '金額': '25000',
  '幣別': 'TWD',
  '商家(公司)': '',
  '專案': '',
  '備註': '鴻海 250 100股',
  ...overrides,
} as RawRecord);

const sellRecord = (overrides: Partial<RawRecord> = {}): RawRecord => ({
  id: 'sell-1',
  '日期': '20260810',
  '時間': '',
  '分類': '轉帳',
  '子分類': '一般轉帳',
  '收款(轉入)': '大戶 DAWHO',
  '付款(轉出)': '股票',
  '金額': '25000',
  '幣別': 'TWD',
  '商家(公司)': '',
  '專案': '',
  '備註': '鴻海 250->255 100股',
  ...overrides,
} as RawRecord);

describe('stock note parsing', () => {
  it('parses the standard buy note', () => {
    const { trades, issues } = deriveStockData([buyRecord()]);

    expect(issues).toHaveLength(0);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      sourceId: 'buy-1',
      side: 'buy',
      name: '鴻海',
      symbol: '2317',
      shares: 100,
      purchasePrice: 250,
      ownership: 'personal',
    });
  });

  it('parses the standard sell note with cost and sale prices', () => {
    const { trades, issues } = deriveStockData([sellRecord()]);

    expect(issues).toHaveLength(0);
    expect(trades[0]).toMatchObject({
      side: 'sell',
      shares: 100,
      costPrice: 250,
      salePrice: 255,
    });
  });

  it('still parses legacy prefixed buy notes', () => {
    const { trades, issues } = deriveStockData([
      buyRecord({ '備註': '買入：鴻海 250 100股' }),
    ]);

    expect(issues).toHaveLength(0);
    expect(trades[0]).toMatchObject({ name: '鴻海', purchasePrice: 250, shares: 100 });
  });

  it('validates a sell transfer against cost price, not sale proceeds', () => {
    const { trades, issues } = deriveStockData([
      sellRecord({ '金額': '25500' }),
    ]);

    expect(trades).toHaveLength(0);
    expect(issues[0].reasons).toContain('amount_mismatch');
  });

  it('converts Chinese numeral board lots', () => {
    expect(normalizeStockNoteLines('友達 17.95 五張')).toEqual(['友達 17.95 五張']);
    const { trades, issues } = deriveStockData([
      buyRecord({ id: 'buy-lot', '金額': '89750', '備註': '友達 17.95 五張' }),
    ]);

    expect(issues).toHaveLength(0);
    expect(trades[0].shares).toBe(5000);
    expect(trades[0].symbol).toBe('2409');
  });

  it('converts compound Chinese numeral board lots', () => {
    const { trades, issues } = deriveStockData([
      buyRecord({
        id: 'buy-twenty-lots',
        '金額': '359000',
        '備註': '友達 17.95 二十張',
      }),
    ]);

    expect(issues).toHaveLength(0);
    expect(trades[0].shares).toBe(20000);
  });

  it('parses multiple lines and validates their combined amount', () => {
    const { trades, issues } = deriveStockData([
      buyRecord({
        id: 'multi',
        '金額': '35000',
        '備註': '鴻海 250 100股\\n台積電 1000 10股',
      }),
    ]);

    expect(issues).toHaveLength(0);
    expect(trades).toHaveLength(2);
    expect(trades.map(trade => trade.symbol)).toEqual(['2317', '2330']);
  });

  it('flags an empty note without creating a holding', () => {
    const { trades, issues } = deriveStockData([buyRecord({ '備註': '' })]);

    expect(trades).toHaveLength(0);
    expect(issues[0].reasons).toEqual(['missing_note']);
  });

  it('requires both cost and sale price for a sell', () => {
    const { trades, issues } = deriveStockData([
      sellRecord({ '備註': '鴻海 255 100股 賣出' }),
    ]);

    expect(trades).toHaveLength(0);
    expect(issues[0].reasons).toContain('missing_sell_prices');
  });

  it('flags an amount mismatch instead of importing it silently', () => {
    const { trades, issues } = deriveStockData([buyRecord({ '金額': '99999' })]);

    expect(trades).toHaveLength(0);
    expect(issues[0].reasons).toContain('amount_mismatch');
  });

  it('parses dividend income notes into dividends counted as realized cash', () => {
    const { trades, dividends, issues } = deriveStockData([
      {
        id: 'div-1',
        '日期': '20260709',
        '時間': '',
        '分類': '投資收入',
        '子分類': '股息',
        '收款(轉入)': '共享樂天帳戶',
        '付款(轉出)': '',
        '金額': '255',
        '幣別': 'TWD',
        '商家(公司)': '',
        '專案': '投資股票',
        '備註': '台積電 股息 5 51股',
      } as RawRecord,
    ]);

    expect(trades).toHaveLength(0);
    expect(issues).toHaveLength(0);
    expect(dividends).toHaveLength(1);
    expect(dividends[0]).toMatchObject({
      name: '台積電',
      symbol: '2330',
      shares: 51,
      dividendPerShare: 5,
      amount: 255,
      ownership: 'shared',
      account: '共享樂天帳戶',
    });
  });

  it('allows small fee deltas on dividend amounts', () => {
    const { dividends, issues } = deriveStockData([
      {
        id: 'div-fee',
        '日期': '20250731',
        '時間': '',
        '分類': '投資收入',
        '子分類': '股息',
        '收款(轉入)': '大戶 DAWHO',
        '付款(轉出)': '',
        '金額': '11590',
        '幣別': 'TWD',
        '商家(公司)': '',
        '專案': '投資股票',
        '備註': '鴻海 股息 5.8 2000股',
      } as RawRecord,
    ]);

    expect(issues).toHaveLength(0);
    expect(dividends[0].amount).toBe(11590);
    expect(dividends[0].expectedAmount).toBe(11600);
  });

  it('parses legacy dividend notes like 台積電 15股 5元', () => {
    const { dividends, issues } = deriveStockData([
      {
        id: 'div-legacy',
        '日期': '20260109',
        '時間': '',
        '分類': '投資收入',
        '子分類': '股息',
        '收款(轉入)': 'iLEO 數位帳戶',
        '付款(轉出)': '',
        '金額': '75',
        '幣別': 'TWD',
        '商家(公司)': '',
        '專案': '投資股票',
        '備註': '台積電 15股 5元',
      } as RawRecord,
    ]);

    expect(issues).toHaveLength(0);
    expect(dividends[0]).toMatchObject({
      name: '台積電',
      shares: 15,
      dividendPerShare: 5,
      amount: 75,
      ownership: 'personal',
    });
  });

  it('flags unparsable dividend notes for repair', () => {
    const { dividends, issues } = deriveStockData([
      {
        id: 'div-bad',
        '日期': '20260709',
        '時間': '',
        '分類': '投資收入',
        '子分類': '股息',
        '收款(轉入)': 'Line bank',
        '付款(轉出)': '',
        '金額': '180',
        '幣別': 'TWD',
        '商家(公司)': '',
        '專案': '投資股票',
        '備註': '台積電股息',
      } as RawRecord,
    ]);

    expect(dividends).toHaveLength(0);
    expect(issues[0].reasons).toEqual(expect.arrayContaining(['missing_shares', 'missing_dividend_per_share']));
    expect(issues[0].expectedFormat).toBe('台積電 股息 5 51股');
  });

  it('excludes company trust contributions and matching shares from note audit', () => {
    const { trades, issues } = deriveStockData([
      buyRecord({
        id: 'trust-contribution',
        '收款(轉入)': '錼創信託',
        '付款(轉出)': '富邦銀行',
        '分類': '轉帳',
        '子分類': '一般轉帳',
        '金額': '3000',
        '備註': '',
      }),
      {
        id: 'trust-match',
        '日期': '20260805',
        '時間': '',
        '分類': '投資收入',
        '子分類': '公司配股',
        '收款(轉入)': '錼創信託',
        '付款(轉出)': '',
        '金額': '3000',
        '幣別': 'TWD',
        '商家(公司)': '',
        '專案': '',
        '備註': '',
      } as RawRecord,
    ]);

    expect(trades).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });
});

describe('FIFO portfolio calculation', () => {
  it('matches partial sells and computes remaining average cost', () => {
    const trades: StockTrade[] = [
      {
        id: 'b1', sourceId: 'b1', date: '20260801', side: 'buy', name: '鴻海', symbol: '2317',
        shares: 200, purchasePrice: 200, amount: 40000, sourceAmount: 40000,
        account: '股票', ownership: 'personal', lineNumber: 1, note: '',
      },
      {
        id: 'b2', sourceId: 'b2', date: '20260802', side: 'buy', name: '鴻海', symbol: '2317',
        shares: 100, purchasePrice: 260, amount: 26000, sourceAmount: 26000,
        account: '股票', ownership: 'personal', lineNumber: 1, note: '',
      },
      {
        id: 's1', sourceId: 's1', date: '20260803', side: 'sell', name: '鴻海', symbol: '2317',
        shares: 150, costPrice: 200, salePrice: 220, amount: 33000, sourceAmount: 33000,
        account: '股票', ownership: 'personal', lineNumber: 1, note: '',
      },
    ];

    const result = buildPortfolio(trades, {
      '2317': { symbol: '2317', date: '20260810', close: 250 },
    });

    expect(result.realizedPnl).toBe(3000);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].shares).toBe(150);
    expect(result.positions[0].averageCost).toBe(240);
    expect(result.positions[0].marketValue).toBe(37500);
    expect(result.positions[0].unrealizedPnl).toBe(1500);
  });

  it('separates personal and shared holdings with the same name', () => {
    const trades: StockTrade[] = [
      {
        id: 'p', sourceId: 'p', date: '20260801', side: 'buy', name: '台積電', symbol: '2330',
        shares: 10, purchasePrice: 1000, amount: 10000, sourceAmount: 10000,
        account: '股票', ownership: 'personal', lineNumber: 1, note: '',
      },
      {
        id: 's', sourceId: 's', date: '20260801', side: 'buy', name: '台積電', symbol: '2330',
        shares: 3, purchasePrice: 1000, amount: 3000, sourceAmount: 3000,
        account: '共享股票帳戶', ownership: 'shared', lineNumber: 1, note: '',
      },
    ];

    const result = buildPortfolio(trades);

    expect(result.positions).toHaveLength(2);
    expect(result.positions.map(position => position.ownership).sort()).toEqual(['personal', 'shared']);
  });

  it('builds daily change, allocation, and concentration insights', () => {
    const portfolio = buildPortfolio([
      {
        id: 'b1', sourceId: 'b1', date: '20260801', side: 'buy', name: '鴻海', symbol: '2317',
        shares: 300, purchasePrice: 200, amount: 60000, sourceAmount: 60000,
        account: '股票', ownership: 'personal', lineNumber: 1, note: '',
      },
      {
        id: 'b2', sourceId: 'b2', date: '20260801', side: 'buy', name: '台積電', symbol: '2330',
        shares: 10, purchasePrice: 1000, amount: 10000, sourceAmount: 10000,
        account: '股票', ownership: 'personal', lineNumber: 1, note: '',
      },
    ], {
      '2317': { symbol: '2317', date: '20260810', close: 210 },
      '2330': { symbol: '2330', date: '20260810', close: 1000 },
    });

    const insights = buildPortfolioInsights(
      portfolio.positions,
      portfolio.realizedTrades,
      {
        '2317': { symbol: '2317', date: '20260809', close: 200 },
        '2330': { symbol: '2330', date: '20260809', close: 1010 },
      },
    );

    expect(insights.totalMarketValue).toBe(73000);
    expect(insights.dayPnl).toBe(2900);
    expect(insights.dayAdvances).toBe(1);
    expect(insights.dayDeclines).toBe(1);
    expect(insights.allocation[0]).toMatchObject({ name: '鴻海 2317' });
    expect(insights.top1Weight).toBeCloseTo(86.3, 1);
    expect(insights.concentrationStatus).toBe('high');
  });

  it('adds cash dividends into realized pnl', () => {
    const result = buildPortfolio(
      [{
        id: 'b1', sourceId: 'b1', date: '20260101', side: 'buy', name: '台積電', symbol: '2330',
        shares: 51, purchasePrice: 1000, amount: 51000, sourceAmount: 51000,
        account: '共享股票帳戶', ownership: 'shared', lineNumber: 1, note: '',
      }],
      {},
      [{
        id: 'd1', sourceId: 'd1', date: '20260109', name: '台積電', symbol: '2330',
        shares: 51, dividendPerShare: 5, amount: 255, expectedAmount: 255,
        account: '共享樂天帳戶', ownership: 'shared', lineNumber: 1, note: '台積電 股息 5 51股',
        project: '投資股票',
      }],
    );

    expect(result.realizedTrades).toHaveLength(1);
    expect(result.realizedTrades[0]).toMatchObject({
      kind: 'dividend',
      pnl: 255,
      dividendPerShare: 5,
    });
    expect(result.realizedPnl).toBe(255);
  });
});
