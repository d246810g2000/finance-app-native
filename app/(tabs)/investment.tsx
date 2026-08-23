import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { PieChart } from 'react-native-gifted-charts';
import { useFinance } from '../../context/FinanceContext';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, CATEGORY_COLORS, RADIUS, withContinuousRadius } from '../../theme';
import PageChrome from '../../components/layout/PageChrome';
import SectionHeader from '../../components/ui/SectionHeader';
import SegmentedControl from '../../components/ui/SegmentedControl';
import EmptyState from '../../components/ui/EmptyState';
import AccentListCard from '../../components/ui/AccentListCard';
import {
  deriveStockData,
  StockNoteIssue,
  StockNoteIssueReason,
  StockOwnership,
} from '../../services/stockTradeService';
import { buildPortfolio, buildPortfolioInsights } from '../../services/portfolioService';
import {
  getLatestQuotes,
  getPreviousQuotes,
  loadStockPriceCache,
  StockPriceCache,
  syncStockPrices,
} from '../../services/stockPriceService';

type OwnershipFilter = 'all' | StockOwnership;
type InvestmentView = 'overview' | 'holdings' | 'trades' | 'issues';
type InvestmentStyles = ReturnType<typeof createStyles>;

const REASON_LABELS: Record<StockNoteIssueReason, string> = {
  missing_note: '缺整段備註',
  missing_name: '缺股票名稱',
  missing_buy_price: '缺買入價',
  missing_sell_prices: '缺 成本->賣出價',
  missing_shares: '缺股數',
  unparsed_line: '備註格式無法解析',
  amount_mismatch: '價格×股數與金額不一致',
  corporate_action: '公司配股待確認',
};

const SIDE_LABELS: Record<string, string> = {
  buy: '買入',
  sell: '賣出',
  corporate_action: '配股',
};

function formatDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`;
  }
  return value;
}

function formatMoney(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function formatPercent(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatCompactMoney(value: number): string {
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1)}億`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}萬`;
  return `$${Math.round(value).toLocaleString()}`;
}

function SummaryTile({
  label,
  value,
  sub,
  valueColor,
  styles,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  styles: InvestmentStyles;
}) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryLabel} numberOfLines={1}>{label}</Text>
      <Text
        style={[styles.summaryValue, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        selectable
      >
        {value}
      </Text>
      {sub ? <Text style={styles.summarySub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function IssueCard({
  issue,
  styles,
  colors,
}: {
  issue: StockNoteIssue;
  styles: InvestmentStyles;
  colors: AppColors;
}) {
  return (
    <View style={styles.issueCard}>
      <View style={styles.issueHeader}>
        <View style={[styles.sideBadge, issue.side === 'sell' ? styles.sellBadge : styles.buyBadge]}>
          <Text style={styles.sideBadgeText}>{SIDE_LABELS[issue.side] || '待確認'}</Text>
        </View>
        <Text style={styles.issueDate}>{formatDate(issue.date)}</Text>
        <Text style={styles.issueAmount}>{formatMoney(issue.amount)}</Text>
      </View>

      <Text style={styles.issueAccount} numberOfLines={1}>{issue.account}</Text>
      <View style={styles.reasonWrap}>
        {issue.reasons.map(reason => (
          <View
            key={reason}
            style={[styles.reasonBadge, { backgroundColor: colors.redLight }]}
          >
            <Text style={[styles.reasonText, { color: colors.red }]}>{REASON_LABELS[reason]}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.issueNote} numberOfLines={4}>
        {issue.note || '目前備註：(空)'}
      </Text>
      <View style={[styles.exampleBox, { borderColor: colors.outlineVariant }]}>
        <Text style={styles.exampleText}>建議格式：{issue.expectedFormat}</Text>
      </View>
    </View>
  );
}

function AllocationChart({
  items,
  colors,
  styles,
}: {
  items: ReturnType<typeof buildPortfolioInsights>['allocation'];
  colors: AppColors;
  styles: InvestmentStyles;
}) {
  if (items.length === 0) {
    return <Text style={styles.emptyMetricText}>尚無可評估部位</Text>;
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <View style={styles.donutWrapper}>
      <PieChart
        data={items.map((item, index) => ({
          value: Math.max(Math.round(item.value), 1),
          color: item.id === '__other__'
            ? colors.outlineVariant
            : CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        }))}
        donut
        radius={78}
        innerRadius={56}
        centerLabelComponent={() => (
          <View style={styles.donutCenter}>
            <Text style={styles.donutTotal} selectable>{formatCompactMoney(total)}</Text>
            <Text style={styles.donutLabel}>總市值</Text>
          </View>
        )}
      />
    </View>
  );
}

function AllocationLegend({
  items,
  styles,
}: {
  items: ReturnType<typeof buildPortfolioInsights>['allocation'];
  styles: InvestmentStyles;
}) {
  return (
    <View style={styles.allocationLegend}>
      {items.map((item, index) => (
        <View key={item.id} style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor: item.id === '__other__'
                  ? undefined
                  : CATEGORY_COLORS[index % CATEGORY_COLORS.length],
              },
            ]}
          />
          <Text style={styles.legendName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.legendValue}>{formatPercent(item.weight)}</Text>
        </View>
      ))}
    </View>
  );
}

function MoverRow({
  mover,
  colors,
  styles,
}: {
  mover: ReturnType<typeof buildPortfolioInsights>['movers'][number];
  colors: AppColors;
  styles: InvestmentStyles;
}) {
  const positive = mover.change >= 0;
  return (
    <View style={styles.moverRow}>
      <View style={styles.moverIdentity}>
        <Text style={styles.moverName} numberOfLines={1}>
          {mover.name}
          {mover.symbol ? ` ${mover.symbol}` : ''}
        </Text>
        <Text style={styles.moverMeta}>
          {mover.previousClose.toFixed(2)} → {mover.currentClose.toFixed(2)} · {mover.shares.toLocaleString()} 股
        </Text>
      </View>
      <Text
        style={[styles.moverValue, { color: positive ? colors.green : colors.red }]}
        selectable
      >
        {formatMoney(mover.change, true)}
        {'\n'}
        {formatPercent(mover.changePercent, true)}
      </Text>
    </View>
  );
}

export default function InvestmentScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { records } = useFinance();
  const isFocused = useIsFocused();

  const [ownership, setOwnership] = useState<OwnershipFilter>('all');
  const [view, setView] = useState<InvestmentView>('overview');
  const [priceCache, setPriceCache] = useState<StockPriceCache | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const syncStartedRef = useRef(false);

  const stockData = useMemo(() => deriveStockData(records), [records]);
  const filteredTrades = useMemo(() => (
    ownership === 'all'
      ? stockData.trades
      : stockData.trades.filter(trade => trade.ownership === ownership)
  ), [ownership, stockData.trades]);

  const filteredIssues = useMemo(() => (
    ownership === 'all'
      ? stockData.issues
      : stockData.issues.filter(issue => (
        ownership === 'shared'
          ? issue.account === '共享股票帳戶'
          : issue.account !== '共享股票帳戶'
      ))
  ), [ownership, stockData.issues]);

  const symbols = useMemo(() => Array.from(new Set(
    filteredTrades
      .map(trade => trade.symbol)
      .filter((symbol): symbol is string => Boolean(symbol)),
  )), [filteredTrades]);

  const quotes = useMemo(() => (
    priceCache ? getLatestQuotes(priceCache, symbols) : {}
  ), [priceCache, symbols]);
  const portfolio = useMemo(() => buildPortfolio(filteredTrades, quotes), [filteredTrades, quotes]);
  const previousQuotes = useMemo(() => (
    priceCache ? getPreviousQuotes(priceCache, symbols) : {}
  ), [priceCache, symbols]);
  const insights = useMemo(() => buildPortfolioInsights(
    portfolio.positions,
    portfolio.realizedTrades,
    previousQuotes,
  ), [portfolio.positions, portfolio.realizedTrades, previousQuotes]);

  const loadPrices = useCallback(async (force = false) => {
    if (symbols.length === 0) return;

    setSyncing(true);
    try {
      const result = await syncStockPrices(symbols, { force });
      setPriceCache(result.cache);
      setSyncErrors(result.errors);
    } catch (error: any) {
      setSyncErrors([error?.message || '價格同步失敗']);
      setPriceCache(await loadStockPriceCache());
    } finally {
      setSyncing(false);
    }
  }, [symbols]);

  useEffect(() => {
    let mounted = true;
    loadStockPriceCache().then(cache => {
      if (mounted) setPriceCache(prev => prev || cache);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isFocused || syncStartedRef.current || symbols.length === 0) return;
    syncStartedRef.current = true;
    loadPrices(false);
  }, [isFocused, loadPrices, symbols.length]);

  const lastSyncLabel = priceCache?.syncedAt
    ? new Date(priceCache.syncedAt).toLocaleString('zh-TW', { hour12: false })
    : '尚未同步';
  const hasStockData = stockData.trades.length > 0 || stockData.issues.length > 0;

  const ownershipOptions = [
    { value: 'all' as OwnershipFilter, label: '全部' },
    { value: 'personal' as OwnershipFilter, label: '個人' },
    { value: 'shared' as OwnershipFilter, label: '共享' },
  ];
  const viewOptions = [
    { value: 'overview' as InvestmentView, label: '總覽' },
    { value: 'holdings' as InvestmentView, label: '持股' },
    { value: 'trades' as InvestmentView, label: '交易' },
    { value: 'issues' as InvestmentView, label: '待補' },
  ];

  if (!hasStockData) {
    return (
      <View style={styles.container}>
        <PageChrome>
          <SegmentedControl
            fullWidth
            value={ownership}
            onChange={setOwnership}
            options={ownershipOptions}
          />
        </PageChrome>
        <EmptyState
          icon="trending-up-outline"
          title="尚無股票交易資料"
          description="在 AndroMoney 的證券帳戶轉帳備註中加入買賣資訊後，這裡會自動建立持股。"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageChrome>
        <SegmentedControl
          fullWidth
          value={view}
          onChange={setView}
          options={viewOptions}
        />
        <View style={styles.chromeRow}>
          <SegmentedControl
            variant="filter"
            value={ownership}
            onChange={setOwnership}
            options={ownershipOptions}
          />
          <Pressable
            onPress={() => loadPrices(true)}
            disabled={syncing}
            style={({ pressed }) => [styles.syncButton, pressed && styles.syncButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="同步股票收盤價"
          >
            {syncing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={18} color={colors.primary} />
            )}
            <Text style={styles.syncText}>同步</Text>
          </Pressable>
        </View>
      </PageChrome>

      <ScrollView contentContainerStyle={styles.content}>
        {view === 'overview' ? (
          <>
            <View style={[styles.summaryCard, { borderColor: colors.outlineVariant }]}>
              <View style={styles.summaryGrid}>
                <SummaryTile
                  label="總市值"
                  value={formatMoney(insights.totalMarketValue)}
                  sub={`成本 ${formatMoney(insights.totalCost)}`}
                  styles={styles}
                />
                <SummaryTile
                  label="總損益"
                  value={formatMoney(insights.totalPnl, true)}
                  valueColor={insights.totalPnl >= 0 ? colors.green : colors.red}
                  sub={formatPercent(insights.totalReturnRate, true)}
                  styles={styles}
                />
                <SummaryTile
                  label="今日損益"
                  value={formatMoney(insights.dayPnl, true)}
                  valueColor={insights.dayPnl >= 0 ? colors.green : colors.red}
                  sub={`${formatPercent(insights.dayPnlPercent, true)} · ${insights.dayAdvances} 漲 / ${insights.dayDeclines} 跌`}
                  styles={styles}
                />
                <SummaryTile
                  label="已實現損益"
                  value={formatMoney(insights.realizedPnl, true)}
                  valueColor={insights.realizedPnl >= 0 ? colors.green : colors.red}
                  sub={`${portfolio.realizedTrades.length} 筆`}
                  styles={styles}
                />
              </View>
            </View>

            <View style={styles.section}>
              <SectionHeader
                title="今日變化"
                accent={colors.blue}
                trailing={
                  <Text style={styles.sectionTrailing}>
                    {insights.dayValuedAt ? formatDate(insights.dayValuedAt) : '無收盤價'}
                  </Text>
                }
              />
              <View style={[styles.panel, { borderColor: colors.outlineVariant }]}>
                {insights.movers.length === 0 ? (
                  <Text style={styles.emptyMetricText}>沒有前一個交易日的可比收盤價。</Text>
                ) : (
                  <>
                    {insights.movers.slice(0, 5).map(mover => (
                      <MoverRow
                        key={mover.id}
                        mover={mover}
                        colors={colors}
                        styles={styles}
                      />
                    ))}
                    {insights.movers.length > 5 ? (
                      <Text style={styles.panelFootnote}>僅顯示金額影響最大的 5 檔。</Text>
                    ) : null}
                  </>
                )}
              </View>
            </View>

            <View style={styles.section}>
              <SectionHeader
                title="配置與集中度"
                accent={colors.primary}
                trailing={<Text style={styles.sectionTrailing}>{portfolio.positions.length} 檔</Text>}
              />
              <View style={[styles.panel, { borderColor: colors.outlineVariant }]}>
                <AllocationChart items={insights.allocation} colors={colors} styles={styles} />
                <AllocationLegend items={insights.allocation} styles={styles} />
                <View style={styles.metricRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>最大單一部位</Text>
                    <Text style={styles.metricValue}>{formatPercent(insights.top1Weight)}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>前三大合計</Text>
                    <Text style={styles.metricValue}>{formatPercent(insights.top3Weight)}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                {insights.accountAllocation.map(item => (
                  <View key={item.id} style={styles.accountRow}>
                    <Text style={styles.accountName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.accountValue}>
                      {formatMoney(item.value)} · {formatPercent(item.weight)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <SectionHeader title="風險與資料品質" accent={colors.yellow} />
              <View style={styles.summaryGrid}>
                <SummaryTile
                  label="集中度"
                  value={insights.concentrationStatus === 'high'
                    ? '偏高'
                    : insights.concentrationStatus === 'watch'
                      ? '注意'
                      : '均衡'}
                  valueColor={insights.concentrationStatus === 'high'
                    ? colors.red
                    : insights.concentrationStatus === 'watch'
                      ? colors.yellow
                      : colors.green}
                  sub={`前三大 ${formatPercent(insights.top3Weight)}`}
                  styles={styles}
                />
                <SummaryTile
                  label="待補備註"
                  value={`${filteredIssues.length}`}
                  valueColor={filteredIssues.length > 0 ? colors.red : colors.green}
                  sub="備註無法解析或金額不符"
                  styles={styles}
                />
                <SummaryTile
                  label="缺收盤價"
                  value={`${insights.missingPrices.length}`}
                  valueColor={insights.missingPrices.length > 0 ? colors.yellow : colors.green}
                  sub="以成本保留於總市值"
                  styles={styles}
                />
                <SummaryTile
                  label="最佳持股"
                  value={insights.bestPosition ? formatMoney(insights.bestPosition.unrealizedPnl || 0, true) : '—'}
                  valueColor={(insights.bestPosition?.unrealizedPnl || 0) >= 0 ? colors.green : colors.red}
                  sub={insights.bestPosition?.name || '尚無持股'}
                  styles={styles}
                />
                <SummaryTile
                  label="最弱持股"
                  value={insights.worstPosition ? formatMoney(insights.worstPosition.unrealizedPnl || 0, true) : '—'}
                  valueColor={(insights.worstPosition?.unrealizedPnl || 0) >= 0 ? colors.green : colors.red}
                  sub={insights.worstPosition?.name || '尚無持股'}
                  styles={styles}
                />
                <SummaryTile
                  label="收盤同步"
                  value={lastSyncLabel}
                  sub={syncErrors.length > 0 ? `${syncErrors.length} 個錯誤` : 'FinMind 日收盤'}
                  styles={styles}
                />
              </View>
              <Text style={styles.dataNote}>
                損益以備註成本與 FinMind 日收盤計算；未包含手續費、稅負與除權息還原。
              </Text>
            </View>
          </>
        ) : null}

        {view === 'issues' ? (
          <View style={styles.section}>
            <SectionHeader
              title="待補備註"
              accent={colors.red}
              trailing={<Text style={styles.sectionTrailing}>{filteredIssues.length} 筆</Text>}
            />
            {filteredIssues.length === 0 ? (
              <View style={[styles.cleanCard, { backgroundColor: colors.greenLight }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                <Text style={[styles.cleanText, { color: colors.green }]}>目前買賣備註都可解析</Text>
              </View>
            ) : (
              filteredIssues.map(issue => (
                <IssueCard key={issue.id} issue={issue} styles={styles} colors={colors} />
              ))
            )}
          </View>
        ) : null}

        {view === 'holdings' ? (
          <View style={styles.section}>
            <SectionHeader
              title="目前持股"
              accent={colors.primary}
              trailing={<Text style={styles.sectionTrailing}>{portfolio.positions.length} 檔</Text>}
            />
            {portfolio.positions.length === 0 ? (
              <View style={[styles.cleanCard, { backgroundColor: colors.surfaceContainer }]}>
                <Text style={styles.cleanText}>沒有可計算持股；請先補齊待補備註。</Text>
              </View>
            ) : (
              portfolio.positions.map(position => {
                const pnl = position.unrealizedPnl || 0;
                return (
                  <AccentListCard
                    key={position.id}
                    title={`${position.name}${position.symbol ? ` ${position.symbol}` : ' · 待補股號'}`}
                    amount={position.marketValue === undefined ? '無價格' : formatMoney(position.marketValue)}
                    amountColor={pnl >= 0 ? colors.green : colors.red}
                    meta={[
                      { icon: 'cube-outline', text: `${position.shares.toLocaleString()} 股` },
                      { icon: 'wallet-outline', text: `成本 $${position.averageCost.toFixed(2)}` },
                      {
                        icon: 'calendar-outline',
                        text: position.latestPriceDate
                          ? `收盤 $${position.latestPrice?.toFixed(2)} · ${formatDate(position.latestPriceDate)}`
                          : '缺收盤價',
                      },
                    ]}
                  >
                    <View style={styles.positionFooter}>
                      <Text
                        style={[styles.positionPnl, { color: pnl >= 0 ? colors.green : colors.red }]}
                        selectable
                      >
                        {formatMoney(pnl, true)}
                        {position.unrealizedPnlPercent !== undefined
                          ? ` · ${position.unrealizedPnlPercent >= 0 ? '+' : ''}${position.unrealizedPnlPercent.toFixed(2)}%`
                          : ''}
                      </Text>
                      <Text style={styles.positionAccount}>{position.account}</Text>
                    </View>
                  </AccentListCard>
                );
              })
            )}
          </View>
        ) : null}

        {view === 'trades' ? (
          <View style={styles.section}>
            <SectionHeader
              title="近期交易"
              accent={colors.blue}
              trailing={<Text style={styles.sectionTrailing}>{filteredTrades.length} 筆</Text>}
            />
            {filteredTrades.length === 0 ? (
              <View style={[styles.cleanCard, { backgroundColor: colors.surfaceContainer }]}>
                <Text style={styles.cleanText}>補齊備註後，有效交易會出現在這裡。</Text>
              </View>
            ) : (
              [...filteredTrades]
                .sort((a, b) => b.date.localeCompare(a.date) || b.lineNumber - a.lineNumber)
                .slice(0, 50)
                .map(trade => {
                  const isBuy = trade.side === 'buy';
                  const price = isBuy ? trade.purchasePrice : trade.salePrice;
                  return (
                    <AccentListCard
                      key={trade.id}
                      title={`${trade.name}${trade.symbol ? ` ${trade.symbol}` : ''}`}
                      amount={formatMoney(trade.amount, !isBuy)}
                      amountColor={isBuy ? colors.red : colors.green}
                      meta={[
                        {
                          icon: isBuy ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline',
                          text: SIDE_LABELS[trade.side],
                        },
                        { icon: 'cube-outline', text: `${trade.shares.toLocaleString()} 股` },
                        { icon: 'pricetag-outline', text: price ? `$${price.toFixed(2)}` : '—' },
                        { icon: 'calendar-outline', text: formatDate(trade.date) },
                      ]}
                    />
                  );
                })
            )}
          </View>
        ) : null}

        {syncErrors.length > 0 ? (
          <View style={[styles.errorBox, { borderColor: colors.outlineVariant }]}>
            {syncErrors.map(error => (
              <Text key={error} style={styles.errorText} numberOfLines={2}>{error}</Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  chromeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    ...withContinuousRadius(RADIUS.full),
  },
  syncButtonPressed: { backgroundColor: colors.surfaceVariant },
  syncText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  content: { paddingHorizontal: 16, paddingBottom: 28 },
  summaryCard: {
    marginTop: 12,
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    ...withContinuousRadius(RADIUS.md),
    padding: 12,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryTile: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: 12,
    paddingVertical: 12,
    ...withContinuousRadius(RADIUS.sm),
    minHeight: 82,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
  summaryValue: {
    marginTop: 5,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  summarySub: { marginTop: 4, fontSize: 11, color: colors.textMuted },
  donutWrapper: { alignItems: 'center', paddingVertical: 4 },
  donutCenter: { alignItems: 'center' },
  donutTotal: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  donutLabel: { marginTop: 2, fontSize: 11, color: colors.textMuted },
  panel: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    ...withContinuousRadius(RADIUS.sm),
    padding: 12,
    gap: 10,
  },
  panelFootnote: { fontSize: 11, color: colors.textMuted },
  allocationBar: {
    flexDirection: 'row',
    height: 12,
    ...withContinuousRadius(RADIUS.full),
    overflow: 'hidden',
    backgroundColor: colors.surfaceVariant,
    gap: 1,
  },
  allocationSegment: { height: '100%' },
  allocationLegend: { gap: 7 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: {
    width: 8,
    height: 8,
    ...withContinuousRadius(RADIUS.full),
    backgroundColor: colors.primary,
  },
  legendName: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
  legendValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  moverRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moverIdentity: { flex: 1, minWidth: 0 },
  moverName: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  moverMeta: {
    marginTop: 2,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  moverValue: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  metricRow: { flexDirection: 'row', gap: 8 },
  metricItem: {
    flex: 1,
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 9,
    ...withContinuousRadius(RADIUS.xs),
  },
  metricLabel: { fontSize: 11, fontWeight: '600', color: colors.onSurfaceVariant },
  metricValue: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountName: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
  accountValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  emptyMetricText: { fontSize: 12, color: colors.textMuted },
  dataNote: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  section: { marginTop: 24 },
  sectionTrailing: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant },
  issueCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.sm),
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  issueHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideBadge: { paddingHorizontal: 8, paddingVertical: 3, ...withContinuousRadius(RADIUS.full) },
  buyBadge: { backgroundColor: colors.primaryContainer },
  sellBadge: { backgroundColor: colors.greenLight },
  sideBadgeText: { fontSize: 11, fontWeight: '800', color: colors.onSurface },
  issueDate: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  issueAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  issueAccount: { fontSize: 12, color: colors.onSurfaceVariant },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonBadge: { paddingHorizontal: 8, paddingVertical: 4, ...withContinuousRadius(RADIUS.full) },
  reasonText: { fontSize: 11, fontWeight: '700' },
  issueNote: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceVariant,
    padding: 8,
    ...withContinuousRadius(RADIUS.xs),
  },
  exampleBox: { borderWidth: StyleSheet.hairlineWidth, padding: 8, ...withContinuousRadius(RADIUS.xs) },
  exampleText: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
  cleanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.sm),
  },
  cleanText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.onSurfaceVariant },
  positionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  positionPnl: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  positionAccount: { flex: 1, fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  errorBox: {
    marginTop: 18,
    padding: 12,
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.errorContainer,
    ...withContinuousRadius(RADIUS.sm),
  },
  errorText: { fontSize: 12, color: colors.onSurfaceVariant },
});
