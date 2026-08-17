import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import ModalBackdrop from '../ui/ModalBackdrop';
import SheetHeader from '../ui/SheetHeader';
import { CreditCardSettings } from '../../types';
import {
  clampStatementDay,
  DEFAULT_STATEMENT_DAY,
} from '../../services/creditCardSettingsService';

interface CreditCardSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  cardName: string;
  initial: CreditCardSettings;
  availableGroups: string[];
  /** 目前群組成員數；>1 時提示結帳日會同步到群組 */
  groupMemberCount?: number;
  onSave: (settings: CreditCardSettings) => void;
}

export default function CreditCardSettingsSheet({
  visible,
  onClose,
  cardName,
  initial,
  availableGroups,
  groupMemberCount = 1,
  onSave,
}: CreditCardSettingsSheetProps) {
  const { colors, typography } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
  const [dayText, setDayText] = useState(String(initial.statementDay || DEFAULT_STATEMENT_DAY));
  const [groupText, setGroupText] = useState(initial.statementGroup || '');

  useEffect(() => {
    if (!visible) return;
    setDayText(String(initial.statementDay || DEFAULT_STATEMENT_DAY));
    setGroupText(initial.statementGroup || '');
  }, [visible, initial]);

  const handleSave = () => {
    onSave({
      statementDay: clampStatementDay(parseInt(dayText, 10) || DEFAULT_STATEMENT_DAY),
      statementGroup: groupText.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalBackdrop colors={colors}>
          <Pressable
            style={styles.dismiss}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="關閉帳單設定"
          />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <SheetHeader
            title="帳單週期與群組"
            subtitle={cardName}
            onClose={onClose}
            style={styles.headerOverride}
          />

          <ScrollView contentContainerStyle={styles.sheetBody}>
          <Text style={styles.label}>這張卡每月結帳日</Text>
          <View style={styles.dayRow}>
            <TextInput
              style={styles.dayInput}
              value={dayText}
              onChangeText={setDayText}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
              placeholder="15"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.daySuffix}>日</Text>
          </View>
          <Text style={styles.hint}>
            例如 15 日，週期為上月 16 日至本月 15 日。
            {groupMemberCount > 1 || groupText.trim()
              ? ' 同群組會共用此結帳日，儲存後同步到所有成員。'
              : ' 未加入群組時可獨立設定。'}
          </Text>

          <Text style={styles.label}>銀行帳單群組</Text>
          <TextInput
            style={styles.groupInput}
            value={groupText}
            onChangeText={setGroupText}
            placeholder="例如：玉山銀行帳單"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            returnKeyType="done"
          />
          <Text style={styles.hint}>
            群組名稱相同的信用卡會一起對帳並共用結帳日；留空代表只對這張卡。
          </Text>

          {availableGroups.length > 0 ? (
            <>
              <Text style={styles.savedLabel}>已有群組</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.groupChips}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  style={[styles.chip, !groupText.trim() && styles.chipActive]}
                  onPress={() => setGroupText('')}
                  accessibilityRole="button"
                  accessibilityLabel="不加入群組"
                  accessibilityState={{ selected: !groupText.trim() }}
                >
                  <Text style={[styles.chipText, !groupText.trim() && styles.chipTextActive]}>
                    不加入群組
                  </Text>
                </Pressable>
                {availableGroups.map(group => {
                  const active = groupText.trim() === group;
                  return (
                    <Pressable
                      key={group}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setGroupText(group)}
                      accessibilityRole="button"
                      accessibilityLabel={`選擇群組 ${group}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {group}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <View style={styles.example}>
            <Ionicons name="layers-outline" size={18} color={colors.primary} />
            <Text style={styles.exampleText}>
              將「玉山 Unicard」、「共享玉山 Unicard」、「玉山 UBear」都設為
              「玉山銀行帳單」，它們就會出現在同一個對帳清單。
            </Text>
          </View>

          <Pressable
            style={styles.confirmBtn}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="儲存設定"
          >
            <Text style={styles.confirmText}>儲存設定</Text>
          </Pressable>
          </ScrollView>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

const createStyles = (
  colors: AppColors,
  typography: ReturnType<typeof useAppTheme>['typography']
) => StyleSheet.create({
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.surfaceContainer,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    overflow: 'hidden',
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: colors.outline,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  headerOverride: {
    backgroundColor: 'transparent',
    marginBottom: 0,
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerCopy: { flex: 1, marginRight: 12 },
  title: { ...typography.h3 },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  label: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 7,
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayInput: {
    width: 88,
    backgroundColor: colors.surfaceVariant,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.md),
    paddingHorizontal: 14,
    paddingVertical: 11,
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  daySuffix: { ...typography.body, color: colors.textSecondary },
  groupInput: {
    backgroundColor: colors.surfaceVariant,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.md),
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.body,
    color: colors.textPrimary,
  },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: 6 },
  savedLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: 12,
  },
  groupChips: { gap: 8, paddingVertical: 9 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.primaryContainer,
    backgroundColor: colors.primaryContainer,
  },
  chipText: { ...typography.caption, color: colors.onSurfaceVariant, fontWeight: '600' },
  chipTextActive: { color: colors.onPrimaryContainer },
  example: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: colors.primaryContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.md),
    padding: 12,
    marginTop: 8,
  },
  exampleText: { ...typography.caption, color: colors.onSurfaceVariant, flex: 1, lineHeight: 19 },
  confirmBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    minHeight: 48,
    paddingVertical: 14,
    ...withContinuousRadius(RADIUS.full),
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: colors.onPrimary, fontWeight: '800', fontSize: 16 },
});
