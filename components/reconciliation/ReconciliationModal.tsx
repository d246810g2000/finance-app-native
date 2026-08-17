import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Alert, TextInput, InteractionManager,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import ModalBackdrop from '../ui/ModalBackdrop';
import BottomSheetGestureWrapper from '../ui/BottomSheetGestureWrapper';
import { useBottomSheetSwipe } from '../ui/useBottomSheetSwipe';
import { useFinance } from '../../context/FinanceContext';
import { RawRecord } from '../../types';
import {
  initializeAccountData,
  filterAndSortRecords,
  updateAccountBalancesAndSnapshots,
} from '../../services/financeService';
import {
  getLatestClosedPeriod,
  getStatementPeriod,
  shiftStatementPeriod,
  formatPeriodRangeLabel,
  filterStatementGroupRecords,
  sortStatementRecords,
  computeGroupReconMetrics,
  resolveRecordCardName,
  StatementPeriod,
  ReconSortOrder,
  parsePeriodKey,
} from '../../services/reconciliationService';
import {
  getSettingsForCard,
  getStatementGroupCards,
  getGroupStatementDay,
  applyStatementGroup,
  getStatementGroupNames,
} from '../../services/creditCardSettingsService';
import ReconcileSwipeRow from './ReconcileSwipeRow';
import ReconFooterBar from './ReconFooterBar';
import CreditCardSettingsSheet from './CreditCardSettingsSheet';

export type ReconStatusFilter = 'all' | 'open' | 'done';

interface ReconciliationModalProps {
  visible: boolean;
  cardName: string;
  onClose: () => void;
}

const LIST_CONTENT_STYLE = { paddingBottom: 8, flexGrow: 1 } as const;
const EMPTY_BALANCE = 0;

export default function ReconciliationModal({
  visible,
  cardName,
  onClose,
}: ReconciliationModalProps) {
  const { colors, typography, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
  const swipe = useBottomSheetSwipe(onClose, visible, { disableSheetSwipe: true });
  const {
    records,
    updateRecords,
    creditCardSettings,
    saveCreditCardSettings,
    personalAccounts,
    sharedAccounts,
    customMappings,
  } = useFinance();

  const knownCards = useMemo(
    () => [...personalAccounts, ...sharedAccounts],
    [personalAccounts, sharedAccounts]
  );

  const cardSettings = useMemo(
    () => getSettingsForCard(creditCardSettings, cardName),
    [creditCardSettings, cardName]
  );
  const groupCards = useMemo(
    () => getStatementGroupCards(creditCardSettings, cardName, knownCards),
    [creditCardSettings, cardName, knownCards]
  );
  const availableGroups = useMemo(
    () => getStatementGroupNames(creditCardSettings),
    [creditCardSettings]
  );
  const groupName = cardSettings.statementGroup;
  const groupDay = useMemo(
    () => getGroupStatementDay(creditCardSettings, groupCards),
    [creditCardSettings, groupCards]
  );
  const statementDay = groupDay.statementDay;

  const [period, setPeriod] = useState<StatementPeriod>(() =>
    getLatestClosedPeriod(new Date(), statementDay)
  );
  const [sortOrder, setSortOrder] = useState<ReconSortOrder>('asc');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReconStatusFilter>('all');
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [localReconcile, setLocalReconcile] = useState<Record<string, boolean>>({});
  const [currentBalance, setCurrentBalance] = useState(EMPTY_BALANCE);

  const recordsRef = useRef(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const groupCardsKey = useMemo(() => groupCards.join(','), [groupCards]);

  useEffect(() => {
    if (!visible) return;
    setPeriod(getLatestClosedPeriod(new Date(), statementDay));
    setSortOrder('asc');
    setStatusFilter('all');
    setCardFilter(null);
    setKeyword('');
    setLocalReconcile({});
    setFilterMenuVisible(false);
    setMenuVisible(false);
  }, [visible, cardName, statementDay]);

  useEffect(() => {
    if (!visible) return;
    setPeriod(previous => {
      const parsed = parsePeriodKey(previous.periodKey);
      if (!parsed) return getLatestClosedPeriod(new Date(), statementDay);
      return getStatementPeriod(parsed.year, parsed.monthIndex, statementDay);
    });
  }, [statementDay, visible]);

  useEffect(() => {
    setLocalReconcile(previous => {
      const keys = Object.keys(previous);
      if (keys.length === 0) return previous;
      const next = { ...previous };
      let changed = false;
      for (const id of keys) {
        const record = records.find(item => item.id === id);
        if (!record || !!record.isReconciled === next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [records]);

  // 餘額計算較重：只在 Modal 打開或所屬卡片群組、自訂映射變更時計算一次。
  // 對帳狀態（isReconciled）變更不影響帳戶餘額，因此不依賴 records，避免每次對帳時重新跑全量歷史計算。
  useEffect(() => {
    if (!visible) {
      setCurrentBalance(EMPTY_BALANCE);
      return;
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      const currentRecords = recordsRef.current;
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const { accountRunningBalances } = initializeAccountData(
        currentRecords,
        null,
        [],
        customMappings
      );
      const balanceCopy = { ...accountRunningBalances };
      const recordsUpToToday = filterAndSortRecords(currentRecords, null, today);
      updateAccountBalancesAndSnapshots(recordsUpToToday, balanceCopy);
      const next = Math.round(
        groupCards.reduce((sum, name) => sum + (balanceCopy[name] || 0), 0)
      );
      if (!cancelled) setCurrentBalance(next);
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [visible, groupCardsKey, customMappings]);

  const statementRecords = useMemo(() => {
    const filtered = filterStatementGroupRecords(records, groupCards, period);
    const hasLocal = Object.keys(localReconcile).length > 0;
    if (!hasLocal) {
      return sortStatementRecords(filtered, sortOrder);
    }
    const withLocal = filtered.map(record => {
      const id = String(record.id || '');
      if (id && id in localReconcile) {
        return { ...record, isReconciled: localReconcile[id] };
      }
      return record;
    });
    return sortStatementRecords(withLocal, sortOrder);
  }, [records, groupCards, period, sortOrder, localReconcile]);

  const filterCounts = useMemo(() => {
    let open = 0;
    let done = 0;
    const byCard: Record<string, number> = {};
    groupCards.forEach(name => { byCard[name] = 0; });

    statementRecords.forEach(record => {
      if (record.isReconciled) done += 1;
      else open += 1;
      const name = resolveRecordCardName(record, groupCards);
      if (name) byCard[name] = (byCard[name] || 0) + 1;
    });

    return {
      all: statementRecords.length,
      open,
      done,
      byCard,
    };
  }, [statementRecords, groupCards]);

  const displayRecords = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return statementRecords.filter(record => {
      if (statusFilter === 'open' && record.isReconciled) return false;
      if (statusFilter === 'done' && !record.isReconciled) return false;
      if (cardFilter) {
        const name = resolveRecordCardName(record, groupCards);
        if (name !== cardFilter) return false;
      }
      if (!q) return true;
      const haystack = [
        record['分類'],
        record['子分類'],
        record['商家(公司)'],
        record['備註'],
        record['付款(轉出)'],
        record['收款(轉入)'],
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [statementRecords, statusFilter, cardFilter, keyword, groupCards]);

  const metrics = useMemo(
    () => computeGroupReconMetrics(statementRecords, groupCards),
    [statementRecords, groupCards]
  );
  const hasStarted = metrics.reconciledCount > 0;

  const shiftPeriod = useCallback((delta: number) => {
    setPeriod(previous => shiftStatementPeriod(previous, delta));
  }, []);

  const persistReconcile = useCallback((id: string, value: boolean) => {
    setLocalReconcile(previous => {
      if (previous[id] === value) return previous;
      return { ...previous, [id]: value };
    });
    updateRecords([{ id, patch: { isReconciled: value } }]);
  }, [updateRecords]);

  const confirmReconcile = useCallback((id: string) => {
    persistReconcile(id, true);
  }, [persistReconcile]);

  const cancelReconcile = useCallback((id: string) => {
    persistReconcile(id, false);
  }, [persistReconcile]);

  const shouldReconcileAll = metrics.reconciledCount === 0;

  const toggleAllReconcile = useCallback(() => {
    const nextValue = metrics.reconciledCount === 0;
    const updates = statementRecords
      .filter(record => !!record.isReconciled !== nextValue && record.id)
      .map(record => ({
        id: String(record.id),
        patch: { isReconciled: nextValue },
      }));
    if (!updates.length) {
      Alert.alert('提示', '本期沒有可對帳的記錄。');
      return;
    }
    setLocalReconcile(previous => {
      const next = { ...previous };
      updates.forEach(item => { next[item.id] = nextValue; });
      return next;
    });
    updateRecords(updates);
  }, [metrics.reconciledCount, statementRecords, updateRecords]);

  const renderItem = useCallback(({ item }: { item: RawRecord }) => (
    <ReconcileSwipeRow
      record={item}
      cardNames={groupCards}
      onConfirm={confirmReconcile}
      onCancel={cancelReconcile}
    />
  ), [cancelReconcile, confirmReconcile, groupCards]);

  const filterLabel = useMemo(() => {
    if (cardFilter) return cardFilter;
    if (statusFilter === 'open') return '未完成';
    if (statusFilter === 'done') return '已完成';
    return '全部';
  }, [cardFilter, statusFilter]);

  const filterActive = statusFilter !== 'all' || !!cardFilter;

  const applyStatusFilter = useCallback((next: ReconStatusFilter) => {
    setStatusFilter(next);
    setCardFilter(null);
    setFilterMenuVisible(false);
  }, []);

  const applyCardFilter = useCallback((name: string) => {
    setCardFilter(name);
    setStatusFilter('all');
    setFilterMenuVisible(false);
  }, []);

  const cycleSummary = groupCards.length > 1
    ? `${groupCards.length} 張卡 · 每月 ${statementDay} 日結帳`
    : `每月 ${statementDay} 日結帳`;

  const emptyMessage = useMemo(() => {
    if (statementRecords.length === 0) return '本期無待對帳交易';
    if (statusFilter === 'open') return '沒有未對帳交易';
    if (statusFilter === 'done') return '沒有已對帳交易';
    if (cardFilter || keyword.trim()) return '沒有符合條件的交易';
    return '本期無待對帳交易';
  }, [statementRecords.length, statusFilter, cardFilter, keyword]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ModalBackdrop colors={colors} isDark={isDark}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="關閉對帳模式" />
        <BottomSheetGestureWrapper
          swipe={swipe}
          style={[styles.container, { paddingBottom: insets.bottom }]}
          header={(
            <>
              <View style={styles.handleBar} />
              <View style={styles.header}>
                <View style={styles.headerTop}>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={24}
                    color={colors.primary}
                    style={styles.headerIcon}
                  />
                  <View style={styles.headerCopy}>
                    <Text style={styles.title} numberOfLines={1}>對帳模式</Text>
                    <Text style={styles.cardLabel} numberOfLines={1}>
                      {groupName || cardName} · {cycleSummary}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.headerActionBtn, pressed && styles.pressed]}
                    onPress={() => setMenuVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="開啟對帳選單"
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.headerActionBtn, pressed && styles.pressed]}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="關閉對帳模式"
                  >
                    <Ionicons name="close" size={21} color={colors.textPrimary} />
                  </Pressable>
                </View>

                {groupCards.length > 1 ? (
                  <Text style={styles.memberText} numberOfLines={2}>
                    {groupCards.join('、')}
                  </Text>
                ) : null}

                {groupDay.inconsistent ? (
                  <Pressable
                    style={styles.warnBanner}
                    onPress={() => setSettingsVisible(true)}
                  >
                    <Ionicons name="warning-outline" size={15} color={colors.yellow} />
                    <Text style={styles.warnBannerText}>
                      群組成員結帳日不一致（{groupDay.days.join('、')} 日），點此統一設定
                    </Text>
                  </Pressable>
                ) : null}

                <View style={styles.navigator}>
                  <Pressable
                    onPress={() => shiftPeriod(-1)}
                    style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="上一帳單週期"
                  >
                    <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
                  </Pressable>
                  <View style={styles.navCenter}>
                    <Text style={styles.navPeriod}>{period.periodKey}</Text>
                    <Text style={styles.navRange}>{formatPeriodRangeLabel(period)}</Text>
                  </View>
                  <Pressable
                    onPress={() => shiftPeriod(1)}
                    style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="下一帳單週期"
                  >
                    <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
                  </Pressable>
                </View>

                <View style={styles.filterBar}>
                  <View style={styles.searchBox}>
                    <Ionicons name="search" size={16} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      value={keyword}
                      onChangeText={setKeyword}
                      placeholder="搜尋分類、商家、備註…"
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="search"
                      clearButtonMode="while-editing"
                      accessibilityLabel="搜尋對帳交易"
                    />
                    {keyword.length > 0 ? (
                      <Pressable
                        onPress={() => setKeyword('')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="清除搜尋"
                      >
                        <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.filterChip,
                      filterActive && styles.filterChipActive,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setFilterMenuVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`條件過濾，目前 ${filterLabel}`}
                    accessibilityState={{ expanded: filterMenuVisible }}
                  >
                    <Ionicons
                      name={filterActive ? 'funnel' : 'funnel-outline'}
                      size={15}
                      color={filterActive ? colors.primary : colors.textMuted}
                    />
                    <Text
                      style={[styles.filterChipText, filterActive && styles.filterChipTextActive]}
                      numberOfLines={1}
                    >
                      {filterLabel}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color={filterActive ? colors.primary : colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>
            </>
          )}
        >
          <View style={styles.listWrap}>
            <FlashList
              data={displayRecords}
              renderItem={renderItem}
              keyExtractor={(record, index) =>
                record.id != null && String(record.id).length > 0
                  ? String(record.id)
                  : `recon-${record['日期']}-${record['金額']}-${index}`
              }
              contentContainerStyle={LIST_CONTENT_STYLE}
              onScroll={swipe.handleScroll}
              scrollEventThrottle={swipe.scrollEventThrottle}
              // @ts-expect-error FlashList v2 estimatedItemSize
              estimatedItemSize={72}
              extraData={displayRecords}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
                  <Text style={styles.emptyText}>{emptyMessage}</Text>
                </View>
              }
            />
          </View>

          <ReconFooterBar
            metrics={metrics}
            hasStarted={hasStarted}
            currentBalance={currentBalance}
            cardCount={groupCards.length}
            filteredCount={displayRecords.length}
          />
        </BottomSheetGestureWrapper>

        <CreditCardSettingsSheet
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          cardName={cardName}
          initial={cardSettings}
          availableGroups={availableGroups}
          groupMemberCount={groupCards.length}
          onSave={settings => {
            if (settings.statementGroup && groupCards.length > 1) {
              saveCreditCardSettings(applyStatementGroup(
                creditCardSettings,
                groupCards,
                settings.statementGroup,
                settings.statementDay,
                cardSettings.statementGroup
              ));
            } else {
              saveCreditCardSettings({
                ...creditCardSettings,
                [cardName]: settings,
              });
            }
          }}
        />

        <Modal
          visible={filterMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFilterMenuVisible(false)}
        >
          <View style={styles.filterOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setFilterMenuVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="關閉過濾選單"
            />
            <View style={[styles.filterMenu, { marginTop: insets.top + 168 }]}>
              <FilterOption
                label="全部"
                count={filterCounts.all}
                selected={statusFilter === 'all' && !cardFilter}
                onPress={() => applyStatusFilter('all')}
                colors={colors}
                styles={styles}
              />
              <FilterOption
                label="未完成"
                count={filterCounts.open}
                selected={statusFilter === 'open' && !cardFilter}
                onPress={() => applyStatusFilter('open')}
                colors={colors}
                styles={styles}
              />
              <FilterOption
                label="已完成"
                count={filterCounts.done}
                selected={statusFilter === 'done' && !cardFilter}
                onPress={() => applyStatusFilter('done')}
                colors={colors}
                styles={styles}
              />
              {groupCards.length > 1 ? (
                <>
                  <View style={styles.filterSectionDivider} />
                  {groupCards.map(name => (
                    <FilterOption
                      key={name}
                      label={name}
                      count={filterCounts.byCard[name] || 0}
                      selected={cardFilter === name}
                      onPress={() => applyCardFilter(name)}
                      colors={colors}
                      styles={styles}
                    />
                  ))}
                </>
              ) : null}
            </View>
          </View>
        </Modal>

        <Modal
          visible={menuVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMenuVisible(false)}
        >
          <ModalBackdrop colors={colors} isDark={isDark}>
            <Pressable
              style={styles.menuDismissArea}
              onPress={() => setMenuVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="關閉對帳選單"
            />
            <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.menuHandle} />
              <View style={styles.menuHeader}>
                <View>
                  <Text style={styles.menuTitle}>對帳選單</Text>
                  <Text style={styles.menuSubtitle}>排序、批次與帳單設定</Text>
                </View>
                <Pressable
                  style={styles.menuCloseBtn}
                  onPress={() => setMenuVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="關閉對帳選單"
                >
                  <Ionicons name="close" size={21} color={colors.textPrimary} />
                </Pressable>
              </View>

              <View style={styles.menuCard}>
                <Pressable
                  style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                  onPress={() => {
                    setMenuVisible(false);
                    setSortOrder(value => (value === 'asc' ? 'desc' : 'asc'));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`日期排序，目前${sortOrder === 'asc' ? '遠到近' : '近到遠'}，點擊改為${sortOrder === 'asc' ? '近到遠' : '遠到近'}`}
                >
                  <View style={[styles.menuIcon, { backgroundColor: colors.primaryContainer }]}>
                    <Ionicons name="swap-vertical-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.menuRowCopy}>
                    <Text style={styles.menuRowTitle}>日期排序</Text>
                    <Text style={styles.menuRowSubtitle}>
                      目前：{sortOrder === 'asc' ? '遠到近' : '近到遠'}
                    </Text>
                  </View>
                  <Text style={styles.menuActionText}>
                    改為{sortOrder === 'asc' ? '近到遠' : '遠到近'}
                  </Text>
                </Pressable>

                <View style={styles.menuDivider} />

                <Pressable
                  style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                  onPress={() => {
                    setMenuVisible(false);
                    toggleAllReconcile();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={shouldReconcileAll ? '全部對帳' : '取消全部對帳'}
                >
                  <View
                    style={[
                      styles.menuIcon,
                      {
                        backgroundColor: shouldReconcileAll
                          ? colors.greenLight
                          : colors.yellowLight,
                      },
                    ]}
                  >
                    <Ionicons
                      name={shouldReconcileAll ? 'checkmark-done-outline' : 'refresh-outline'}
                      size={20}
                      color={shouldReconcileAll ? colors.green : colors.yellow}
                    />
                  </View>
                  <View style={styles.menuRowCopy}>
                    <Text style={styles.menuRowTitle}>
                      {shouldReconcileAll ? '全部對帳' : '取消全部對帳'}
                    </Text>
                    <Text style={styles.menuRowSubtitle}>
                      {shouldReconcileAll
                        ? '將本期所有記錄標記為已對帳'
                        : '將本期所有記錄恢復為未對帳'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>

                <View style={styles.menuDivider} />

                <Pressable
                  style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                  onPress={() => {
                    setMenuVisible(false);
                    setSettingsVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="帳單週期設定"
                >
                  <View style={[styles.menuIcon, { backgroundColor: colors.greenLight }]}>
                    <Ionicons name="settings-outline" size={20} color={colors.green} />
                  </View>
                  <View style={styles.menuRowCopy}>
                    <Text style={styles.menuRowTitle}>帳單週期設定</Text>
                    <Text style={styles.menuRowSubtitle}>
                      調整結帳日與所屬群組
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          </ModalBackdrop>
        </Modal>
      </ModalBackdrop>
    </Modal>
  );
}

function FilterOption({
  label,
  count,
  selected,
  onPress,
  colors,
  styles,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.filterOption, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}，${count} 筆`}
    >
      <Text style={[styles.filterOptionLabel, selected && styles.filterOptionLabelActive]}>
        {label}
      </Text>
      <View style={styles.filterOptionRight}>
        <Text style={styles.filterOptionCount}>{count}</Text>
        {selected ? (
          <Ionicons name="checkmark" size={18} color={colors.primary} />
        ) : (
          <View style={styles.filterCheckSpacer} />
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (
  colors: AppColors,
  typography: ReturnType<typeof useAppTheme>['typography']
) => StyleSheet.create({
  dismissArea: {
    flex: 1,
    width: '100%',
  },
  container: {
    height: '92%',
    backgroundColor: colors.surface,
    ...withContinuousRadius(RADIUS.sheet),
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    borderBottomWidth: 0,
  },
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surfaceContainer,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  headerIcon: { marginRight: 10 },
  headerCopy: { flex: 1, marginRight: 6 },
  title: { ...typography.h3, letterSpacing: -0.3 },
  cardLabel: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  memberText: {
    ...typography.caption,
    color: colors.textSecondary,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 4,
  },
  warnBanner: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.yellowLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  warnBannerText: {
    ...typography.caption,
    color: colors.yellow,
    fontWeight: '700',
    flex: 1,
  },
  headerActionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navigator: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  navButton: {
    padding: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navCenter: { flex: 1, alignItems: 'center' },
  navPeriod: { ...typography.subtitle, fontWeight: '800', color: colors.textPrimary },
  navRange: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  searchBox: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  searchInput: {
    flex: 1,
    ...typography.bodySm,
    color: colors.textPrimary,
    paddingVertical: 8,
  },
  filterChip: {
    maxWidth: 132,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  filterChipActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },
  filterChipText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    flexShrink: 1,
  },
  filterChipTextActive: {
    color: colors.primary,
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: colors.scrim ?? 'rgba(0,0,0,0.32)',
    paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  filterMenu: {
    width: 240,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
    paddingVertical: 6,
  },
  filterOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterOptionLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 8,
  },
  filterOptionLabelActive: {
    color: colors.primary,
  },
  filterOptionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterOptionCount: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  filterCheckSpacer: { width: 18 },
  filterSectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: 4,
    marginHorizontal: 12,
  },
  listWrap: { flex: 1, minHeight: 120 },
  empty: { alignItems: 'center', paddingVertical: 64, gap: 12 },
  emptyText: { ...typography.bodySm, color: colors.textMuted },
  pressed: { opacity: 0.72 },
  menuDismissArea: { flex: 1, width: '100%' },
  menuSheet: {
    backgroundColor: colors.surface,
    ...withContinuousRadius(RADIUS.sheet),
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    borderBottomWidth: 0,
  },
  menuHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  menuTitle: { ...typography.h3, color: colors.textPrimary },
  menuSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  menuCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  menuCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  menuRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuRowCopy: { flex: 1, minWidth: 0, marginRight: 8 },
  menuRowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  menuRowSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  menuActionText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 66,
  },
});
