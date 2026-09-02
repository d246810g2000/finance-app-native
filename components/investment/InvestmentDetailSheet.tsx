import React, { useCallback, useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import ModalBackdrop from '../ui/ModalBackdrop';
import SheetHeader from '../ui/SheetHeader';
import BottomSheetGestureWrapper from '../ui/BottomSheetGestureWrapper';
import { useBottomSheetSwipe } from '../ui/useBottomSheetSwipe';
import PositionDetailPanel from './PositionDetailPanel';
import { formatQuotePrice } from './investmentTablePrimitives';
import {
  PositionMover,
  StockPosition,
  StockRealizedTrade,
} from '../../services/portfolioService';
import { StockTrade } from '../../services/stockTradeService';
import { InvestmentPnlRow } from '../../viewModels/investmentPnlViewModel';

export type InvestmentSheetContent =
  | { kind: 'movers'; title: string; items: PositionMover[] }
  | { kind: 'missingPrices'; title: string; items: StockPosition[] }
  | { kind: 'monthTrades'; title: string; trades: StockTrade[] }
  | {
    kind: 'position';
    title: string;
    position: StockPosition;
    trades: StockTrade[];
    realized: StockRealizedTrade[];
    pnlMetrics?: InvestmentPnlRow;
  };

interface InvestmentDetailSheetProps {
  visible: boolean;
  content: InvestmentSheetContent | null;
  onClose: () => void;
}

function formatDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`;
  }
  return value;
}

function formatMoney(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function formatPercent(value: number, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function pnlColor(value: number, colors: AppColors): string {
  return value >= 0 ? colors.red : colors.green;
}

function MoverListItem({
  item,
  colors,
  styles,
}: {
  item: PositionMover;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
          {item.symbol ? ` ${item.symbol}` : ''}
        </Text>
        <Text style={styles.rowMeta}>
          {item.previousClose.toFixed(2)} → {item.currentClose.toFixed(2)} · {item.shares.toLocaleString()} 股
        </Text>
      </View>
      <Text style={[styles.rowValue, { color: pnlColor(item.change, colors) }]} selectable>
        {formatMoney(item.change, true)}
        {'\n'}
        {formatPercent(item.changePercent, true)}
      </Text>
    </View>
  );
}

function PositionListItem({
  item,
  colors,
  styles,
}: {
  item: StockPosition;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
          {item.symbol ? ` ${item.symbol}` : ''}
        </Text>
        <Text style={styles.rowMeta}>
          {item.shares.toLocaleString()} 股 · 成本 ${item.averageCost.toFixed(2)} · {item.account}
        </Text>
      </View>
      <Text style={[styles.rowValue, { color: colors.yellow }]}>缺收盤價</Text>
    </View>
  );
}


function TradeListItem({
  item,
  colors,
  styles,
}: {
  item: StockTrade;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const isBuy = item.side === 'buy';
  const priceLabel = isBuy
    ? (item.purchasePrice ? `$${item.purchasePrice.toFixed(2)}` : '—')
    : (item.costPrice && item.salePrice
      ? `$${item.costPrice.toFixed(2)}→$${item.salePrice.toFixed(2)}`
      : '—');

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {isBuy ? '買入' : '賣出'}
          {' · '}
          {formatDate(item.date)}
        </Text>
        <Text style={styles.rowMeta}>
          {item.shares.toLocaleString()} 股 · {priceLabel} · {item.ownership === 'shared' ? '共享' : '個人'}
        </Text>
      </View>
      <Text style={[styles.rowValue, { color: isBuy ? colors.red : colors.green }]}>
        {formatMoney(item.amount, !isBuy)}
      </Text>
    </View>
  );
}

export default function InvestmentDetailSheet({
  visible,
  content,
  onClose,
}: InvestmentDetailSheetProps) {
  const { colors, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
  const insets = useSafeAreaInsets();
  const swipe = useBottomSheetSwipe(onClose, visible);

  const subtitle = useMemo(() => {
    if (!content) return undefined;
    if (content.kind === 'position') {
      const price = content.position.latestPrice !== undefined
        ? formatQuotePrice(content.position.latestPrice)
        : '缺收盤價';
      return `${price} · ${content.position.shares.toLocaleString()} 股`;
    }
    if (content.kind === 'monthTrades') {
      return `${content.trades.length} 筆交易`;
    }
    return `${content.items.length} 項`;
  }, [content]);

  const positionSections = useMemo(() => {
    if (!content || content.kind !== 'position') return null;
    const buys = content.trades.filter(trade => trade.side === 'buy');
    const sells = content.realized;
    return { buys, sells };
  }, [content]);

  const listData = useMemo(() => {
    if (!content) return [];
    if (content.kind === 'movers') return content.items;
    if (content.kind === 'missingPrices') return content.items;
    if (content.kind === 'monthTrades') return content.trades;
    return [];
  }, [content]);

  const renderItem = useCallback(({ item }: { item: PositionMover | StockPosition | StockTrade }) => {
    if (content?.kind === 'monthTrades') {
      return <TradeListItem item={item as StockTrade} colors={colors} styles={styles} />;
    }
    if (content?.kind === 'movers') {
      return <MoverListItem item={item as PositionMover} colors={colors} styles={styles} />;
    }
    return <PositionListItem item={item as StockPosition} colors={colors} styles={styles} />;
  }, [colors, content?.kind, styles]);

  const keyExtractor = useCallback((item: PositionMover | StockPosition | StockTrade, index: number) => (
    'id' in item && item.id ? item.id : `row-${index}`
  ), []);

  if (!content) return null;

  return (
    <Modal visible={visible} animationType="none" transparent presentationStyle="overFullScreen">
      <ModalBackdrop colors={colors}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.dismissArea} />
        </TouchableWithoutFeedback>
        <BottomSheetGestureWrapper
          swipe={swipe}
          style={[styles.container, { paddingBottom: insets.bottom + 16, maxHeight: '85%' }]}
          header={(
            <>
              <View style={styles.handleBar} />
              <SheetHeader title={content.title} subtitle={subtitle} onClose={onClose} />
            </>
          )}
        >
          {content.kind === 'position' && positionSections ? (
            <ScrollView
              style={styles.positionScroll}
              contentContainerStyle={styles.positionBody}
              onScroll={swipe.handleScroll}
              scrollEventThrottle={swipe.scrollEventThrottle}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <PositionDetailPanel
                position={content.position}
                buys={positionSections.buys}
                sells={positionSections.sells}
                pnlMetrics={content.pnlMetrics}
              />
            </ScrollView>
          ) : (
            <View style={styles.listWrap}>
              <FlashList
                data={listData}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                onScroll={swipe.handleScroll}
                scrollEventThrottle={swipe.scrollEventThrottle}
                // @ts-expect-error FlashList v2 estimatedItemSize
                estimatedItemSize={68}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={(
                  <Text style={styles.emptyText}>沒有可顯示的項目</Text>
                )}
              />
            </View>
          )}
        </BottomSheetGestureWrapper>
      </ModalBackdrop>
    </Modal>
  );
}

const createStyles = (
  colors: AppColors,
  typography: ReturnType<typeof useAppTheme>['typography'],
) => StyleSheet.create({
  dismissArea: { flex: 1 },
  container: {
    backgroundColor: colors.surfaceContainerHigh,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  handleBar: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.full),
  },
  listWrap: { flex: 1, minHeight: 200 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  positionScroll: { flex: 1 },
  positionBody: { paddingHorizontal: 16, paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  rowMeta: {
    marginTop: 2,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emptyText: { fontSize: 13, color: colors.textMuted, paddingVertical: 24, textAlign: 'center' },
});
