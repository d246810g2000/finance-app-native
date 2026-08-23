import React, { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { AppColors, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import SectionHeader from '../ui/SectionHeader';
import ModalBackdrop from '../ui/ModalBackdrop';
import {
  InvestmentTimeline,
  tradesInTimelineMonth,
} from '../../services/investmentTimelineService';
import { StockTrade } from '../../services/stockTradeService';

const SHEET_CHART_WIDTH = Dimensions.get('window').width - 56;

function formatMonthShort(monthKey: string): string {
  if (monthKey.length >= 7) return `${monthKey.slice(2, 4)}.${monthKey.slice(5, 7)}`;
  return monthKey;
}

function formatAmountShort(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

interface InvestmentTimelineSectionProps {
  timelines: InvestmentTimeline[];
  trades: StockTrade[];
  onOpenMonthTrades: (title: string, trades: StockTrade[]) => void;
}

export default function InvestmentTimelineSection({
  timelines,
  trades,
  onOpenMonthTrades,
}: InvestmentTimelineSectionProps) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTimeline, setActiveTimeline] = useState<InvestmentTimeline | null>(null);

  const monthsNewestFirst = useMemo(() => {
    if (!activeTimeline) return [];
    return [...activeTimeline.monthlyAccumulation].sort((a, b) => b.month.localeCompare(a.month));
  }, [activeTimeline]);

  const chartData = useMemo(() => {
    if (!activeTimeline || activeTimeline.monthlyAccumulation.length === 0) return [];
    const chronological = [...activeTimeline.monthlyAccumulation].sort((a, b) =>
      a.month.localeCompare(b.month),
    );
    const peak = Math.max(...chronological.map(m => m.cumulative), 1);
    const timeline = activeTimeline;

    return chronological.map(month => {
      const isPeak = month.cumulative === peak && peak > 0;
      return {
        value: month.cumulative,
        label: formatMonthShort(month.month),
        dataPointText: formatAmountShort(month.cumulative),
        textColor: colors.textMuted,
        textFontSize: 9,
        textShiftY: -10,
        dataPointColor: isPeak ? colors.red : colors.primary,
        dataPointRadius: isPeak ? 5 : 3,
        onPress: () => {
          const monthTrades = tradesInTimelineMonth(trades, timeline.id, month.month);
          const monthLabel = formatMonthShort(month.month);
          onOpenMonthTrades(`${timeline.name} · ${monthLabel}`, monthTrades);
          setActiveTimeline(null);
        },
      };
    });
  }, [activeTimeline, colors, onOpenMonthTrades, trades]);

  const openMonthTrades = useCallback((monthKey: string) => {
    if (!activeTimeline) return;
    const monthTrades = tradesInTimelineMonth(trades, activeTimeline.id, monthKey);
    const monthLabel = formatMonthShort(monthKey);
    onOpenMonthTrades(`${activeTimeline.name} · ${monthLabel}`, monthTrades);
    setActiveTimeline(null);
  }, [activeTimeline, onOpenMonthTrades, trades]);

  if (timelines.length === 0) return null;

  return (
    <>
      <View style={styles.section}>
        <SectionHeader title="投資資產累積" accent={colors.primary} style={styles.sectionHeader} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardScroll}
        >
          {timelines.map(timeline => (
            <Pressable
              key={timeline.id}
              style={styles.card}
              onPress={() => setActiveTimeline(timeline)}
              accessibilityRole="button"
              accessibilityLabel={`${timeline.name}，累積投入 ${timeline.totalNetInvested} 元`}
            >
              <Text style={styles.cardName} numberOfLines={1}>
                {timeline.name}
              </Text>
              <Text style={styles.cardAmount}>
                {formatMoney(timeline.totalNetInvested)}
              </Text>
              <Text style={styles.cardMeta}>
                {timeline.monthSpan} 個月 · {timeline.tradeCount} 筆
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Modal
        visible={!!activeTimeline}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveTimeline(null)}
      >
        <ModalBackdrop colors={colors} placement="bottom" isDark={isDark}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveTimeline(null)} />
          {activeTimeline ? (
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>{activeTimeline.name}</Text>
              <Text style={styles.sheetSub}>
                {activeTimeline.firstDate} – {activeTimeline.lastDate} ·{' '}
                {activeTimeline.monthSpan} 個月 · {activeTimeline.tradeCount} 筆
              </Text>
              <Text style={styles.sheetAmount}>
                累積 {formatMoney(activeTimeline.totalNetInvested)}
              </Text>

              {chartData.length > 1 ? (
                <View style={styles.chartWrap}>
                  <Text style={styles.chartCaption}>累積投入趨勢（點圖可看該月交易）</Text>
                  <LineChart
                    data={chartData}
                    areaChart
                    curved
                    color={colors.primary}
                    startFillColor={colors.primary}
                    endFillColor={colors.primary}
                    startOpacity={0.22}
                    endOpacity={0.02}
                    thickness={2.5}
                    hideDataPoints={false}
                    maxValue={Math.max(...chartData.map(d => d.value), 1) * 1.25}
                    noOfSections={3}
                    spacing={Math.max(
                      36,
                      Math.min(56, (SHEET_CHART_WIDTH - 40) / Math.max(chartData.length - 1, 1)),
                    )}
                    initialSpacing={16}
                    endSpacing={28}
                    scrollToEnd
                    rulesColor={colors.divider}
                    yAxisThickness={0}
                    xAxisThickness={0}
                    yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                    width={SHEET_CHART_WIDTH}
                    height={132}
                    formatYLabel={v => formatAmountShort(Number(v))}
                  />
                </View>
              ) : null}

              <Text style={styles.sheetLabel}>月累積（新 → 舊）</Text>
              <ScrollView style={styles.monthList} showsVerticalScrollIndicator={false}>
                {monthsNewestFirst.map(month => {
                  const peak = Math.max(...activeTimeline.monthlyAccumulation.map(m => m.cumulative), 1);
                  const pct = peak > 0 ? Math.round((month.cumulative / peak) * 100) : 0;
                  const monthLabel = formatMonthShort(month.month);
                  const flowLabel = month.netFlow >= 0
                    ? `+${formatMoney(month.netFlow)}`
                    : `-${formatMoney(Math.abs(month.netFlow))}`;

                  return (
                    <Pressable
                      key={month.month}
                      onPress={() => openMonthTrades(month.month)}
                      accessibilityRole="button"
                      accessibilityLabel={`${monthLabel} 累積 ${month.cumulative} 元`}
                      android_ripple={{ color: colors.outlineVariant }}
                      style={({ pressed }) => [pressed && { opacity: 0.75 }]}
                    >
                      <View style={styles.monthRow}>
                        <View style={styles.monthCopy}>
                          <Text style={styles.monthKey} numberOfLines={1}>
                            {monthLabel}
                          </Text>
                          <Text style={styles.monthFlow}>{flowLabel} 當月</Text>
                        </View>
                        <Text style={styles.monthAmt}>
                          {formatMoney(month.cumulative)}
                        </Text>
                        <Text style={styles.monthPct}>{pct}%</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </ModalBackdrop>
      </Modal>
    </>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { marginTop: 4 },
  sectionHeader: { marginBottom: 2 },
  cardScroll: { gap: 10, paddingTop: 8, paddingBottom: 4 },
  card: {
    minWidth: 112,
    backgroundColor: colors.surfaceContainer,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    minHeight: 88,
  },
  cardName: { fontSize: 13, fontWeight: '700', color: colors.onSurfaceVariant, marginBottom: 4 },
  cardAmount: { fontSize: 16, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  cardMeta: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 4 },
  sheet: {
    backgroundColor: colors.surfaceContainer,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '82%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: colors.outline,
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  sheetSub: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
  sheetAmount: { fontSize: 28, fontWeight: '800', color: colors.primary, marginTop: 12 },
  chartWrap: { marginTop: 16, marginHorizontal: -4, paddingTop: 4, paddingBottom: 4 },
  chartCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 8,
  },
  monthList: { maxHeight: 180 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    gap: 8,
  },
  monthCopy: { flex: 1 },
  monthKey: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  monthFlow: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  monthAmt: { fontSize: 15, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] },
  monthPct: { fontSize: 12, color: colors.textMuted, minWidth: 32, textAlign: 'right' },
});
