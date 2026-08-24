import { CurrentHolding, PositionMover } from '../services/portfolioService';
import { buildInvestmentPnlViewModel } from '../viewModels/investmentPnlViewModel';

function makeHolding(partial: Partial<CurrentHolding> & Pick<CurrentHolding, 'id' | 'name'>): CurrentHolding {
  return {
    shares: 1000,
    totalCost: 100000,
    averageCost: 100,
    displayValue: 100000,
    ...partial,
  };
}

describe('investment P&L view model', () => {
  it('returns empty metrics for an empty portfolio', () => {
    const result = buildInvestmentPnlViewModel({ holdings: [] });

    expect(result.summary).toMatchObject({
      marketValue: 0,
      evaluatedCost: 0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      profitCount: 0,
      lossCount: 0,
      flatCount: 0,
      missingPriceCount: 0,
    });
    expect(result.rows).toEqual([]);
    expect(result.topRows).toEqual([]);
    expect(result.splits.map(split => split.weight)).toEqual([0, 0, 0]);
  });

  it('classifies profit, loss and flat holdings by market value', () => {
    const result = buildInvestmentPnlViewModel({
      holdings: [
        makeHolding({
          id: 'profit',
          name: '獲利股',
          totalCost: 80000,
          averageCost: 80,
          latestPrice: 100,
          marketValue: 100000,
          unrealizedPnl: 20000,
          displayValue: 100000,
        }),
        makeHolding({
          id: 'loss',
          name: '虧損股',
          totalCost: 120000,
          averageCost: 120,
          latestPrice: 90,
          marketValue: 90000,
          unrealizedPnl: -30000,
          displayValue: 90000,
        }),
        makeHolding({
          id: 'flat',
          name: '平盤股',
          totalCost: 50000,
          averageCost: 50,
          latestPrice: 50,
          marketValue: 50000,
          unrealizedPnl: 0,
          displayValue: 50000,
        }),
      ],
    });

    expect(result.summary).toMatchObject({
      marketValue: 240000,
      evaluatedCost: 250000,
      unrealizedPnl: -10000,
      unrealizedPnlPercent: -4,
      profitCount: 1,
      profitPnl: 20000,
      profitMarketValue: 100000,
      lossCount: 1,
      lossPnl: -30000,
      lossMarketValue: 90000,
      flatCount: 1,
      flatMarketValue: 50000,
      missingPriceCount: 0,
    });
    expect(result.summary.evaluatedMarketValue).toBe(240000);
    expect(result.splits).toEqual([
      { id: 'profit', label: '獲利', value: 100000, weight: 41.67 },
      { id: 'loss', label: '虧損', value: 90000, weight: 37.5 },
      { id: 'flat', label: '平盤', value: 50000, weight: 20.83 },
    ]);
  });

  it('excludes missing prices from P&L but reports their count and ranks them last', () => {
    const result = buildInvestmentPnlViewModel({
      holdings: [
        makeHolding({
          id: 'missing',
          name: '缺價股',
          totalCost: 70000,
          averageCost: 70,
          displayValue: 70000,
        }),
        makeHolding({
          id: 'small-profit',
          name: '小賺股',
          totalCost: 90000,
          averageCost: 90,
          latestPrice: 91,
          marketValue: 91000,
          unrealizedPnl: 1000,
          displayValue: 91000,
        }),
      ],
    });

    expect(result.summary.missingPriceCount).toBe(1);
    expect(result.summary.marketValue).toBe(91000);
    expect(result.summary.evaluatedCost).toBe(90000);
    expect(result.summary.unrealizedPnl).toBe(1000);
    expect(result.summary.profitCount).toBe(1);
    expect(result.summary.lossCount).toBe(0);
    expect(result.rows.map(row => row.id)).toEqual(['small-profit', 'missing']);
  });

  it('ranks rows by absolute unrealized impact and limits visible rows', () => {
    const result = buildInvestmentPnlViewModel({
      visibleCount: 2,
      holdings: [
        makeHolding({
          id: 'small',
          name: '小影響',
          totalCost: 100000,
          averageCost: 100,
          marketValue: 101000,
          unrealizedPnl: 1000,
          displayValue: 101000,
        }),
        makeHolding({
          id: 'big-loss',
          name: '大虧損',
          totalCost: 100000,
          averageCost: 100,
          marketValue: 80000,
          unrealizedPnl: -20000,
          displayValue: 80000,
        }),
        makeHolding({
          id: 'big-profit',
          name: '大獲利',
          totalCost: 100000,
          averageCost: 100,
          marketValue: 125000,
          unrealizedPnl: 25000,
          displayValue: 125000,
        }),
        makeHolding({
          id: 'fourth',
          name: '第四名',
          totalCost: 100000,
          averageCost: 100,
          marketValue: 98500,
          unrealizedPnl: -1500,
          displayValue: 98500,
        }),
      ],
    });

    expect(result.rows.map(row => row.id)).toEqual([
      'big-profit',
      'big-loss',
      'fourth',
      'small',
    ]);
    expect(result.topRows.map(row => row.id)).toEqual(['big-profit', 'big-loss']);
  });

  it('attaches matching day movers and computes row return rates', () => {
    const movers = new Map<string, PositionMover>([
      ['2330', {
        id: '2330',
        name: '台積電',
        symbol: '2330',
        shares: 1000,
        previousClose: 100,
        currentClose: 105,
        change: 5000,
        changePercent: 5,
      }],
    ]);
    const result = buildInvestmentPnlViewModel({
      moversById: movers,
      holdings: [
        makeHolding({
          id: '2330',
          name: '台積電',
          symbol: '2330',
          totalCost: 90000,
          averageCost: 90,
          latestPrice: 105,
          marketValue: 105000,
          unrealizedPnl: 15000,
          displayValue: 105000,
        }),
      ],
    });

    expect(result.rows[0]).toMatchObject({
      id: '2330',
      unrealizedPnlPercent: 16.67,
      dayChange: 5000,
      dayChangePercent: 5,
    });
  });
});
