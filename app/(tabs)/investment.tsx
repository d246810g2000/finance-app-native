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
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../../context/FinanceContext';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { LinearGradient } from 'expo-linear-gradient';
import PageChrome from '../../components/layout/PageChrome';
import SectionHeader from '../../components/ui/SectionHeader';
import SegmentedControl from '../../components/ui/SegmentedControl';
import EmptyState from '../../components/ui/EmptyState';
import DateRangeSelector from '../../components/DateRangeSelector';
import CompactSummaryBar from '../../components/ui/CompactSummaryBar';
import InvestmentDetailSheet, {
  InvestmentSheetContent,
} from '../../components/investment/InvestmentDetailSheet';
import InvestmentDrillHeader from '../../components/investment/InvestmentDrillHeader';
import HoldingsPickGrid from '../../components/investment/HoldingsPickGrid';
import PositionDetailPanel, {
  buildPositionDetailFromHolding,
} from '../../components/investment/PositionDetailPanel';
import RealizedTradesTable from '../../components/investment/RealizedTradesTable';
import StockTradesTable from '../../components/investment/StockTradesTable';
import InvestmentTimelineSection from '../../components/investment/InvestmentTimelineSection';
import InvestmentPnlSection from '../../components/investment/InvestmentPnlSection';
import HuiQianSection from '../../components/investment/HuiQianSection';
import {
  StockNoteIssue,
  StockNoteIssueReason,
  StockOwnership,
  roundStockPrincipal,
} from '../../services/stockTradeService';
import {
  createDefaultInvestmentDateRange,
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
import type { InvestmentPnlRow } from '../../viewModels/investmentPnlViewModel';
type OwnershipFilter = 'all' | StockOwnership;
type DetailPanel = 'holdings' | 'realized' | 'trades' | 'issues';
type InvestmentStyles = ReturnType<typeof createStyles>;

const DETAIL_TITLES: Record<DetailPanel, string> = {
  holdings: '未實現持股',
  realized: '已實現損益',
  trades: '交易紀錄',
  issues: '資料問題',
};

const REASON_LABELS: Record<StockNoteIssueReason, string> = {
  missing_note: '缺整段備註',
  missing_name: '缺股票名稱',
  missing_buy_price: '缺買入價',
  missing_sell_prices: '缺 成本->賣出價',
  missing_shares: '缺股數',
  missing_dividend_per_share: '缺每股股利',
  unparsed_line: '備註格式無法解析',
  amount_mismatch: '價格×股數與金額不一致',
  corporate_action: '公司配股待確認',
};

const SIDE_LABELS: Record<string, string> = {
  buy: '買入',
  sell: '賣出',
  dividend: '股息',
  corporate_action: '配股',
};

function formatDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`;
  }
  return value;
}

function formatSyncLabel(syncedAt: string | number): string {
  const date = new Date(syncedAt);
  if (Number.isNaN(date.getTime())) return '尚未同步';
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yy}/${mm}/${dd} ${hh}:${min}`;
}

function formatMoney(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function formatShortDateRange(start: Date, end: Date): string {
  const fmt = (date: Date) => date.toLocaleDateString('zh-TW', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatPercent(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
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
        <View style={[
          styles.sideBadge,
          issue.side === 'sell'
            ? styles.sellBadge
            : issue.side === 'dividend'
              ? styles.dividendBadge
              : styles.buyBadge,
        ]}>
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

export default function InvestmentScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { records } = useFinance();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { account: accountParam } = useLocalSearchParams<{ account?: string }>();

  const [ownership, setOwnership] = useState<OwnershipFilter>('all');
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [detailPanel, setDetailPanel] = useState<DetailPanel | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<InvestmentPnlRow | null>(null);
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

  useEffect(() => {
    setAccountFilter(typeof accountParam === 'string' && accountParam.length > 0 ? accountParam : null);
  }, [accountParam]);

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
    portfolio,
    rangeFilteredTrades,
    rangeRealizedTrades,
    periodRealizedPnl,
    pnl,
    stockData,
  } = useMemo(() => buildInvestmentScreenData({
    records,
    ownership,
    account: accountFilter,
    infoCache,
    priceCache,
    startDate,
    endDate,
  }), [records, ownership, accountFilter, infoCache, priceCache, startDate, endDate]);

  useEffect(() => {
    if (detailPanel !== 'holdings') {
      setSelectedHolding(null);
    }
  }, [detailPanel]);

  const selectedHoldingDetail = useMemo(() => {
    if (!selectedHolding) return null;
    return buildPositionDetailFromHolding(
      selectedHolding,
      portfolio.positions,
      filteredTrades,
      portfolio.realizedTrades,
    );
  }, [filteredTrades, portfolio.positions, portfolio.realizedTrades, selectedHolding]);

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
    ? formatSyncLabel(priceCache.syncedAt)
    : '尚未同步';
  const hasStockData = computedHasStockData;
  const hasHuiQianData = useMemo(
    () => records.some(record => record['收款(轉入)'] === '25號會錢'),
    [records],
  );

  const ownershipOptions = [
    { value: 'all' as OwnershipFilter, label: '全部', icon: 'apps-outline' as const },
    { value: 'personal' as OwnershipFilter, label: '個人', icon: 'person-outline' as const },
    { value: 'shared' as OwnershipFilter, label: '共享', icon: 'people-outline' as const },
  ];

  const openDetail = useCallback((panel: DetailPanel) => setDetailPanel(panel), []);
  const closeDetail = useCallback(() => {
    setSelectedHolding(null);
    setDetailPanel(null);
  }, []);
  const handleDrillBack = useCallback(() => {
    if (detailPanel === 'holdings' && selectedHolding) {
      setSelectedHolding(null);
      return;
    }
    closeDetail();
  }, [closeDetail, detailPanel, selectedHolding]);

  const summarySplits = useMemo(
    () => pnl.splits.filter(split => split.value > 0),
    [pnl.splits],
  );

  const periodRealizedCost = useMemo(
    () => rangeRealizedTrades.reduce(
      (sum, trade) => sum + roundStockPrincipal(Math.max(0, trade.costPrice), trade.shares),
      0,
    ),
    [rangeRealizedTrades],
  );
  const periodRealizedPercent = periodRealizedCost > 0
    ? (periodRealizedPnl / periodRealizedCost) * 100
    : undefined;

  const ownershipFilter = (
    <View style={styles.filterSection}>
      <View style={styles.filterCopy}>
        <Text style={styles.controlLabel}>帳戶範圍</Text>
        <Text style={styles.syncLabel}>更新 {lastSyncLabel}</Text>
      </View>
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
      {accountFilter ? (
        <View style={styles.accountFilterBanner}>
          <Ionicons name="wallet-outline" size={15} color={colors.primary} />
          <Text style={styles.accountFilterText} numberOfLines={1}>帳戶：{accountFilter}</Text>
          <Pressable
            onPress={() => setAccountFilter(null)}
            style={styles.accountFilterClear}
            accessibilityRole="button"
            accessibilityLabel="清除帳戶篩選"
          >
            <Ionicons name="close-circle" size={18} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingBottom: Math.max(72, insets.bottom + 88) }],
    [insets.bottom, styles.scrollContent],
  );
  const drillScrollContentStyle = useMemo(
    () => [styles.drillScrollContent, { paddingBottom: Math.max(72, insets.bottom + 88) }],
    [insets.bottom, styles.drillScrollContent],
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
      <Text
        style={styles.summaryHeadlineValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        selectable
      >
        {formatMoney(insights.totalMarketValue)}
      </Text>
      <View style={styles.segBarContainer}>
        <View style={styles.segBarTrack}>
          {summarySplits.map(split => (
            <View
              key={split.id}
              style={[styles.segBarFill, {
                width: `${split.weight}%`,
                backgroundColor: split.id === 'profit'
                  ? colors.red
                  : split.id === 'loss'
                    ? colors.green
                    : colors.divider,
              }]}
            />
          ))}
        </View>
        <View style={styles.segLegendRow}>
          {summarySplits.map(split => (
            <View key={split.id} style={styles.segLegendItem}>
              <View
                style={[styles.segLegendDot, {
                  backgroundColor: split.id === 'profit'
                    ? colors.red
                    : split.id === 'loss'
                      ? colors.green
                      : colors.divider,
                }]}
              />
              <Text style={styles.segLegendText}>
                {split.label} {formatPercent(split.weight)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <View style={styles.metricHit} accessibilityLabel={`今日損益 ${formatMoney(insights.dayPnl, true)}，${insights.dayAdvances} 漲 ${insights.dayDeclines} 跌`}>
              <View style={styles.metricLabelRow}>
                <Ionicons name="pulse-outline" size={12} color={colors.blue} />
                <Text style={styles.metricLabel}>今日</Text>
              </View>
              <Text style={[styles.metricValue, { color: pnlColor(insights.dayPnl, colors) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {formatMoney(insights.dayPnl, true)}
              </Text>
              <Text style={[styles.metricSubValue, { color: pnlColor(insights.dayPnl, colors) }]} numberOfLines={1}>
                {formatPercent(insights.dayPnlPercent, true)}
              </Text>
            </View>
          </View>
          <View style={styles.metricDividerV} />
          <View style={styles.metricItem}>
            <Pressable
              onPress={() => openDetail('holdings')}
              style={({ pressed }) => [styles.metricHit, pressed && styles.metricItemPressed]}
              accessibilityRole="button"
              accessibilityLabel={`未實現損益 ${formatMoney(pnl.summary.unrealizedPnl, true)}，報酬率 ${formatPercent(pnl.summary.unrealizedPnlPercent, true)}，${pnl.summary.profitCount} 獲利 ${pnl.summary.lossCount} 虧損，查看持股`}
            >
              <View style={styles.metricLabelRow}>
                <Ionicons name="trending-up-outline" size={12} color={colors.primary} />
                <Text style={styles.metricLabel}>未實現</Text>
              </View>
              <Text style={[styles.metricValue, { color: pnlColor(pnl.summary.unrealizedPnl, colors) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {formatMoney(pnl.summary.unrealizedPnl, true)}
              </Text>
              <Text style={[styles.metricSubValue, { color: pnlColor(pnl.summary.unrealizedPnlPercent, colors) }]} numberOfLines={1}>
                {formatPercent(pnl.summary.unrealizedPnlPercent, true)}
              </Text>
            </Pressable>
          </View>
          <View style={styles.metricDividerV} />
          <View style={styles.metricItem}>
            <Pressable
              onPress={() => openDetail('realized')}
              style={({ pressed }) => [styles.metricHit, pressed && styles.metricItemPressed]}
              accessibilityRole="button"
              accessibilityLabel={`區間已實現 ${formatMoney(periodRealizedPnl, true)}，報酬率 ${periodRealizedPercent === undefined ? '無法評價' : formatPercent(periodRealizedPercent, true)}，${rangeRealizedTrades.length} 筆`}
            >
              <View style={styles.metricLabelRow}>
                <Ionicons name="checkmark-done-outline" size={12} color={colors.primary} />
                <Text style={styles.metricLabel}>已實現</Text>
              </View>
              <Text style={[styles.metricValue, { color: pnlColor(periodRealizedPnl, colors) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {formatMoney(periodRealizedPnl, true)}
              </Text>
              <Text style={[styles.metricSubValue, {
                color: periodRealizedPercent === undefined
                  ? colors.textMuted
                  : pnlColor(periodRealizedPercent, colors),
              }]} numberOfLines={1}>
                {periodRealizedPercent === undefined ? '—' : formatPercent(periodRealizedPercent, true)}
              </Text>
            </Pressable>
          </View>
          <View style={styles.metricDividerV} />
          <View style={[styles.metricItem, styles.metricItemTrade]}>
            <Pressable
              onPress={() => openDetail('trades')}
              style={({ pressed }) => [styles.metricHit, pressed && styles.metricItemPressed]}
              accessibilityRole="button"
              accessibilityLabel={`區間交易 ${rangeFilteredTrades.length} 筆`}
            >
              <View style={styles.metricLabelRow}>
                <Ionicons name="swap-horizontal-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.metricLabel}>交易</Text>
              </View>
              <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {rangeFilteredTrades.length}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );

  if (!hasStockData && !hasHuiQianData) {
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

  const rangeBuyAmount = rangeFilteredTrades
    .filter(trade => trade.side === 'buy')
    .reduce((sum, trade) => sum + trade.amount, 0);
  const rangeSellAmount = rangeFilteredTrades
    .filter(trade => trade.side === 'sell')
    .reduce((sum, trade) => sum + trade.amount, 0);
  const chromeSubLabel = detailPanel
    ? (detailPanel === 'holdings'
      ? `${pnl.rows.length} 檔 · 市值 ${formatMoney(insights.totalMarketValue)}`
      : formatShortDateRange(startDate, endDate))
    : `總市值 ${formatMoney(insights.totalMarketValue)} · ${portfolio.positions.length} 檔`;
  const detailTrailing = detailPanel === 'holdings'
    ? (selectedHolding
      ? `${selectedHolding.shares.toLocaleString()} 股`
      : `${pnl.rows.length} 檔`)
    : detailPanel === 'realized'
      ? `${rangeRealizedTrades.length} 筆`
      : detailPanel === 'trades'
        ? `${rangeFilteredTrades.length} 筆`
        : detailPanel === 'issues'
          ? `${filteredIssues.length} 筆`
          : undefined;

  return (
    <View style={styles.container}>
      <PageChrome>
        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          subLabel={chromeSubLabel}
        />
      </PageChrome>

      {ownershipFilter}

      {detailPanel ? (
        <View style={styles.drillPanel}>
          <InvestmentDrillHeader
            title={detailPanel === 'holdings' && selectedHolding
              ? `${selectedHolding.name}${selectedHolding.symbol ? ` ${selectedHolding.symbol}` : ''}`
              : DETAIL_TITLES[detailPanel]}
            trailing={detailTrailing}
            onBack={handleDrillBack}
            colors={colors}
          />

          <ScrollView
            style={styles.drillList}
            contentContainerStyle={drillScrollContentStyle}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {detailPanel === 'holdings' ? (
              <View style={styles.drillSection}>
                {selectedHolding && selectedHoldingDetail ? (
                  <PositionDetailPanel
                    position={selectedHoldingDetail.position}
                    buys={selectedHoldingDetail.buys}
                    sells={selectedHoldingDetail.sells}
                    pnlMetrics={selectedHoldingDetail.pnlMetrics}
                  />
                ) : (
                  <>
                    <CompactSummaryBar
                      compact
                      style={styles.inlineSummary}
                      items={[
                        { label: '持股', value: `${pnl.rows.length} 檔` },
                        { label: '市值', value: formatMoney(insights.totalMarketValue) },
                        {
                          label: '未實現',
                          value: formatMoney(insights.unrealizedPnl, true),
                          valueColor: pnlColor(insights.unrealizedPnl, colors),
                        },
                      ]}
                    />
                    <Text style={styles.holdingGridHint}>點選個股查看庫存與成交明細</Text>
                    <HoldingsPickGrid
                      rows={pnl.rows}
                      onSelect={setSelectedHolding}
                    />
                  </>
                )}
              </View>
            ) : null}

            {detailPanel === 'realized' ? (
              <View style={styles.drillSection}>
                <CompactSummaryBar
                  compact
                  style={styles.inlineSummary}
                  items={[
                    {
                      label: '區間合計',
                      value: formatMoney(periodRealizedPnl, true),
                      valueColor: pnlColor(periodRealizedPnl, colors),
                    },
                    { label: '交易筆數', value: `${rangeRealizedTrades.length} 筆` },
                    {
                      label: '全期合計',
                      value: formatMoney(insights.realizedPnl, true),
                      valueColor: pnlColor(insights.realizedPnl, colors),
                    },
                  ]}
                />
                <View style={styles.drillTablePanel}>
                  <RealizedTradesTable trades={rangeRealizedTrades} />
                </View>
              </View>
            ) : null}

            {detailPanel === 'trades' ? (
              <View style={styles.drillSection}>
                <CompactSummaryBar
                  compact
                  style={styles.inlineSummary}
                  items={[
                    { label: '買入', value: `${rangeFilteredTrades.filter(trade => trade.side === 'buy').length} 筆 · ${formatMoney(rangeBuyAmount)}` },
                    { label: '賣出', value: `${rangeFilteredTrades.filter(trade => trade.side === 'sell').length} 筆 · ${formatMoney(rangeSellAmount)}` },
                  ]}
                />
                <View style={styles.drillTablePanel}>
                  <StockTradesTable trades={rangeFilteredTrades} />
                </View>
              </View>
            ) : null}

            {detailPanel === 'issues' ? (
              <View style={styles.drillSection}>
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
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={scrollContentStyle}>
          {hasStockData ? summaryCard : null}

          {hasStockData ? (
            <>
              <InvestmentTimelineSection
                assetTimeline={assetTimeline}
              />

              <InvestmentPnlSection
                data={pnl}
                onOpenMissingPrices={() => openSheet({
                  kind: 'missingPrices',
                  title: '缺收盤價持股',
                  items: insights.missingPrices,
                })}
              />
            </>
          ) : null}

          {hasHuiQianData ? (
            <View style={styles.section}>
              <SectionHeader title="會錢" accent={colors.primary} />
              <HuiQianSection records={records} />
            </View>
          ) : null}

          {syncErrors.length > 0 ? (
            <View style={[styles.errorBox, { borderColor: colors.outlineVariant }]}>
              {syncErrors.map(error => (
                <Text key={error} style={styles.errorText} numberOfLines={2}>{error}</Text>
              ))}
            </View>
          ) : null}

          {hasStockData ? <View style={styles.section}>
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
          </View> : null}

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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 0,
    gap: 8,
  },
  controlLabel: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  filterCopy: {
    minWidth: 0,
    flexShrink: 1,
  },
  syncLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  filterControls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  accountFilterBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    minHeight: 36,
    backgroundColor: colors.primaryContainer,
    ...withContinuousRadius(RADIUS.sm),
  },
  accountFilterText: { flex: 1, color: colors.onPrimaryContainer, fontSize: 12, fontWeight: '700' },
  accountFilterClear: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 40, gap: 4 },
  drillScrollContent: { paddingHorizontal: 16, gap: 10, flexGrow: 1 },
  drillPanel: { flex: 1 },
  drillList: { flex: 1 },
  drillTablePanel: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.sm),
    overflow: 'hidden',
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 28 },
  linkTrailing: { fontSize: 12, fontWeight: '700', color: colors.primary },
  linkTrailingButton: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
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
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
  },
  metricDividerH: {
    height: 1,
    backgroundColor: colors.divider,
  },
  metricItem: { flex: 1, minWidth: 0, alignItems: 'center' },
  metricItemTrade: { flex: 0.68 },
  metricHit: { alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44 },
  metricItemPressed: { opacity: 0.75 },
  metricLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: -0.2 },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  metricValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  metricSubValue: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricDividerV: { width: 1, height: 32, backgroundColor: colors.divider },
  inlineSummary: { marginHorizontal: 0, marginTop: 0 },
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
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 4,
  },
  legendItemPressed: { opacity: 0.72 },
  legendIdentity: { flex: 1, minWidth: 0 },
  legendDot: {
    width: 8,
    height: 8,
    ...withContinuousRadius(RADIUS.full),
    backgroundColor: colors.primary,
  },
  legendName: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
  legendMeta: {
    fontSize: 11,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  legendValue: {
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
  section: { marginTop: 14 },
  drillSection: { gap: 8 },
  holdingGridHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    paddingHorizontal: 2,
    marginBottom: 2,
  },
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
  dividendBadge: { backgroundColor: colors.yellowLight },
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
