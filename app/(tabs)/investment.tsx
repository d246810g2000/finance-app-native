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
import { FlashList } from '@shopify/flash-list';
import { PieChart } from 'react-native-gifted-charts';
import { useFinance } from '../../context/FinanceContext';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, CATEGORY_COLORS, RADIUS, withContinuousRadius } from '../../theme';
import { LinearGradient } from 'expo-linear-gradient';
import PageChrome from '../../components/layout/PageChrome';
import SectionHeader from '../../components/ui/SectionHeader';
import SegmentedControl from '../../components/ui/SegmentedControl';
import EmptyState from '../../components/ui/EmptyState';
import AccentListCard from '../../components/ui/AccentListCard';
import DateRangeSelector from '../../components/DateRangeSelector';
import CompactSummaryBar from '../../components/ui/CompactSummaryBar';
import InvestmentDetailSheet, {
  InvestmentSheetContent,
} from '../../components/investment/InvestmentDetailSheet';
import InvestmentDrillHeader from '../../components/investment/InvestmentDrillHeader';
import InvestmentTimelineSection from '../../components/investment/InvestmentTimelineSection';
import {
  StockNoteIssue,
  StockNoteIssueReason,
  StockOwnership,
  StockTrade,
} from '../../services/stockTradeService';
import {
  StockRealizedTrade,
  type CurrentHolding,
  type PortfolioInsights,
} from '../../services/portfolioService';
import {
  createDefaultInvestmentDateRange,
  matchesPosition,
} from '../../services/investmentFilters';
import {
  loadStockPriceCache,
  StockPriceCache,
  syncStockPrices,
} from '../../services/stockPriceService';
import {
  loadStockInfoCache,
  StockInfoCache,
  syncStockInfo,
} from '../../services/stockInfoService';
import {
  buildInvestmentScreenData,
  collectInvestmentSymbols,
} from '../../viewModels/investmentViewModel';

type OwnershipFilter = 'all' | StockOwnership;
type DetailPanel = 'holdings' | 'realized' | 'trades' | 'issues';
type InvestmentStyles = ReturnType<typeof createStyles>;

const DETAIL_TITLES: Record<DetailPanel, string> = {
  holdings: '目前持股',
  realized: '已實現損益',
  trades: '區間交易',
  issues: '待補備註',
};

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

/** Taiwan market convention: gains red, losses green. */
function pnlColor(value: number, colors: AppColors): string {
  return value >= 0 ? colors.red : colors.green;
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
  items: PortfolioInsights['allocation'];
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
        radius={64}
        innerRadius={46}
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
  items: PortfolioInsights['allocation'];
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
  onPress,
}: {
  mover: PortfolioInsights['movers'][number];
  colors: AppColors;
  styles: InvestmentStyles;
  onPress?: () => void;
}) {
  const body = (
    <>
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
        style={[styles.moverValue, { color: pnlColor(mover.change, colors) }]}
        selectable
      >
        {formatMoney(mover.change, true)}
        {'\n'}
        {formatPercent(mover.changePercent, true)}
      </Text>
    </>
  );

  if (!onPress) {
    return <View style={styles.moverRow}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.moverRow, pressed && styles.moverRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${mover.name} 今日變化`}
    >
      {body}
    </Pressable>
  );
}

const OWNERSHIP_LABELS: Record<StockOwnership, string> = {
  personal: '個人',
  shared: '共享',
};

function TradeListCard({
  trade,
  colors,
  styles,
}: {
  trade: StockTrade;
  colors: AppColors;
  styles: InvestmentStyles;
}) {
  const isBuy = trade.side === 'buy';
  const priceText = isBuy
    ? (trade.purchasePrice ? `$${trade.purchasePrice.toFixed(2)}` : '—')
    : (trade.costPrice && trade.salePrice
      ? `$${trade.costPrice.toFixed(2)}→$${trade.salePrice.toFixed(2)}`
      : trade.salePrice ? `$${trade.salePrice.toFixed(2)}` : '—');

  return (
    <AccentListCard
      title={`${trade.name}${trade.symbol ? ` ${trade.symbol}` : ''}`}
      amount={formatMoney(trade.amount, !isBuy)}
      amountColor={isBuy ? colors.red : colors.green}
      meta={[
        {
          icon: isBuy ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline',
          text: SIDE_LABELS[trade.side],
        },
        { icon: 'cube-outline', text: `${trade.shares.toLocaleString()} 股` },
        { icon: 'pricetag-outline', text: priceText },
        { icon: 'calendar-outline', text: formatDate(trade.date) },
        { icon: 'person-outline', text: OWNERSHIP_LABELS[trade.ownership] },
      ]}
    />
  );
}

function RealizedListCard({
  trade,
  colors,
}: {
  trade: StockRealizedTrade;
  colors: AppColors;
}) {
  return (
    <AccentListCard
      title={`${trade.name}${trade.symbol ? ` ${trade.symbol}` : ''}`}
      amount={formatMoney(trade.pnl, true)}
      amountColor={pnlColor(trade.pnl, colors)}
      meta={[
        { icon: 'calendar-outline', text: formatDate(trade.date) },
        {
          icon: 'pricetag-outline',
          text: `$${trade.costPrice.toFixed(2)}→$${trade.salePrice.toFixed(2)}`,
        },
        { icon: 'cube-outline', text: `${trade.shares.toLocaleString()} 股` },
        { icon: 'wallet-outline', text: trade.account },
        { icon: 'person-outline', text: OWNERSHIP_LABELS[trade.ownership] },
      ]}
    />
  );
}

export default function InvestmentScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { records } = useFinance();
  const isFocused = useIsFocused();

  const [ownership, setOwnership] = useState<OwnershipFilter>('all');
  const [detailPanel, setDetailPanel] = useState<DetailPanel | null>(null);
  const [priceCache, setPriceCache] = useState<StockPriceCache | null>(null);
  const [infoCache, setInfoCache] = useState<StockInfoCache | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [sheetContent, setSheetContent] = useState<InvestmentSheetContent | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const syncStartedRef = useRef(false);
  const defaultRange = useMemo(() => createDefaultInvestmentDateRange(), []);
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);

  const handleDateChange = useCallback((start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const openSheet = useCallback((content: InvestmentSheetContent) => {
    setSheetContent(content);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setSheetContent(null);
  }, []);

  const {
    assetTimeline,
    currentHoldings,
    filteredIssues,
    filteredTrades,
    hasStockData: computedHasStockData,
    insights,
    moverByPositionId,
    portfolio,
    rangeFilteredTrades,
    rangeRealizedTrades,
    periodRealizedPnl,
    stockData,
  } = useMemo(() => buildInvestmentScreenData({
    records,
    ownership,
    infoCache,
    priceCache,
    startDate,
    endDate,
  }), [records, ownership, infoCache, priceCache, startDate, endDate]);

  const resolveMoverForPosition = useCallback((position: typeof portfolio.positions[number]) => {
    const key = position.symbol || `name:${position.name}`;
    return moverByPositionId.get(key);
  }, [moverByPositionId]);

  const openPositionSheet = useCallback((position: typeof portfolio.positions[number]) => {
    openSheet({
      kind: 'position',
      title: `${position.name}${position.symbol ? ` ${position.symbol}` : ''}`,
      position,
      trades: filteredTrades.filter(trade => matchesPosition(trade, position)),
      realized: portfolio.realizedTrades.filter(trade => matchesPosition(trade, position)),
    });
  }, [filteredTrades, openSheet, portfolio.realizedTrades]);

  const openHoldingDetail = useCallback((holding: CurrentHolding) => {
    const positions = portfolio.positions.filter(position => (
      (position.symbol || `name:${position.name}`) === holding.id
    ));
    const matchesHolding = (item: { name: string; symbol?: string }) => (
      holding.symbol ? item.symbol === holding.symbol : item.name === holding.name
    );
    const ownership: StockOwnership = positions.every(position => position.ownership === 'shared')
      ? 'shared'
      : 'personal';

    openSheet({
      kind: 'position',
      title: `${holding.name}${holding.symbol ? ` ${holding.symbol}` : ''}`,
      position: {
        id: holding.id,
        name: holding.name,
        symbol: holding.symbol,
        account: positions.length === 1 ? positions[0].account : `${positions.length} 個帳戶`,
        ownership,
        shares: holding.shares,
        averageCost: holding.averageCost,
        totalCost: holding.totalCost,
        latestPrice: holding.latestPrice,
        latestPriceDate: holding.latestPriceDate,
        marketValue: holding.marketValue,
        unrealizedPnl: holding.unrealizedPnl,
        unrealizedPnlPercent: holding.totalCost > 0 && holding.unrealizedPnl !== undefined
          ? (holding.unrealizedPnl / holding.totalCost) * 100
          : undefined,
      },
      trades: filteredTrades.filter(matchesHolding),
      realized: portfolio.realizedTrades.filter(matchesHolding),
    });
  }, [filteredTrades, openSheet, portfolio.positions, portfolio.realizedTrades]);

  const loadPrices = useCallback(async (force = false) => {
    setSyncing(true);
    try {
      const infoResult = await syncStockInfo({ force });
      setInfoCache(infoResult.cache);

      const nextSymbols = collectInvestmentSymbols({
        records,
        ownership,
        byName: infoResult.cache.byName,
      });

      if (nextSymbols.length === 0) {
        setSyncErrors(infoResult.errors);
        return;
      }

      const result = await syncStockPrices(nextSymbols, { force });
      setPriceCache(result.cache);
      setSyncErrors([...infoResult.errors, ...result.errors]);
    } catch (error: unknown) {
      setSyncErrors([error instanceof Error ? error.message : '價格同步失敗']);
      setInfoCache(await loadStockInfoCache());
      setPriceCache(await loadStockPriceCache());
    } finally {
      setSyncing(false);
    }
  }, [ownership, records]);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadStockPriceCache(), loadStockInfoCache()]).then(([prices, info]) => {
      if (!mounted) return;
      setPriceCache(prev => prev || prices);
      setInfoCache(prev => prev || info);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isFocused || syncStartedRef.current) return;
    syncStartedRef.current = true;
    loadPrices(false);
  }, [isFocused, loadPrices]);

  const lastSyncLabel = priceCache?.syncedAt
    ? new Date(priceCache.syncedAt).toLocaleString('zh-TW', { hour12: false })
    : '尚未同步';
  const hasStockData = computedHasStockData;

  const ownershipOptions = [
    { value: 'all' as OwnershipFilter, label: '全部', icon: 'apps-outline' as const },
    { value: 'personal' as OwnershipFilter, label: '個人', icon: 'person-outline' as const },
    { value: 'shared' as OwnershipFilter, label: '共享', icon: 'people-outline' as const },
  ];

  const openDetail = useCallback((panel: DetailPanel) => setDetailPanel(panel), []);
  const closeDetail = useCallback(() => setDetailPanel(null), []);

  const openMoverDetail = useCallback((mover: typeof insights.movers[number]) => {
    const matches = portfolio.positions.filter(position => (
      (position.symbol || `name:${position.name}`) === mover.id
    ));
    if (matches.length === 1) {
      openPositionSheet(matches[0]);
      return;
    }
    openDetail('holdings');
  }, [openDetail, openPositionSheet, portfolio.positions]);

  const renderTradeItem = useCallback(({ item }: { item: StockTrade }) => (
    <TradeListCard trade={item} colors={colors} styles={styles} />
  ), [colors, styles]);

  const tradeKeyExtractor = useCallback((item: StockTrade) => item.id, []);

  const costBarPercent = insights.totalMarketValue > 0
    ? Math.min((insights.totalCost / insights.totalMarketValue) * 100, 100)
    : 0;
  const floatBarPercent = insights.totalMarketValue > 0
    ? Math.max(0, 100 - costBarPercent)
    : 0;

  const ownershipFilter = (
    <View style={styles.filterSection}>
      <Text style={styles.controlLabel}>帳戶範圍</Text>
      <View style={styles.filterControls}>
        {hasStockData ? (
          <Pressable
            onPress={() => loadPrices(true)}
            disabled={syncing}
            style={({ pressed }) => [styles.syncIconButton, pressed && styles.syncIconButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="同步股票收盤價"
          >
            {syncing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={18} color={colors.primary} />
            )}
          </Pressable>
        ) : null}
        <SegmentedControl
          value={ownership}
          onChange={setOwnership}
          options={ownershipOptions}
          variant="filter"
          accessibilityLabel="帳戶範圍篩選"
        />
      </View>
    </View>
  );

  const summaryCard = (
    <View style={styles.summaryCard}>
      <LinearGradient
        colors={colors.accentGradientShape as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.summaryCardAccent}
      />
      <Text style={styles.summaryHeadlineLabel}>總市值</Text>
      <Text style={styles.summaryHeadlineValue} selectable>
        {formatMoney(insights.totalMarketValue)}
      </Text>
      <Text style={styles.summaryHeadlineSub}>
        成本 {formatMoney(insights.totalCost)}
        {' · '}
        <Text style={{ color: pnlColor(insights.totalPnl, colors) }}>
          總損益 {formatMoney(insights.totalPnl, true)} · {formatPercent(insights.totalReturnRate, true)}
        </Text>
      </Text>

      <View style={styles.segBarContainer}>
        <View style={styles.segBarTrack}>
          {insights.totalMarketValue > 0 ? (
            <>
              <View style={[styles.segBarFill, {
                width: `${costBarPercent}%`,
                backgroundColor: colors.textSecondary,
                borderTopLeftRadius: 5,
                borderBottomLeftRadius: 5,
              }]} />
              <View style={[styles.segBarFill, {
                width: `${floatBarPercent}%`,
                backgroundColor: pnlColor(insights.unrealizedPnl, colors),
                borderTopRightRadius: floatBarPercent >= 99 ? 5 : 0,
                borderBottomRightRadius: floatBarPercent >= 99 ? 5 : 0,
              }]} />
            </>
          ) : null}
        </View>
        <View style={styles.segLegendRow}>
          <View style={styles.segLegendItem}>
            <View style={[styles.segLegendDot, { backgroundColor: colors.textSecondary }]} />
            <Text style={styles.segLegendText}>成本</Text>
          </View>
          <View style={styles.segLegendItem}>
            <View style={[styles.segLegendDot, { backgroundColor: pnlColor(insights.unrealizedPnl, colors) }]} />
            <Text style={styles.segLegendText}>浮動</Text>
          </View>
          <View style={styles.segLegendItem}>
            <View style={[styles.segLegendDot, { backgroundColor: colors.divider }]} />
            <Text style={styles.segLegendText}>配置前三大 {formatPercent(insights.top3Weight)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <Pressable
            onPress={() => openDetail('holdings')}
            style={({ pressed }) => [styles.metricHit, pressed && styles.metricItemPressed]}
            accessibilityRole="button"
            accessibilityLabel={`今日損益 ${formatMoney(insights.dayPnl, true)}，${insights.dayAdvances} 漲 ${insights.dayDeclines} 跌，查看持股`}
          >
            <View style={styles.metricLabelRow}>
              <Ionicons name="pulse-outline" size={14} color={colors.blue} />
              <Text style={styles.metricLabel}>今日</Text>
            </View>
            <Text style={[styles.metricValue, { color: pnlColor(insights.dayPnl, colors) }]}>
              {formatMoney(insights.dayPnl, true)}
            </Text>
          </Pressable>
        </View>
        <View style={styles.metricDividerV} />
        <View style={styles.metricItem}>
          <Pressable
            onPress={() => openDetail('realized')}
            style={({ pressed }) => [styles.metricHit, pressed && styles.metricItemPressed]}
            accessibilityRole="button"
            accessibilityLabel={`區間已實現 ${formatMoney(periodRealizedPnl, true)}，${rangeRealizedTrades.length} 筆`}
          >
            <View style={styles.metricLabelRow}>
              <Ionicons name="checkmark-done-outline" size={14} color={colors.primary} />
              <Text style={styles.metricLabel}>已實現</Text>
            </View>
            <Text style={[styles.metricValue, { color: pnlColor(periodRealizedPnl, colors) }]}>
              {formatMoney(periodRealizedPnl, true)}
            </Text>
          </Pressable>
        </View>
        <View style={styles.metricDividerV} />
        <View style={styles.metricItem}>
          <Pressable
            onPress={() => openDetail('trades')}
            style={({ pressed }) => [styles.metricHit, pressed && styles.metricItemPressed]}
            accessibilityRole="button"
            accessibilityLabel={`區間交易 ${rangeFilteredTrades.length} 筆`}
          >
            <View style={styles.metricLabelRow}>
              <Ionicons name="swap-horizontal-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metricLabel}>交易</Text>
            </View>
            <Text style={styles.metricValue}>
              {rangeFilteredTrades.length}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  if (!hasStockData) {
    return (
      <View style={styles.container}>
        {ownershipFilter}
        <EmptyState
          icon="trending-up-outline"
          title="尚無股票交易資料"
          description="在 AndroMoney 的證券帳戶轉帳備註中加入買賣資訊後，這裡會自動建立持股。"
        />
      </View>
    );
  }

  const detailSubtitle =
    detailPanel === 'holdings' ? `${portfolio.positions.length} 檔`
      : detailPanel === 'realized' ? `${rangeRealizedTrades.length} 筆 · ${formatMoney(periodRealizedPnl, true)}`
        : detailPanel === 'trades' ? `${rangeFilteredTrades.length} 筆`
          : detailPanel === 'issues' ? `${filteredIssues.length} 筆`
            : undefined;

  return (
    <View style={styles.container}>
      <PageChrome>
        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          subLabel={`總市值 ${formatMoney(insights.totalMarketValue)} · ${portfolio.positions.length} 檔`}
        />
      </PageChrome>

      {ownershipFilter}

      {detailPanel ? (
        <>
          <InvestmentDrillHeader
            title={DETAIL_TITLES[detailPanel]}
            subtitle={detailSubtitle}
            onBack={closeDetail}
            colors={colors}
          />

          {detailPanel === 'trades' ? (
            <FlashList
              data={rangeFilteredTrades}
              renderItem={renderTradeItem}
              keyExtractor={tradeKeyExtractor}
              contentContainerStyle={styles.listContent}
              // @ts-expect-error FlashList v2 estimatedItemSize
              estimatedItemSize={96}
              ListEmptyComponent={(
                <View style={[styles.cleanCard, { backgroundColor: colors.surfaceContainer }]}>
                  <Text style={styles.cleanText}>此區間沒有有效交易紀錄。</Text>
                </View>
              )}
            />
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {detailPanel === 'realized' ? (
                <View style={styles.section}>
                  <CompactSummaryBar
                    style={styles.inlineSummary}
                    items={[
                      { label: '區間合計', value: formatMoney(periodRealizedPnl, true) },
                      { label: '全期合計', value: formatMoney(insights.realizedPnl, true) },
                    ]}
                  />
                  {rangeRealizedTrades.length === 0 ? (
                    <View style={[styles.cleanCard, { backgroundColor: colors.surfaceContainer }]}>
                      <Text style={styles.cleanText}>此區間沒有賣出了結紀錄。</Text>
                    </View>
                  ) : (
                    rangeRealizedTrades.map(trade => (
                      <RealizedListCard key={trade.id} trade={trade} colors={colors} />
                    ))
                  )}
                </View>
              ) : null}

              {detailPanel === 'issues' ? (
                <View style={styles.section}>
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

              {detailPanel === 'holdings' ? (
                <View style={styles.section}>
                  {portfolio.positions.length === 0 ? (
                    <View style={[styles.cleanCard, { backgroundColor: colors.surfaceContainer }]}>
                      <Text style={styles.cleanText}>沒有可計算持股；請先補齊待補備註。</Text>
                    </View>
                  ) : (
                    portfolio.positions.map(position => {
                      const pnl = position.unrealizedPnl || 0;
                      const weight = insights.totalMarketValue > 0 && position.marketValue !== undefined
                        ? (position.marketValue / insights.totalMarketValue) * 100
                        : undefined;
                      const mover = resolveMoverForPosition(position);
                      const dayChangeText = mover
                        ? `${formatMoney(mover.change, true)} · ${formatPercent(mover.changePercent, true)}`
                        : undefined;

                      return (
                        <AccentListCard
                          key={position.id}
                          title={`${position.name}${position.symbol ? ` ${position.symbol}` : ' · 待補股號'}`}
                          amount={position.marketValue === undefined ? '無價格' : formatMoney(position.marketValue)}
                          amountColor={pnlColor(pnl, colors)}
                          onPress={() => openPositionSheet(position)}
                          meta={[
                            { icon: 'cube-outline', text: `${position.shares.toLocaleString()} 股` },
                            { icon: 'wallet-outline', text: `成本 $${position.averageCost.toFixed(2)}` },
                            weight !== undefined
                              ? { icon: 'pie-chart-outline', text: `${weight.toFixed(1)}%` }
                              : { icon: 'pie-chart-outline', text: '—' },
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
                              style={[styles.positionPnl, { color: pnlColor(pnl, colors) }]}
                              selectable
                            >
                              {formatMoney(pnl, true)}
                              {position.unrealizedPnlPercent !== undefined
                                ? ` · ${position.unrealizedPnlPercent >= 0 ? '+' : ''}${position.unrealizedPnlPercent.toFixed(2)}%`
                                : ''}
                            </Text>
                            {dayChangeText ? (
                              <Text style={[styles.positionDayChange, { color: pnlColor(mover!.change, colors) }]}>
                                今日 {dayChangeText}
                              </Text>
                            ) : null}
                            <Text style={styles.positionAccount}>{position.account}</Text>
                          </View>
                        </AccentListCard>
                      );
                    })
                  )}
                </View>
              ) : null}
            </ScrollView>
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {summaryCard}

          <InvestmentTimelineSection
            holdings={currentHoldings}
            assetTimeline={assetTimeline}
            onOpenHolding={openHoldingDetail}
          />

          <View style={styles.section}>
            <SectionHeader
              title="今日變化"
              accent={colors.blue}
              trailing={(
                <Pressable onPress={() => openDetail('holdings')} hitSlop={8}>
                  <Text style={styles.linkTrailing}>
                    持股 · {portfolio.positions.length} 檔
                  </Text>
                </Pressable>
              )}
            />
            <View style={[styles.panel, { borderColor: colors.outlineVariant }]}>
              {insights.movers.length === 0 ? (
                <Text style={styles.emptyMetricText}>沒有前一個交易日的可比收盤價。</Text>
              ) : (
                <>
                  {insights.movers.slice(0, 3).map(mover => (
                    <MoverRow
                      key={mover.id}
                      mover={mover}
                      colors={colors}
                      styles={styles}
                      onPress={() => openMoverDetail(mover)}
                    />
                  ))}
                  {insights.movers.length > 3 ? (
                    <Pressable
                      onPress={() => openSheet({
                        kind: 'movers',
                        title: '今日變化',
                        items: insights.movers,
                      })}
                      hitSlop={6}
                    >
                      <Text style={styles.linkTrailing}>
                        查看全部 · {insights.movers.length} 檔
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title="配置"
              accent={colors.primary}
              trailing={(
                <Pressable onPress={() => openDetail('holdings')} hitSlop={8}>
                  <Text style={styles.linkTrailing}>
                    前三大 {formatPercent(insights.top3Weight)}
                  </Text>
                </Pressable>
              )}
            />
            <View style={[styles.panel, { borderColor: colors.outlineVariant }]}>
              <AllocationChart items={insights.allocation} colors={colors} styles={styles} />
              <AllocationLegend items={insights.allocation} styles={styles} />
              {insights.accountAllocation.length > 0 ? (
                <Text style={styles.accountSummary} numberOfLines={2}>
                  {insights.accountAllocation
                    .map(item => `${item.name} ${formatPercent(item.weight)}`)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title="資料狀態" accent={colors.yellow} />
            {filteredIssues.length === 0 && insights.missingPrices.length === 0 ? (
              <View style={[styles.statusOk, { backgroundColor: colors.greenLight }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={[styles.statusOkText, { color: colors.green }]}>
                  備註與收盤價正常
                  {lastSyncLabel !== '尚未同步' ? ` · 同步 ${lastSyncLabel}` : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.statusRows}>
                {filteredIssues.length > 0 ? (
                  <Pressable
                    style={({ pressed }) => [styles.statusRow, pressed && styles.summaryTilePressed]}
                    onPress={() => openDetail('issues')}
                    accessibilityRole="button"
                  >
                    <View>
                      <Text style={styles.statusRowTitle}>待補備註</Text>
                      <Text style={styles.statusRowSub}>備註無法解析或金額不符</Text>
                    </View>
                    <Text style={[styles.statusRowValue, { color: colors.red }]}>
                      {filteredIssues.length}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
                {insights.missingPrices.length > 0 ? (
                  <Pressable
                    style={({ pressed }) => [styles.statusRow, pressed && styles.summaryTilePressed]}
                    onPress={() => openSheet({
                      kind: 'missingPrices',
                      title: '缺收盤價持股',
                      items: insights.missingPrices,
                    })}
                    accessibilityRole="button"
                  >
                    <View>
                      <Text style={styles.statusRowTitle}>缺收盤價</Text>
                      <Text style={styles.statusRowSub}>點擊查看明細</Text>
                    </View>
                    <Text style={[styles.statusRowValue, { color: colors.yellow }]}>
                      {insights.missingPrices.length}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            )}
            <Text style={styles.dataNote}>
              損益以備註成本與 FinMind 日收盤計算；未含手續費、稅負與除權息還原。
            </Text>
          </View>

          {syncErrors.length > 0 ? (
            <View style={[styles.errorBox, { borderColor: colors.outlineVariant }]}>
              {syncErrors.map(error => (
                <Text key={error} style={styles.errorText} numberOfLines={2}>{error}</Text>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      <InvestmentDetailSheet
        visible={sheetVisible}
        content={sheetContent}
        onClose={closeSheet}
      />
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  filterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 0,
    gap: 8,
  },
  controlLabel: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  filterControls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  scrollContent: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 40, gap: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 28 },
  linkTrailing: { fontSize: 12, fontWeight: '700', color: colors.primary },
  syncIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: colors.surfaceVariant,
    ...withContinuousRadius(RADIUS.full),
  },
  syncIconButtonPressed: { backgroundColor: colors.statePressed },
  summaryCard: {
    backgroundColor: colors.surfaceContainer,
    ...withContinuousRadius(RADIUS.md),
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    marginBottom: 6,
    overflow: 'hidden',
  },
  summaryCardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  summaryHeadlineLabel: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant },
  summaryHeadlineValue: {
    marginTop: 4,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  summaryHeadlineSub: { marginTop: 6, fontSize: 13, fontWeight: '600', color: colors.onSurfaceVariant, lineHeight: 18 },
  segBarContainer: { marginTop: 14, marginBottom: 14 },
  segBarTrack: {
    flexDirection: 'row',
    height: 10,
    backgroundColor: colors.divider,
    borderRadius: 5,
    overflow: 'hidden',
  },
  segBarFill: { height: '100%' },
  segLegendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' },
  segLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  segLegendDot: { width: 8, height: 8, borderRadius: 4 },
  segLegendText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  // ── Metrics Grid（對齊預算頁固定支出／日常／可用餘額）──
  metricsGrid: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12,
  },
  metricItem: { flex: 1, alignItems: 'center' },
  metricHit: { alignItems: 'center', width: '100%' },
  metricItemPressed: { opacity: 0.75 },
  metricLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, letterSpacing: -0.2 },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  metricValue: { fontSize: 17, fontWeight: '800', letterSpacing: -0.5 },
  metricDividerV: { width: 1, height: 32, backgroundColor: colors.divider },
  inlineSummary: { marginHorizontal: 0 },
  summaryTilePressed: { opacity: 0.88 },
  donutWrapper: { alignItems: 'center', paddingVertical: 2 },
  donutCenter: { alignItems: 'center' },
  donutTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  donutLabel: { marginTop: 2, fontSize: 10, color: colors.textMuted },
  panel: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    ...withContinuousRadius(RADIUS.sm),
    padding: 12,
    gap: 10,
  },
  panelFootnote: { fontSize: 11, color: colors.textMuted },
  accountSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  statusOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    ...withContinuousRadius(RADIUS.sm),
  },
  statusOkText: { flex: 1, fontSize: 13, fontWeight: '700' },
  statusRows: { gap: 8 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 12,
    paddingVertical: 12,
    ...withContinuousRadius(RADIUS.sm),
  },
  statusRowTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  statusRowSub: { marginTop: 2, fontSize: 11, color: colors.textMuted },
  statusRowValue: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
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
  moverRowPressed: { opacity: 0.72 },
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
  emptyMetricText: { fontSize: 12, color: colors.textMuted },
  dataNote: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  section: { marginTop: 14 },
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
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginTop: 8,
    gap: 4,
  },
  positionPnl: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  positionDayChange: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  positionAccount: { fontSize: 11, color: colors.textMuted },
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
