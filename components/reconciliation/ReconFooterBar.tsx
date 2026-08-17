import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { ReconMetrics } from '../../services/reconciliationService';

interface ReconFooterBarProps {
  metrics: ReconMetrics;
  hasStarted: boolean;
  currentBalance: number;
  cardCount?: number;
  filteredCount?: number;
}

export default function ReconFooterBar({
  metrics,
  hasStarted,
  currentBalance,
  cardCount = 1,
  filteredCount,
}: ReconFooterBarProps) {
  const { colors, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

  const balanceText =
    `${currentBalance < 0 ? '-' : ''}${Math.abs(currentBalance).toLocaleString()}`;
  const showFilteredHint =
    typeof filteredCount === 'number' && filteredCount !== metrics.totalCount;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      accessibilityLabel={`帳單 ${metrics.totalCount} 筆，對帳金額 ${metrics.reconciledAmount.toLocaleString()}，當前餘額 ${balanceText}${metrics.isComplete ? '，本期已對帳完成' : ''}`}
    >
      {metrics.isComplete ? (
        <View style={styles.complete} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={16} color={colors.green} />
          <Text style={styles.completeText}>本期已對帳完成</Text>
        </View>
      ) : metrics.hasMismatch && hasStarted ? (
        <View style={styles.warn} accessibilityLiveRegion="polite">
          <Text style={styles.warnText}>
            尚餘 {metrics.unreconciledCount} 筆未對帳（差額 {Math.abs(metrics.totalAmount - metrics.reconciledAmount).toLocaleString()}）
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.label}>帳單筆數</Text>
          <Text style={styles.value} selectable>
            {showFilteredHint ? `${filteredCount}/${metrics.totalCount}` : metrics.totalCount}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.label}>對帳金額</Text>
          <Text style={[styles.value, { color: colors.primary }]} selectable>
            TW$ {metrics.reconciledAmount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.label} numberOfLines={1}>
            當前餘額{cardCount > 1 ? '（群組）' : ''}
          </Text>
          <Text
            style={[
              styles.value,
              { color: currentBalance < 0 ? colors.red : colors.green },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            selectable
          >
            TW$ {balanceText}
          </Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) =>
  StyleSheet.create({
    wrap: {
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      backgroundColor: colors.surfaceContainer,
    },
    complete: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.greenLight,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    completeText: {
      ...typography.caption,
      color: colors.green,
      fontWeight: '700',
    },
    warn: {
      backgroundColor: colors.yellowLight,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    warnText: {
      ...typography.caption,
      color: colors.yellow,
      fontWeight: '600',
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
    },
    metric: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    divider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: colors.divider,
    },
    label: {
      ...typography.caption,
      color: colors.textMuted,
    },
    value: {
      ...typography.subtitle,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
  });
