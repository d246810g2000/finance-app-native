import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { AppColors, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import type { InvestmentAssetTimelinePoint } from '../../services/investmentTimelineService';
import SectionHeader from '../ui/SectionHeader';

const CHART_WIDTH = Dimensions.get('window').width - 64;
const DEFAULT_VISIBLE_MONTHS = 12;
const CHART_SPACING = 32;

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
  assetTimeline: InvestmentAssetTimelinePoint[];
}

export default function InvestmentTimelineSection({
  assetTimeline,
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

  return (
    <View style={styles.section}>
      {chartData.length > 1 ? (
        <>
          <SectionHeader
            title="資產累積"
            accent={colors.primary}
            trailing={<Text style={styles.sectionTrailing}>最近 12 個月</Text>}
          />
          <View style={styles.chartWrap}>
            <Text style={styles.chartCaption}>最新收盤價評價</Text>
            <Text style={styles.chartHint}>左右滑動可查看更早紀錄</Text>
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
              spacing={CHART_SPACING}
              initialSpacing={12}
              endSpacing={12}
              scrollToIndex={Math.max(0, chartData.length - DEFAULT_VISIBLE_MONTHS)}
              scrollAnimation={false}
              showScrollIndicator
              indicatorColor="default"
              nestedScrollEnabled
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
        </>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { marginTop: 14 },
  sectionTrailing: { fontSize: 12, fontWeight: '700', color: colors.primary },
  chartWrap: {
    marginTop: 0,
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
  chartHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 10,
  },
});
