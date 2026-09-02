import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { AppColors, RADIUS } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import type { InvestmentAssetTimelinePoint } from '../../services/investmentTimelineService';
import SectionHeader from '../ui/SectionHeader';

const Y_AXIS_LABEL_WIDTH = 36;
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
  const [plotWidth, setPlotWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleChartWrapLayout = useCallback((event: LayoutChangeEvent) => {
    const containerWidth = event.nativeEvent.layout.width;
    const nextPlotWidth = Math.max(0, Math.floor(containerWidth - Y_AXIS_LABEL_WIDTH));
    setPlotWidth(prev => prev === nextPlotWidth ? prev : nextPlotWidth);
  }, []);

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
  const chartSpacing = useMemo(() => {
    if (plotWidth <= 0 || chartData.length <= 1) return CHART_SPACING;
    return Math.max(
      28,
      Math.min(CHART_SPACING, (plotWidth - 24) / Math.max(chartData.length - 1, 1)),
    );
  }, [chartData.length, plotWidth]);

  useEffect(() => {
    if (plotWidth <= 0 || chartData.length <= 1) return undefined;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [chartData, plotWidth]);

  return (
    <View style={styles.section}>
      {chartData.length > 1 ? (
        <>
          <SectionHeader
            title="資產累積"
            accent={colors.primary}
          />
          <View style={styles.chartWrap} onLayout={handleChartWrapLayout}>
            <Text style={styles.chartCaption}>當前的證券資產</Text>
            {plotWidth > 0 ? (
              <LineChart
                scrollRef={scrollRef}
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
                overflowTop={18}
                maxValue={maxValue * 1.25}
                noOfSections={3}
                spacing={chartSpacing}
                initialSpacing={12}
                endSpacing={24}
                scrollToEnd
                scrollAnimation={false}
                showScrollIndicator
                indicatorColor="default"
                nestedScrollEnabled
                rulesColor={colors.divider}
                yAxisThickness={0}
                xAxisThickness={0}
                yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
                parentWidth={plotWidth + Y_AXIS_LABEL_WIDTH}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                width={plotWidth}
                height={148}
                formatYLabel={value => formatAmountShort(Number(value))}
              />
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { marginTop: 14, minWidth: 0 },
  chartWrap: {
    marginTop: 0,
    padding: 14,
    paddingTop: 10,
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    borderRadius: RADIUS.md,
  },
  chartCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    marginBottom: 10,
  },
});
