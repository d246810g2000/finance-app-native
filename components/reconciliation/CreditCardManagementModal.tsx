import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, RADIUS, SHADOWS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useFinanceUI } from '../../context/FinanceUIContext';
import { getCategoryForAccount } from '../../services/financeService';
import {
  getSettingsForCard,
  getStatementGroupNames,
  getGroupStatementDay,
  applyStatementGroup,
  clearStatementGroup,
  clampStatementDay,
  DEFAULT_STATEMENT_DAY,
} from '../../services/creditCardSettingsService';
import { CreditCardSettings } from '../../types';
import ModalBackdrop from '../ui/ModalBackdrop';
import SheetHeader from '../ui/SheetHeader';
import CreditCardSettingsSheet from './CreditCardSettingsSheet';

interface CreditCardManagementModalProps {
  visible: boolean;
  onClose: () => void;
}

interface GroupEditorProps {
  visible: boolean;
  onClose: () => void;
  allCards: string[];
  initialName?: string;
  initialMembers: string[];
  initialStatementDay?: number;
  onSave: (name: string, members: string[], statementDay: number) => void;
  onDelete?: () => void;
}

function StatementGroupEditor({
  visible,
  onClose,
  allCards,
  initialName = '',
  initialMembers,
  initialStatementDay = 15,
  onSave,
  onDelete,
}: GroupEditorProps) {
  const { colors, typography } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
  const [name, setName] = useState(initialName);
  const [dayText, setDayText] = useState(String(initialStatementDay));
  const [selected, setSelected] = useState<Set<string>>(new Set(initialMembers));

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setDayText(String(initialStatementDay));
    setSelected(new Set(initialMembers));
  }, [initialMembers, initialName, initialStatementDay, visible]);

  const toggleCard = (cardName: string) => {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(cardName)) next.delete(cardName);
      else next.add(cardName);
      return next;
    });
  };

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('請輸入群組名稱', '例如「玉山銀行帳單」。');
      return;
    }
    if (selected.size === 0) {
      Alert.alert('請選擇信用卡', '帳單群組至少需要一張信用卡。');
      return;
    }
    onSave(
      trimmedName,
      Array.from(selected),
      clampStatementDay(parseInt(dayText, 10) || DEFAULT_STATEMENT_DAY)
    );
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalBackdrop colors={colors}>
        <Pressable
          style={styles.dismissArea}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="關閉"
        />
        <View style={[styles.editorSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handleBar} />
          <SheetHeader
            title={initialName ? '編輯帳單群組' : '新增帳單群組'}
            onClose={onClose}
            style={styles.transparentHeader}
          />

          <Text style={styles.fieldLabel}>群組名稱</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.textInput}
            placeholder="例如：玉山銀行帳單"
            placeholderTextColor={colors.textMuted}
            autoFocus={!initialName}
            autoCorrect={false}
            accessibilityLabel="群組名稱"
          />

          <Text style={styles.fieldLabel}>共用結帳日</Text>
          <View style={styles.dayRow}>
            <TextInput
              value={dayText}
              onChangeText={setDayText}
              style={styles.dayInput}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
              placeholder="15"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="共用結帳日"
            />
            <Text style={styles.daySuffix}>日</Text>
          </View>
          <Text style={styles.helper}>
            同一銀行帳單的卡片應共用同一個結帳日，儲存後會同步到所有成員。
          </Text>

          <Text style={styles.fieldLabel}>這張帳單包含的信用卡</Text>
          <Text style={styles.helper}>
            可一次勾選多張卡，之後一起對帳。
          </Text>
          <ScrollView style={styles.cardPicker} nestedScrollEnabled>
            {allCards.map(card => {
              const checked = selected.has(card);
              return (
                <Pressable
                  key={card}
                  style={[styles.pickerRow, checked && styles.pickerRowActive]}
                  onPress={() => toggleCard(card)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={card}
                  accessibilityState={{ checked }}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxActive]}>
                    {checked ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
                  </View>
                  <Text style={styles.pickerName}>{card}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.editorActions}>
            {onDelete ? (
              <Pressable
                style={styles.deleteButton}
                onPress={() => {
                  Alert.alert('刪除帳單群組', '卡片會保留，只會移除群組設定。', [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '刪除',
                      style: 'destructive',
                      onPress: () => {
                        onDelete();
                        onClose();
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.deleteButtonText}>刪除群組</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.primaryButton} onPress={submit}>
              <Text style={styles.primaryButtonText}>儲存群組</Text>
            </Pressable>
          </View>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

export default function CreditCardManagementModal({
  visible,
  onClose,
}: CreditCardManagementModalProps) {
  const { colors, typography } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
  const {
    records,
    personalAccounts,
    sharedAccounts,
    customMappings,
    creditCardSettings,
    saveCreditCardSettings,
  } = useFinance();
  const { openReconciliation } = useFinanceUI();
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const allCards = useMemo(() => {
    const accounts = new Set<string>([
      ...personalAccounts,
      ...sharedAccounts,
      ...Object.keys(creditCardSettings),
    ]);
    records.forEach(record => {
      if (record['付款(轉出)']) accounts.add(record['付款(轉出)'].trim());
      if (record['收款(轉入)']) accounts.add(record['收款(轉入)'].trim());
    });
    return Array.from(accounts)
      .filter(name => getCategoryForAccount(name, customMappings) === '信用卡')
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [
    creditCardSettings,
    customMappings,
    personalAccounts,
    records,
    sharedAccounts,
  ]);

  const groups = useMemo(
    () => getStatementGroupNames(creditCardSettings),
    [creditCardSettings]
  );
  const membersByGroup = useMemo(
    () => Object.fromEntries(
      groups.map(group => [
        group,
        allCards.filter(
          card => getSettingsForCard(creditCardSettings, card).statementGroup === group
        ),
      ])
    ) as Record<string, string[]>,
    [allCards, creditCardSettings, groups]
  );
  const ungroupedCards = useMemo(
    () => allCards.filter(
      card => !getSettingsForCard(creditCardSettings, card).statementGroup
    ),
    [allCards, creditCardSettings]
  );
  const availableGroups = groups;

  const saveGroup = (
    originalGroup: string | undefined,
    nextName: string,
    members: string[],
    statementDay: number
  ) => {
    saveCreditCardSettings(applyStatementGroup(
      creditCardSettings,
      members,
      nextName,
      statementDay,
      originalGroup
    ));
  };

  const deleteGroup = (group: string) => {
    saveCreditCardSettings(clearStatementGroup(creditCardSettings, group, allCards));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ModalBackdrop colors={colors}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={[styles.container, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.handleBar} />
          <SheetHeader
            title="信用卡對帳設定"
            onClose={onClose}
            style={styles.transparentHeader}
          />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.overviewCard}>
              <View style={styles.overviewIcon}>
                <Ionicons name="layers-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.overviewCopy}>
                <Text style={styles.overviewTitle}>{allCards.length} 張信用卡</Text>
                <Text style={styles.overviewSubtitle}>
                  {groups.length} 個帳單群組 · 同群組共用結帳日
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.addGroupButton}
              onPress={() => setCreatingGroup(true)}
              accessibilityRole="button"
              accessibilityLabel="新增帳單群組"
            >
              <Ionicons name="add-circle-outline" size={19} color={colors.primary} />
              <Text style={styles.addGroupText}>新增帳單群組</Text>
            </Pressable>

            {groups.map(group => {
              const members = membersByGroup[group] || [];
              const dayInfo = getGroupStatementDay(creditCardSettings, members);
              return (
              <View key={group} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <Ionicons name="documents-outline" size={17} color={colors.primary} />
                    <Text style={styles.sectionTitle} numberOfLines={1}>{group}</Text>
                    <Text style={styles.countBadge}>{members.length}</Text>
                  </View>
                  <View style={styles.groupActions}>
                    <Pressable
                      style={styles.editGroupButton}
                      onPress={() => setEditingGroup(group)}
                      accessibilityRole="button"
                      accessibilityLabel={`編輯群組 ${group}`}
                    >
                      <Text style={styles.editGroupText}>編輯</Text>
                    </Pressable>
                    <Pressable
                      style={styles.startReconButton}
                      onPress={() => {
                        if (members[0]) openReconciliation(members[0]);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`開始對帳 ${group}`}
                    >
                      <Ionicons name="checkmark-done-outline" size={16} color={colors.textWhite} />
                      <Text style={styles.startReconText}>開始對帳</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.groupMeta, dayInfo.inconsistent && styles.groupMetaWarn]}>
                  {dayInfo.inconsistent
                    ? `結帳日不一致：${dayInfo.days.join('、')} 日（建議編輯統一）`
                    : `共用結帳日：每月 ${dayInfo.statementDay} 日`}
                </Text>
                <View style={styles.listCard}>
                  {members.map((card, index) => {
                    const settings = getSettingsForCard(creditCardSettings, card);
                    return (
                      <React.Fragment key={card}>
                        {index > 0 ? <View style={styles.divider} /> : null}
                        <Pressable
                          style={styles.cardRow}
                          onPress={() => setEditingCard(card)}
                        >
                          <View style={styles.cardIcon}>
                            <Ionicons name="card-outline" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.cardCopy}>
                            <Text style={styles.cardName}>{card}</Text>
                            <Text style={styles.cardMeta}>每月 {settings.statementDay} 日</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        </Pressable>
                      </React.Fragment>
                    );
                  })}
                </View>
              </View>
              );
            })}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleWrap}>
                  <Ionicons name="card-outline" size={17} color={colors.textMuted} />
                  <Text style={styles.sectionTitle} numberOfLines={1}>未加入群組</Text>
                  <Text style={styles.countBadge}>{ungroupedCards.length}</Text>
                </View>
              </View>
              <View style={styles.listCard}>
                {ungroupedCards.length > 0 ? ungroupedCards.map((card, index) => {
                  const settings = getSettingsForCard(creditCardSettings, card);
                  return (
                    <React.Fragment key={card}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <View style={styles.cardRow}>
                        <Pressable
                          style={styles.cardMainPress}
                          onPress={() => setEditingCard(card)}
                        >
                          <View style={styles.cardIcon}>
                            <Ionicons name="card-outline" size={18} color={colors.textMuted} />
                          </View>
                          <View style={styles.cardCopy}>
                            <Text style={styles.cardName}>{card}</Text>
                            <Text style={styles.cardMeta}>每月 {settings.statementDay} 日結帳</Text>
                          </View>
                        </Pressable>
                        <Pressable
                          style={styles.soloReconButton}
                          onPress={() => openReconciliation(card)}
                          accessibilityLabel={`開始對帳 ${card}`}
                        >
                          <Text style={styles.soloReconText}>對帳</Text>
                        </Pressable>
                      </View>
                    </React.Fragment>
                  );
                }) : (
                  <Text style={styles.emptyText}>所有信用卡都已加入帳單群組</Text>
                )}
              </View>
            </View>
          </ScrollView>
        </View>

        {editingCard ? (
          <CreditCardSettingsSheet
            visible
            onClose={() => setEditingCard(null)}
            cardName={editingCard}
            initial={getSettingsForCard(creditCardSettings, editingCard)}
            availableGroups={availableGroups}
            groupMemberCount={
              getSettingsForCard(creditCardSettings, editingCard).statementGroup
                ? (membersByGroup[getSettingsForCard(creditCardSettings, editingCard).statementGroup!] || []).length
                : 1
            }
            onSave={(settings: CreditCardSettings) => {
              if (settings.statementGroup) {
                const members = Array.from(new Set([
                  editingCard,
                  ...(membersByGroup[settings.statementGroup] || []),
                ]));
                saveCreditCardSettings(applyStatementGroup(
                  creditCardSettings,
                  members,
                  settings.statementGroup,
                  settings.statementDay,
                  getSettingsForCard(creditCardSettings, editingCard).statementGroup
                ));
              } else {
                saveCreditCardSettings({
                  ...creditCardSettings,
                  [editingCard]: settings,
                });
              }
            }}
          />
        ) : null}

        <StatementGroupEditor
          visible={creatingGroup}
          onClose={() => setCreatingGroup(false)}
          allCards={allCards}
          initialMembers={[]}
          onSave={(name, members, statementDay) => saveGroup(undefined, name, members, statementDay)}
        />

        {editingGroup ? (
          <StatementGroupEditor
            visible
            onClose={() => setEditingGroup(null)}
            allCards={allCards}
            initialName={editingGroup}
            initialMembers={membersByGroup[editingGroup] || []}
            initialStatementDay={getGroupStatementDay(
              creditCardSettings,
              membersByGroup[editingGroup] || []
            ).statementDay}
            onSave={(name, members, statementDay) => saveGroup(editingGroup, name, members, statementDay)}
            onDelete={() => deleteGroup(editingGroup)}
          />
        ) : null}
      </ModalBackdrop>
    </Modal>
  );
}

const createStyles = (
  colors: AppColors,
  typography: ReturnType<typeof useAppTheme>['typography']
) => StyleSheet.create({
  dismissArea: { flex: 1, width: '100%' },
  container: {
    width: '100%',
    height: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    borderBottomWidth: 0,
  },
  editorSheet: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: 16,
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
    marginTop: 10,
    marginBottom: 4,
  },
  transparentHeader: { backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  overviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.lg),
    ...SHADOWS.sm,
  },
  overviewIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  overviewCopy: { flex: 1 },
  overviewTitle: { ...typography.subtitle, fontWeight: '800', color: colors.textPrimary },
  overviewSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  addGroupButton: {
    minHeight: 48,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.primaryContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.lg),
  },
  addGroupText: { ...typography.body, color: colors.primary, fontWeight: '800' },
  section: { marginTop: 18 },
  sectionHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
    paddingHorizontal: 3,
  },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '800',
    flexShrink: 1,
  },
  countBadge: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  groupActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editGroupButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  editGroupText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  groupMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 7,
    paddingHorizontal: 3,
  },
  groupMetaWarn: { color: colors.yellow, fontWeight: '700' },
  startReconButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  startReconText: { ...typography.caption, color: colors.textWhite, fontWeight: '800' },
  listCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.lg),
    overflow: 'hidden',
  },
  cardRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  cardMainPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  cardCopy: { flex: 1, minWidth: 0 },
  cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  cardMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  soloReconButton: {
    minHeight: 36,
    minWidth: 56,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  soloReconText: { ...typography.caption, color: colors.textWhite, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: 60 },
  emptyText: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', padding: 20 },
  fieldLabel: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 7,
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  dayInput: {
    width: 88,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.border,
    ...withContinuousRadius(RADIUS.md),
    paddingHorizontal: 14,
    paddingVertical: 11,
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  daySuffix: { ...typography.body, color: colors.textSecondary },
  textInput: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.border,
    ...withContinuousRadius(RADIUS.md),
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.body,
    color: colors.textPrimary,
  },
  helper: { ...typography.caption, color: colors.textMuted, marginBottom: 8 },
  cardPicker: {
    maxHeight: 310,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.lg),
  },
  pickerRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  pickerRowActive: { backgroundColor: colors.primaryContainer },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickerName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  editorActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  deleteButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.red,
    ...withContinuousRadius(RADIUS.lg),
  },
  deleteButtonText: { ...typography.body, color: colors.red, fontWeight: '800' },
  primaryButton: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    ...withContinuousRadius(RADIUS.lg),
  },
  primaryButtonText: { ...typography.body, color: colors.textWhite, fontWeight: '800' },
});
