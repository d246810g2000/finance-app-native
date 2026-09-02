import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import type { RawRecord } from '../../types';

const TOTAL_MEMBERS = 37;
const MONTHLY_CONTRIBUTION = 10_000;
const DEFAULT_DEAD_MEMBERS = 10;
const MIN_BID = 800;
const MAX_BID = 10_000;
const RECENT_BID_WINDOW = 5;
const DEFAULT_MY_BID = 1_000;

function formatMoney(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

export default function HuiQianSection({ records = [] }: { records?: RawRecord[] }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [bidText, setBidText] = useState(String(DEFAULT_MY_BID));
  const [selectedPeriod, setSelectedPeriod] = useState(20);
  const [unknownBidText, setUnknownBidText] = useState('');
  const bidEdited = useRef(false);
  const unknownBidEdited = useRef(false);

  const parsedBid = Number.parseInt(bidText, 10);
  const bidIsValid = Number.isInteger(parsedBid) && parsedBid >= MIN_BID && parsedBid <= MAX_BID;
  const bid = bidIsValid ? parsedBid : MIN_BID;
  const parsedUnknownBid = Number.parseInt(unknownBidText, 10);
  const unknownBidIsValid = Number.isInteger(parsedUnknownBid)
    && parsedUnknownBid >= MIN_BID
    && parsedUnknownBid <= MAX_BID;
  const unknownBid = unknownBidIsValid ? parsedUnknownBid : MIN_BID;
  const canCalculate = bidIsValid && unknownBidIsValid;
  const winPeriod = selectedPeriod;
  const huiRecords = useMemo(() => records
    .filter(record => record['收款(轉入)'] === '25號會錢' && Number(record['金額']) > 0)
    .sort((left, right) => String(left['日期'] || '').localeCompare(String(right['日期'] || ''))), [records]);
  const knownBids = huiRecords.map(record => Math.max(0, MONTHLY_CONTRIBUTION - Number(record['金額'] || 0)));
  const recentBidHistory = knownBids.filter(value => value >= MIN_BID).slice(-RECENT_BID_WINDOW);
  const recentBidsSorted = [...recentBidHistory].sort((left, right) => left - right);
  const defaultAssumedBid = recentBidsSorted.length === 0
    ? MIN_BID
    : recentBidsSorted[Math.floor(recentBidsSorted.length / 2)];
  useEffect(() => {
    if (!unknownBidEdited.current) setUnknownBidText(String(defaultAssumedBid));
  }, [defaultAssumedBid]);
  const projectedBids = Array.from({ length: TOTAL_MEMBERS }, (_, index) => knownBids[index] ?? unknownBid);
  const priorBids = projectedBids.slice(0, Math.max(0, winPeriod - 1));
  const investedBeforeWin = priorBids.reduce((sum, value) => sum + MONTHLY_CONTRIBUTION - value, 0);
  const liveEarningsBeforeWin = priorBids.reduce((sum, value) => sum + value, 0);
  const monthlyReturn = investedBeforeWin > 0 ? liveEarningsBeforeWin / investedBeforeWin : undefined;
  const deadAtWin = Math.min(TOTAL_MEMBERS - 1, DEFAULT_DEAD_MEMBERS + Math.max(0, winPeriod - DEFAULT_DEAD_MEMBERS - 1));
  const liveOthers = TOTAL_MEMBERS - 1 - deadAtWin;
  const deadIncome = deadAtWin * MONTHLY_CONTRIBUTION;
  const liveIncome = liveOthers * (MONTHLY_CONTRIBUTION - bid);
  const payout = deadIncome + liveIncome;
  const bidCost = liveOthers * bid;
  const netBenefit = liveEarningsBeforeWin - bidCost;
  const remainingPayments = Math.max(0, TOTAL_MEMBERS - winPeriod);
  const annualizedReturn = monthlyReturn === undefined
    ? undefined
    : 1 + netBenefit / investedBeforeWin <= 0
      ? undefined
      : ((1 + netBenefit / investedBeforeWin) ** (12 / Math.max(1, priorBids.length)) - 1) * 100;
  const projectedAnnualizedForPeriod = (period: number) => {
    const bids = projectedBids.slice(0, period - 1);
    const paid = bids.reduce((sum, value) => sum + MONTHLY_CONTRIBUTION - value, 0);
    if (paid <= 0 || bids.length === 0) return 0;
    const profit = bids.reduce((sum, value) => sum + value, 0);
    const dead = Math.min(TOTAL_MEMBERS - 1, DEFAULT_DEAD_MEMBERS + Math.max(0, period - DEFAULT_DEAD_MEMBERS - 1));
    const bidCostAtPeriod = (TOTAL_MEMBERS - 1 - dead) * bid;
    const net = profit - bidCostAtPeriod;
    if (1 + net / paid <= 0) return -100;
    return ((1 + net / paid) ** (12 / bids.length) - 1) * 100;
  };
  const chartData = Array.from({ length: TOTAL_MEMBERS }, (_, index) => ({
    value: projectedAnnualizedForPeriod(index + 1),
    label: index === 0 || (index + 1) % 5 === 0 ? String(index + 1) : '',
    period: index + 1,
  }));
  const bestPeriod = chartData.slice(1).reduce((best, point, index) => (
    point.value > best.value ? { value: point.value, period: index + 2 } : best
  ), { value: Number.NEGATIVE_INFINITY, period: 2 });
  const breakEvenPeriod = chartData.slice(1).reduce((best, point, index) => (
    Math.abs(point.value) < Math.abs(best.value) ? { value: point.value, period: index + 2 } : best
  ), { value: Number.POSITIVE_INFINITY, period: 2 });
  const earliestCashPeriod = chartData.slice(1).find(point => point.value >= 0) || chartData[1];
  const chartWidth = 260;
  const chartHeight = 54;
  const chartPadding = { left: 8, right: 8, top: 5, bottom: 12 };
  const chartPoints = useMemo(() => {
    const values = chartData.map(point => point.value);
    const transform = (value: number) => Math.sign(value) * Math.log10(1 + Math.abs(value));
    const transformed = values.map(transform);
    const min = Math.min(...transformed);
    const max = Math.max(...transformed);
    const xSpan = chartWidth - chartPadding.left - chartPadding.right;
    const ySpan = chartHeight - chartPadding.top - chartPadding.bottom;
    return transformed.map((value, index) => ({
      x: chartPadding.left + (index / (TOTAL_MEMBERS - 1)) * xSpan,
      y: chartPadding.top + (max - value) / Math.max(0.001, max - min) * ySpan,
      value: values[index],
      period: index + 1,
    }));
  }, [chartData]);
  const chartZeroY = useMemo(() => {
    const values = chartData.map(point => Math.sign(point.value) * Math.log10(1 + Math.abs(point.value)));
    const min = Math.min(...values);
    const max = Math.max(...values);
    return chartPadding.top + (max - 0) / Math.max(0.001, max - min)
      * (chartHeight - chartPadding.top - chartPadding.bottom);
  }, [chartData]);

  const handleBidChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    const numericValue = Number.parseInt(digitsOnly, 10);
    bidEdited.current = true;
    setBidText(Number.isFinite(numericValue) && numericValue > MAX_BID
      ? String(MAX_BID)
      : digitsOnly);
  };

  const inputControls = (
    <>
      <View style={styles.inputGrid}>
        <View style={styles.inputRow}>
          <Text style={styles.label}>我的標金</Text>
          <TextInput value={bidText} onChangeText={handleBidChange} keyboardType="number-pad" inputMode="numeric" maxLength={5} onBlur={() => { if (!bidText || Number.parseInt(bidText, 10) < MIN_BID) setBidText(String(MIN_BID)); }} style={[styles.input, !bidIsValid && styles.inputInvalid]} accessibilityLabel="25號會錢標金" />
          <Text style={styles.unit}>元</Text>
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.label}>未知假設</Text>
          <TextInput value={unknownBidText} onChangeText={value => { const digitsOnly = value.replace(/\D/g, ''); const numericValue = Number.parseInt(digitsOnly, 10); unknownBidEdited.current = true; setUnknownBidText(Number.isFinite(numericValue) && numericValue > MAX_BID ? String(MAX_BID) : digitsOnly); }} onBlur={() => { if (!unknownBidText || Number.parseInt(unknownBidText, 10) < MIN_BID) setUnknownBidText(String(MIN_BID)); }} keyboardType="number-pad" inputMode="numeric" maxLength={5} style={[styles.input, !unknownBidIsValid && styles.inputInvalid]} accessibilityLabel="未知期數假設標金" />
          <Text style={styles.unit}>元</Text>
        </View>
      </View>
      <View style={styles.quickBidRow}>
        {[800, 1_000, 1_200, 1_500].map(value => (
          <Text
            key={value}
            onPress={() => { bidEdited.current = true; setBidText(String(value)); }}
            style={[styles.quickBid, bid === value && styles.quickBidActive]}
          >
            {value.toLocaleString()}
          </Text>
        ))}
        <Text onPress={() => { bidEdited.current = false; unknownBidEdited.current = false; setBidText(String(DEFAULT_MY_BID)); setUnknownBidText(String(defaultAssumedBid)); }} style={styles.resetButton}>重設</Text>
      </View>
    </>
  );

  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <Text style={styles.metaPill}>目前第 {Math.min(TOTAL_MEMBERS, huiRecords.length)} 期</Text>
        <Text style={styles.metaPill}>37 人</Text>
        <Text style={styles.metaPill}>已死會 10 人</Text>
        <Text style={styles.metaPill}>活會 26 人</Text>
      </View>
      {inputControls}
      {canCalculate ? (<>
      <View style={styles.recommendation}>
        <Text style={styles.recommendationLabel}>策略分析</Text>
        <View style={styles.strategyRow}>
          <Text style={styles.strategyLabel}>最高報酬</Text>
          <Text style={styles.strategyValue}>第 {bestPeriod.period} 期 · {bestPeriod.value.toFixed(2)}%</Text>
        </View>
        <View style={styles.strategyRow}>
          <Text style={styles.strategyLabel}>損益平衡</Text>
          <Text style={styles.strategyValue}>第 {breakEvenPeriod.period} 期 · {breakEvenPeriod.value.toFixed(2)}%</Text>
        </View>
        <View style={styles.strategyRow}>
          <Text style={styles.strategyLabel}>最早正報酬</Text>
          <Text style={styles.strategyValue}>第 {earliestCashPeriod.period} 期 · {earliestCashPeriod.value.toFixed(2)}%</Text>
        </View>
      </View>

      <View style={styles.scenarioBox}>
        <Text style={styles.scenarioTitle}>得標時機比較</Text>
        <View style={styles.chartFrame}>
          <Svg width={chartWidth} height={chartHeight}>
            <Line x1={chartPadding.left} y1={chartZeroY} x2={chartWidth - chartPadding.right} y2={chartZeroY} stroke={colors.red} strokeWidth={1.5} />
            <Polyline points={chartPoints.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors.primary} strokeWidth={2} />
            {chartPoints.map(point => (
              <Circle
                key={point.period}
                cx={point.x}
                cy={point.y}
                r={point.period === selectedPeriod ? 5 : 2.5}
                fill={point.period === selectedPeriod
                  ? colors.yellow
                  : point.period <= huiRecords.length ? colors.textMuted : colors.primary}
              />
            ))}
          </Svg>
          {chartPoints.map(point => (
            <Pressable
              key={`hit-${point.period}`}
              onPress={() => setSelectedPeriod(point.period)}
              style={[styles.chartHit, { left: point.x - 8, top: point.y - 12 }]}
              accessibilityRole="button"
              accessibilityLabel={`第 ${point.period} 期，年化報酬 ${point.value.toFixed(2)}%`}
            />
          ))}
        </View>
        <View style={styles.chartLegend}>
          <Text style={styles.legendText}><Text style={{ color: colors.primary }}>●</Text> 年化報酬</Text>
          <Text style={styles.legendText}><Text style={{ color: colors.red }}>━</Text> 0% 損益平衡</Text>
          <Text style={styles.legendText}><Text style={{ color: colors.yellow }}>●</Text> 目前選擇</Text>
        </View>
      </View>
      <Text style={styles.selectionLabel}>目前選擇：第 {winPeriod} 期得標</Text>
      <View style={styles.resultBox}>
        <View style={styles.resultGrid}>
          <View style={styles.resultCell}><Text style={styles.resultLabel}>標會成本</Text><Text style={styles.resultValue}>{formatMoney(bidCost)}</Text></View>
          <View style={styles.resultCell}><Text style={styles.resultLabel}>估算淨收益</Text><Text style={[styles.resultValue, { color: netBenefit >= 0 ? colors.red : colors.green }]}>{formatMoney(netBenefit, true)}</Text></View>
          <View style={styles.resultCell}><Text style={styles.resultLabel}>前期實繳</Text><Text style={styles.resultValue}>{formatMoney(investedBeforeWin)}</Text></View>
          <View style={styles.resultCell}><Text style={styles.resultLabel}>前期活會收益</Text><Text style={styles.resultValue}>{formatMoney(liveEarningsBeforeWin)}</Text></View>
          <View style={styles.resultCell}><Text style={styles.resultLabel}>剩餘繳款</Text><Text style={styles.resultValue}>{remainingPayments} 期</Text></View>
          <View style={styles.resultCell}><Text style={styles.resultLabel}>預估得標金額</Text><Text style={styles.totalValue}>{formatMoney(payout)}</Text></View>
        </View>
      </View>
      <View style={styles.returnRow}>
        <Text style={styles.returnLabel}>扣除標會成本後年化收益</Text>
        <Text style={[styles.returnValue, annualizedReturn === undefined && styles.mutedValue]}>{annualizedReturn === undefined ? '無法計算' : `${annualizedReturn >= 0 ? '+' : ''}${annualizedReturn.toFixed(2)}%`}</Text>
      </View>
      </>) : <Text style={styles.inputPrompt}>請先填入兩個有效標金</Text>}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    padding: 10,
    marginBottom: 8,
    ...withContinuousRadius(RADIUS.md),
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  subtitle: { marginTop: 3, fontSize: 12, color: colors.textMuted },
  metaRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  metaPill: { fontSize: 11, color: colors.textMuted, backgroundColor: colors.surfaceVariant, paddingHorizontal: 7, paddingVertical: 3, ...withContinuousRadius(RADIUS.full) },
  inputGrid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickBidRow: { flexDirection: 'row', gap: 6, marginTop: 5 },
  quickBid: { paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '700', color: colors.onSurfaceVariant, backgroundColor: colors.surfaceVariant, ...withContinuousRadius(RADIUS.full) },
  quickBidActive: { color: colors.primary, backgroundColor: colors.primaryContainer },
  inputRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.onSurfaceVariant },
  input: {
    minWidth: 72,
    height: 40,
    paddingHorizontal: 7,
    paddingVertical: 0,
    textAlign: 'right',
    textAlignVertical: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: colors.onSurface,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.sm),
  },
  inputInvalid: { borderColor: colors.red },
  unit: { fontSize: 14, color: colors.textMuted },
  helper: { marginTop: 2, fontSize: 10, color: colors.textMuted, textAlign: 'right' },
  errorText: { color: colors.red },
  resultBox: { marginTop: 7, padding: 7, backgroundColor: colors.surfaceVariant, ...withContinuousRadius(RADIUS.sm) },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  resultCell: { width: '50%', paddingHorizontal: 4 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  resultLabel: { fontSize: 12, color: colors.textMuted },
  resultValue: { fontSize: 13, fontWeight: '700', color: colors.onSurface, fontVariant: ['tabular-nums'] },
  totalRow: { marginTop: 5, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  totalLabel: { fontSize: 13, fontWeight: '800', color: colors.onSurface },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  footnote: { marginTop: 4, fontSize: 10, color: colors.textMuted },
  returnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.primaryContainer, ...withContinuousRadius(RADIUS.sm) },
  returnLabel: { fontSize: 13, fontWeight: '800', color: colors.onSurface },
  returnValue: { fontSize: 20, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  mutedValue: { color: colors.textMuted, fontSize: 14 },
  sectionHint: { marginTop: 9, fontSize: 11, color: colors.textMuted },
  scenarioBox: { marginTop: 6, padding: 7, backgroundColor: colors.surfaceVariant, ...withContinuousRadius(RADIUS.sm) },
  scenarioTitle: { fontSize: 12, fontWeight: '800', color: colors.onSurface, marginBottom: 2 },
  chartFrame: { width: 260, height: 54, position: 'relative', alignSelf: 'center' },
  chartHit: { position: 'absolute', width: 16, height: 24 },
  chartLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  legendText: { fontSize: 9, color: colors.textMuted },
  scenarioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 7 },
  scenarioPeriod: { width: 54, fontSize: 12, fontWeight: '800', color: colors.primary },
  scenarioValue: { flex: 1, fontSize: 11, color: colors.onSurfaceVariant, fontVariant: ['tabular-nums'] },
  resetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  resetButton: { fontSize: 11, fontWeight: '800', color: colors.primary, paddingVertical: 5 },
  chartAxis: { fontSize: 9, color: colors.textMuted },
  bestPeriod: { marginTop: 3, fontSize: 12, fontWeight: '800', color: colors.primary },
  inputPrompt: { marginTop: 12, fontSize: 12, color: colors.textMuted },
  chartTooltip: { paddingHorizontal: 8, paddingVertical: 5, backgroundColor: colors.onSurface, ...withContinuousRadius(RADIUS.sm) },
  chartTooltipText: { fontSize: 10, color: colors.surface },
  chartTooltipValue: { marginTop: 1, fontSize: 13, fontWeight: '800', color: colors.surface, fontVariant: ['tabular-nums'] },
  recommendation: { marginTop: 10, padding: 10, backgroundColor: colors.primaryContainer, ...withContinuousRadius(RADIUS.sm) },
  recommendationLabel: { fontSize: 11, fontWeight: '700', color: colors.onPrimaryContainer },
  recommendationValue: { marginTop: 2, fontSize: 16, fontWeight: '800', color: colors.onPrimaryContainer, fontVariant: ['tabular-nums'] },
  strategyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, paddingBottom: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.primary + '22' },
  strategyLabel: { fontSize: 11, fontWeight: '700', color: colors.onPrimaryContainer },
  strategyValue: { fontSize: 12, fontWeight: '800', color: colors.onPrimaryContainer, fontVariant: ['tabular-nums'] },
  selectionLabel: { marginTop: 10, fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant },
});
