import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme';

export const TABLE_HEADER_HEIGHT = 48;
export const TABLE_ROW_HEIGHT = 64;
export const FROZEN_COLUMN_WIDTH = 84;
export const FROZEN_COLUMN_PADDING = 6;
export const FROZEN_TEXT_WIDTH = FROZEN_COLUMN_WIDTH - FROZEN_COLUMN_PADDING * 2;
export const TABLE_CELL_WIDTH = 72;

export type SortDirection = 'asc' | 'desc';

export function formatTableMoney(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

export function formatTablePercent(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatTableDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`;
  }
  return value;
}

export function formatQuotePrice(value?: number): string {
  if (value === undefined) return '—';
  const absolute = Math.abs(value);
  if (absolute >= 1000) return Math.round(value).toLocaleString();
  if (absolute >= 100) return value.toFixed(1);
  if (absolute >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

/** Taiwan market convention: gains red, losses green. */
export function tablePnlColor(value: number, colors: AppColors): string {
  return value >= 0 ? colors.red : colors.green;
}

export type InvestmentTableStyles = ReturnType<typeof createInvestmentTableStyles>;

export function createInvestmentTableStyles(colors: AppColors) {
  return StyleSheet.create({
    tableShell: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      overflow: 'hidden',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    frozenColumn: {
      width: FROZEN_COLUMN_WIDTH,
      zIndex: 2,
      backgroundColor: colors.surfaceContainer,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.outlineVariant,
    },
    frozenHeaderCell: {
      width: FROZEN_COLUMN_WIDTH,
      height: TABLE_HEADER_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surfaceVariant,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    frozenTableHeaderInner: { width: FROZEN_TEXT_WIDTH },
    frozenTableHeaderLabel: {
      textAlign: 'center',
      includeFontPadding: false,
    },
    frozenRow: {
      width: FROZEN_COLUMN_WIDTH,
      height: TABLE_ROW_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    frozenRowPressable: { backgroundColor: colors.surfaceContainer },
    frozenRowPressed: { opacity: 0.72 },
    frozenCellContent: { alignItems: 'center', gap: 2 },
    rowName: {
      width: FROZEN_TEXT_WIDTH,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
      color: colors.onSurface,
      textAlign: 'center',
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    rowSymbol: {
      width: FROZEN_TEXT_WIDTH,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      includeFontPadding: false,
    textAlignVertical: 'center',
  },
  frozenDateText: {
    width: FROZEN_TEXT_WIDTH,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.onSurface,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  scrollTable: { flex: 1 },
    tableHeaderCell: {
      width: TABLE_CELL_WIDTH,
      alignSelf: 'stretch',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    tableHeaderInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      width: '100%',
    },
    tableHeaderLabel: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '700',
      includeFontPadding: false,
      flexShrink: 1,
    },
    tableHeaderActive: { color: colors.primary },
    tableHeaderRow: {
      flexDirection: 'row',
      height: TABLE_HEADER_HEIGHT,
      alignItems: 'center',
      backgroundColor: colors.surfaceVariant,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    tableRow: {
      flexDirection: 'row',
      height: TABLE_ROW_HEIGHT,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    tableCell: {
      width: TABLE_CELL_WIDTH,
      height: TABLE_ROW_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    tableCellWide: {
      width: TABLE_CELL_WIDTH + 16,
    },
    tableCellInner: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    tableValue: {
      width: '100%',
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '800',
      color: colors.onSurface,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    tableSubValue: {
      width: '100%',
      marginTop: 1,
      fontSize: 10,
      lineHeight: 13,
      color: colors.textMuted,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    emptyText: {
      paddingVertical: 20,
      paddingHorizontal: 12,
      fontSize: 13,
      fontWeight: '600',
      color: colors.onSurfaceVariant,
      textAlign: 'center',
    },
  });
}

export function SortableTableHeader<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  styles,
  frozen = false,
  wide = false,
}: {
  label: string;
  sortKey: K;
  activeKey: K | null;
  direction: SortDirection;
  onSort: (key: K) => void;
  styles: InvestmentTableStyles;
  frozen?: boolean;
  wide?: boolean;
}) {
  const active = activeKey === sortKey;
  return (
    <Pressable
      onPress={() => onSort(sortKey)}
      style={[
        frozen ? styles.frozenHeaderCell : styles.tableHeaderCell,
        wide && !frozen ? styles.tableCellWide : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}，${active ? direction === 'asc' ? '升冪' : '降冪' : '未排序'}`}
    >
      <View style={[styles.tableHeaderInner, frozen && styles.frozenTableHeaderInner]}>
        <Text
          style={[styles.tableHeaderLabel, frozen && styles.frozenTableHeaderLabel]}
          numberOfLines={2}
        >
          {label}
        </Text>
        <Ionicons
          name={active ? direction === 'asc' ? 'caret-up' : 'caret-down' : 'swap-vertical-outline'}
          size={11}
          color={active ? styles.tableHeaderActive.color : styles.tableHeaderLabel.color}
        />
      </View>
    </Pressable>
  );
}

export function FrozenNameCell({
  name,
  symbol,
  styles,
  onPress,
}: {
  name: string;
  symbol?: string;
  styles: InvestmentTableStyles;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.frozenCellContent}>
      <Text style={styles.rowName} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
      <Text style={styles.rowSymbol} numberOfLines={1} ellipsizeMode="tail">
        {symbol || '待補股號'}
      </Text>
    </View>
  );

  if (!onPress) {
    return <View style={styles.frozenRow}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.frozenRow,
        styles.frozenRowPressable,
        pressed && styles.frozenRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${name} ${symbol || '待補股號'}`}
    >
      {content}
    </Pressable>
  );
}

export function TableDataCell({
  styles,
  primary,
  secondary,
  primaryColor,
  secondaryColor,
  wide = false,
}: {
  styles: InvestmentTableStyles;
  primary: string;
  secondary?: string;
  primaryColor?: string;
  secondaryColor?: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.tableCell, wide && styles.tableCellWide]}>
      <View style={styles.tableCellInner}>
        <Text
          style={[styles.tableValue, primaryColor ? { color: primaryColor } : null]}
          numberOfLines={1}
        >
          {primary}
        </Text>
        {secondary ? (
          <Text
            style={[styles.tableSubValue, secondaryColor ? { color: secondaryColor } : null]}
            numberOfLines={1}
          >
            {secondary}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function TableHeaderLabel({
  label,
  styles,
  wide = false,
  frozen = false,
}: {
  label: string;
  styles: InvestmentTableStyles;
  wide?: boolean;
  frozen?: boolean;
}) {
  return (
    <View style={[
      frozen ? styles.frozenHeaderCell : styles.tableHeaderCell,
      wide && !frozen ? styles.tableCellWide : null,
    ]}>
      <View style={[styles.tableHeaderInner, frozen && styles.frozenTableHeaderInner]}>
        <Text
          style={[styles.tableHeaderLabel, frozen && styles.frozenTableHeaderLabel]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

export function FrozenDateCell({
  date,
  styles,
}: {
  date: string;
  styles: InvestmentTableStyles;
}) {
  return (
    <View style={styles.frozenRow}>
      <View style={styles.frozenCellContent}>
        <Text style={styles.frozenDateText} numberOfLines={1}>
          {formatTableDate(date)}
        </Text>
      </View>
    </View>
  );
}

export function InvestmentTableShell({
  styles,
  frozenHeader,
  frozenRows,
  scrollHeader,
  scrollRows,
  scrollWidth,
  style,
}: {
  styles: InvestmentTableStyles;
  frozenHeader: React.ReactNode;
  frozenRows: React.ReactNode;
  scrollHeader: React.ReactNode;
  scrollRows: React.ReactNode;
  scrollWidth: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.tableShell, style]}>
      <View style={styles.frozenColumn}>
        {frozenHeader}
        {frozenRows}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        nestedScrollEnabled
        style={styles.scrollTable}
        contentContainerStyle={{ minWidth: scrollWidth }}
      >
        <View style={{ width: scrollWidth }}>
          {scrollHeader}
          {scrollRows}
        </View>
      </ScrollView>
    </View>
  );
}
