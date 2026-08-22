import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Platform,
  AccessibilityActionEvent, Pressable,
} from 'react-native';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { AppColors } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { RawRecord } from '../../types';
import {
  getRecordSpendAmount,
  resolveRecordCardName,
} from '../../services/reconciliationService';
import { parseFormattedDate, zeroPadDate } from '../../utils/dateUtils';

interface ReconcileSwipeRowProps {
  record: RawRecord;
  cardNames: string[];
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
}

interface SwipeActionPanelProps {
  progress: SharedValue<number>;
  tone: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  align?: 'flex-start' | 'flex-end';
}

function SwipeActionPanel({ progress, tone, icon, label, align }: SwipeActionPanelProps) {
  const fade = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <View
      style={[
        ACTION_PANEL_STYLES.wrap,
        { backgroundColor: tone },
        align ? { alignItems: align } : null,
      ]}
    >
      <Reanimated.View style={[ACTION_PANEL_STYLES.inner, fade]}>
        <Ionicons name={icon} size={22} color="#FFFFFF" />
        <Text style={ACTION_PANEL_STYLES.text}>{label}</Text>
      </Reanimated.View>
    </View>
  );
}

const ACTION_PANEL_STYLES = StyleSheet.create({
  wrap: { justifyContent: 'center', width: 104 },
  inner: { alignItems: 'center', justifyContent: 'center', width: 104, gap: 4 },
  text: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' as const },
});

function ReconcileSwipeRow({
  record,
  cardNames,
  onConfirm,
  onCancel,
}: ReconcileSwipeRowProps) {
  const { colors, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const lastActionTime = useRef(0);
  const id = String(record.id || '');
  const reconciled = !!record.isReconciled;
  const cardName = resolveRecordCardName(record, cardNames) ?? cardNames[0] ?? '';
  const spend = getRecordSpendAmount(record, cardName);
  const isCharge = spend >= 0;

  const dateObj = parseFormattedDate(String(record['日期'] || ''));
  const dateLabel = !isNaN(dateObj.getTime())
    ? `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`
    : zeroPadDate(String(record['日期'] || ''));
  const category = record['分類'] || '';
  const subcategory = record['子分類'] ? ` · ${record['子分類']}` : '';
  const merchant = record['商家(公司)'] || record['備註'] || '';

  const strike = useSharedValue(reconciled ? 1 : 0);
  const skipEnterAnim = useRef(true);

  useEffect(() => {
    if (skipEnterAnim.current) {
      skipEnterAnim.current = false;
      strike.value = reconciled ? 1 : 0;
      return;
    }
    const target = reconciled ? 1 : 0;
    if (strike.value !== target) {
      strike.value = withTiming(target, { duration: 250 });
    }
  }, [reconciled, strike]);

  const titleStrikeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: strike.value }],
    opacity: strike.value,
  }));

  const amountStrikeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: strike.value }],
    opacity: strike.value,
  }));

  const titleColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      strike.value,
      [0, 1],
      [colors.textPrimary, colors.textMuted]
    ),
  }));

  const amountColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      strike.value,
      [0, 1],
      [isCharge ? colors.red : colors.green, colors.textMuted]
    ),
  }));

  const rowToneStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      strike.value,
      [0, 1],
      [colors.surfaceContainer, colors.greenLight]
    ),
  }));

  const checkToneStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      strike.value,
      [0, 1],
      [colors.border, colors.green]
    ),
    backgroundColor: interpolateColor(
      strike.value,
      [0, 1],
      ['transparent', colors.green]
    ),
  }));

  const checkIconStyle = useAnimatedStyle(() => ({
    opacity: strike.value,
    transform: [{ scale: strike.value }],
  }));

  const confirm = useCallback(() => {
    strike.value = withTiming(1, { duration: 250 });
    hapticMedium();
    onConfirm(id);
  }, [id, onConfirm, strike]);

  const cancel = useCallback(() => {
    strike.value = withTiming(0, { duration: 250 });
    hapticLight();
    onCancel(id);
  }, [id, onCancel, strike]);

  const handleToggle = useCallback(() => {
    const now = Date.now();
    if (now - lastActionTime.current < 200) return;
    lastActionTime.current = now;
    if (strike.value > 0.5) cancel();
    else confirm();
  }, [cancel, confirm, strike]);

  const runSwipeAction = useCallback((direction: 'left' | 'right') => {
    const now = Date.now();
    if (now - lastActionTime.current < 200) return;
    lastActionTime.current = now;
    if (direction === 'right') confirm();
    else cancel();
    swipeRef.current?.close();
  }, [cancel, confirm]);

  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'activate' || name === 'confirmReconcile') {
      if (strike.value < 0.5) confirm();
      return;
    }
    if (name === 'cancelReconcile' || name === 'longpress') {
      if (strike.value > 0.5) cancel();
    }
  }, [cancel, confirm, strike]);

  const accessibilityActions = useMemo(() => {
    if (reconciled) {
      return [
        { name: 'cancelReconcile', label: '取消對帳' },
        { name: 'longpress', label: '取消對帳' },
      ];
    }
    return [
      { name: 'activate', label: '確認對帳' },
      { name: 'confirmReconcile', label: '確認對帳' },
    ];
  }, [reconciled]);

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.1}
      leftThreshold={36}
      rightThreshold={36}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={(progress) => (
        <SwipeActionPanel progress={progress} tone={colors.green} icon="checkmark-circle" label="對帳確認" />
      )}
      renderRightActions={(progress) => (
        <SwipeActionPanel progress={progress} tone={colors.textMuted} icon="close-circle" label="取消對帳" align="flex-end" />
      )}
      onSwipeableWillOpen={runSwipeAction}
    >
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityState={{ checked: reconciled }}
        accessibilityLabel={`${reconciled ? '已對帳' : '未對帳'}，${category}${subcategory}，${merchant || '無商家'}，金額 ${Math.abs(spend).toLocaleString()}`}
        accessibilityHint={reconciled ? '點擊或左滑取消對帳' : '點擊或右滑確認對帳'}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        accessible
      >
        <Reanimated.View style={[styles.row, rowToneStyle]}>
          <Reanimated.View style={[styles.check, checkToneStyle]}>
            <Reanimated.View style={checkIconStyle}>
              <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
            </Reanimated.View>
          </Reanimated.View>
          <View style={styles.main}>
            <View style={styles.titleRow}>
              <View style={styles.strikeTarget}>
                <Reanimated.Text style={[styles.title, titleColorStyle]} numberOfLines={1}>
                  {category}{subcategory}
                </Reanimated.Text>
                <Reanimated.View
                  pointerEvents="none"
                  style={[styles.strikeLine, titleStrikeStyle]}
                />
              </View>
              {cardNames.length > 1 ? (
                <View style={styles.cardBadge}>
                  <Text style={styles.cardBadgeText} numberOfLines={1}>{cardName}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {dateLabel}
              {merchant ? ` · ${merchant}` : ''}
            </Text>
          </View>
          <View style={styles.amountWrap}>
            <Reanimated.Text style={[styles.amount, amountColorStyle]} selectable>
              {isCharge ? '' : '-'}{Math.abs(spend).toLocaleString()}
            </Reanimated.Text>
            <Reanimated.View
              pointerEvents="none"
              style={[styles.strikeLine, styles.amountStrike, amountStrikeStyle]}
            />
          </View>
        </Reanimated.View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default memo(ReconcileSwipeRow);

const createStyles = (
  colors: AppColors,
  typography: ReturnType<typeof useAppTheme>['typography']
) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowPressed: {
    opacity: 0.88,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  main: { flex: 1, marginRight: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  strikeTarget: {
    flexShrink: 1,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  title: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  cardBadge: {
    maxWidth: 112,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.primaryContainer,
  },
  cardBadgeText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  meta: { ...typography.caption, color: colors.textMuted },
  amountWrap: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  amount: { ...typography.body, fontWeight: '700', letterSpacing: -0.3 },
  strikeLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: -0.75,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.onSurface,
    ...(Platform.OS === 'ios' ? { transformOrigin: 'left center' as const } : null),
  },
  amountStrike: {},
  actionConfirm: { backgroundColor: colors.green, justifyContent: 'center', width: 104 },
  actionCancel: {
    backgroundColor: colors.textMuted,
    justifyContent: 'center',
    width: 104,
    alignItems: 'flex-end',
  },
  actionInner: { alignItems: 'center', justifyContent: 'center', width: 104, gap: 4 },
  actionText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
});
