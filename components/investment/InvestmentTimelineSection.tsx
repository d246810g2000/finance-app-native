import React, { useMemo } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { AppColors, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import SectionHeader from '../ui/SectionHeader';
import type { CurrentHolding } from '../../services/portfolioService';
import type { InvestmentAssetTimelinePoint } from '../../services/investmentTimelineService';

const CHART_WIDTH = Dimensions.get('window').width - 64;

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatAmountShort(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function formatMonthShort(month: string): string {
  if (month.length < 7) return month;
  return `${month.slice(2, 4)}.${month.slice(5, 7)}`;
}

interface InvestmentTimelineSectionProps {
  holdings: CurrentHolding[];
  assetTimeline: InvestmentAssetTimelinePoint[];
  onOpenHolding: (holding: CurrentHolding) => void;
}

export default function InvestmentTimelineSection({
  holdings,
  assetTimeline,
  onOpenHolding,
}: InvestmentTimelineSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const chartData = useMemo(() => assetTimeline.map(point => ({
    value: point.value,
    label: formatMonthShort(point.month),
    dataPointText: formatAmountShort(point.value),
    textColor: colors.textMuted,
    textFontSize: 9,
    textShiftY: -10,
    dataPointColor: colors.primary,
    dataPointRadius: 3,
  })), [assetTimeline, colors]);
  const maxValue = Math.max(...assetTimeline.map(point => point.value), 1);

  if (holdings.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="目前投資資產" accent={colors.primary} style={styles.sectionHeader} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardScroll}
      >
        {holdings.map(holding => (
          <Pressable
            key={holding.id}
            style={styles.card}
            onPress={() => onOpenHolding(holding)}
            accessibilityRole="button"
            accessibilityLabel={`${holding.name}，目前市值 ${holding.displayValue} 元`}
          >
            <Text style={styles.cardName} numberOfLines={1}>
              {holding.name}{holding.symbol ? ` ${holding.symbol}` : ''}
            </Text>
            <Text style={styles.cardAmount}>
              {formatMoney(holding.displayValue)}
            </Text>
            <Text style={styles.cardMeta}>
              {holding.shares.toLocaleString()} 股 ·{' '}
              {holding.latestPrice ? `@$${formatMoney(holding.latestPrice)}` : '無報價'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {chartData.length > 1 ? (
        <View style={styles.chartWrap}>
          <Text style={styles.chartCaption}>
            資產累積時間軸 · 最新收盤價評價
          </Text>
          <LineChart
            data={chartData}
            areaChart
            curved
            color={colors.primary}
            startFillColor={colors.primary}
            endFillColor={colors.primary}
            startOpacity={0.2}
            endOpacity={0.02}
            thickness={2.5}
            hideDataPoints={false}
            maxValue={maxValue * 1.25}
            noOfSections={3}
            spacing={Math.max(
              28,
              Math.min(48, (CHART_WIDTH - 48) / Math.max(chartData.length - 1, 1)),
            )}
            initialSpacing={12}
            endSpacing={20}
            scrollToEnd
            rulesColor={colors.divider}
            yAxisThickness={0}
            xAxisThickness={0}
            yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
            width={CHART_WIDTH}
            height={136}
            formatYLabel={value => formatAmountShort(Number(value))}
          />
        </View>
      ) : null}
    </View>
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
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  cardMeta: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  chartWrap: {
    marginTop: 10,
    padding: 14,
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    borderRadius: RADIUS.md,
  },
  chartCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    marginBottom: 8,
  },
});
