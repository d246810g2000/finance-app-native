import React, { memo, useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useAppTheme } from '../../context/ThemeContext';
import { AppColors, RADIUS, withContinuousRadius } from '../../theme';
import type {
  CashflowSankey,
  CashflowSankeyColorKey,
  CashflowSankeyNode,
} from '../../services/financialHealthService';

type LaidOutNode = CashflowSankeyNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LaidOutLink = {
  id: string;
  d: string;
  color: string;
  opacity: number;
  sourceId: string;
  targetId: string;
  amount: number;
};

type Props = {
  data: CashflowSankey;
  height?: number;
  onSelectNode?: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
};

const LABEL_LEFT = 64;
const LABEL_RIGHT = 68;
const NODE_W = 11;

function resolveColor(key: CashflowSankeyColorKey, colors: AppColors, isDark: boolean): string {
  switch (key) {
    case 'income':
      return isDark ? '#2DD4BF' : '#0D9488';
    case 'expense':
      return colors.red;
    case 'variable':
      return isDark ? '#FB7185' : '#E11D48';
    case 'fixed':
      return isDark ? '#E879F9' : '#C026D3';
    case 'invest':
      return colors.green;
    case 'surplus':
      return isDark ? '#94A3B8' : '#64748B';
    case 'deficit':
      return colors.red;
    default:
      return colors.primary;
  }
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 10_000) return `${Math.round(abs / 1000)}k`;
  return Math.round(abs).toLocaleString();
}

function linkPath(
  x0: number,
  y0: number,
  h0: number,
  x1: number,
  y1: number,
  h1: number,
): string {
  const midX = (x0 + x1) / 2;
  return [
    `M${x0},${y0}`,
    `C${midX},${y0} ${midX},${y1} ${x1},${y1}`,
    `L${x1},${y1 + h1}`,
    `C${midX},${y1 + h1} ${midX},${y0 + h0} ${x0},${y0 + h0}`,
    'Z',
  ].join(' ');
}

function layoutSankey(
  data: CashflowSankey,
  width: number,
  height: number,
  colors: AppColors,
  isDark: boolean,
): { nodes: LaidOutNode[]; links: LaidOutLink[] } {
  const padY = 6;
  const gap = 8;
  const innerW = Math.max(100, width - LABEL_LEFT - LABEL_RIGHT);
  const colGap = Math.max(24, (innerW - NODE_W * 3) / 2);
  const usableH = height - padY * 2;

  const sources = data.nodes.filter((n) => n.kind === 'source');
  const hubs = data.nodes.filter((n) => n.kind === 'hub');
  const destinations = data.nodes.filter((n) => n.kind === 'destination');

  const placeColumn = (items: CashflowSankeyNode[], x: number): LaidOutNode[] => {
    const total = items.reduce((sum, item) => sum + item.amount, 0) || 1;
    const gapTotal = Math.max(0, items.length - 1) * gap;
    const available = Math.max(32, usableH - gapTotal);
    let y = padY;
    return items.map((item) => {
      const heightRatio = item.amount / total;
      const h = Math.max(14, available * heightRatio);
      const node: LaidOutNode = {
        ...item,
        x,
        y,
        width: NODE_W,
        height: h,
      };
      y += h + gap;
      return node;
    });
  };

  const leftX = LABEL_LEFT;
  const midX = LABEL_LEFT + NODE_W + colGap;
  const rightX = LABEL_LEFT + NODE_W * 2 + colGap * 2;

  const laidSources = placeColumn(sources, leftX);
  const laidHubs = placeColumn(hubs, midX);
  const laidDestinations = placeColumn(destinations, rightX);
  const nodeMap = new Map<string, LaidOutNode>();
  for (const node of [...laidSources, ...laidHubs, ...laidDestinations]) {
    nodeMap.set(node.id, node);
  }

  const sourceOutOffset = new Map<string, number>();
  const targetInOffset = new Map<string, number>();
  const maxLink = Math.max(1, ...data.links.map((link) => link.amount));
  const links: LaidOutLink[] = [];

  for (const link of data.links) {
    const source = nodeMap.get(link.sourceId);
    const target = nodeMap.get(link.targetId);
    if (!source || !target || link.amount <= 0) continue;

    const sourceScale = source.amount > 0 ? source.height / source.amount : 0;
    const targetScale = target.amount > 0 ? target.height / target.amount : 0;
    const h0 = Math.max(2, link.amount * sourceScale);
    const h1 = Math.max(2, link.amount * targetScale);

    const y0 = source.y + (sourceOutOffset.get(source.id) || 0);
    const y1 = target.y + (targetInOffset.get(target.id) || 0);
    sourceOutOffset.set(source.id, (sourceOutOffset.get(source.id) || 0) + h0);
    targetInOffset.set(target.id, (targetInOffset.get(target.id) || 0) + h1);

    links.push({
      id: link.id,
      d: linkPath(source.x + source.width, y0, h0, target.x, y1, h1),
      color: resolveColor(link.colorKey, colors, isDark),
      opacity: 0.28 + 0.35 * (link.amount / maxLink),
      sourceId: link.sourceId,
      targetId: link.targetId,
      amount: link.amount,
    });
  }

  return {
    nodes: [...laidSources, ...laidHubs, ...laidDestinations],
    links,
  };
}

const CashflowSankeyChart = memo(function CashflowSankeyChart({
  data,
  height = 220,
  onSelectNode,
  selectedNodeId: controlledSelected,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const selectedNodeId = controlledSelected !== undefined ? controlledSelected : internalSelected;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next > 0 && next !== chartWidth) setChartWidth(next);
  }, [chartWidth]);

  const layout = useMemo(
    () => (chartWidth > 0 ? layoutSankey(data, chartWidth, height, colors, isDark) : { nodes: [], links: [] }),
    [data, chartWidth, height, colors, isDark],
  );

  const selectedNode = useMemo(
    () => layout.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [layout.nodes, selectedNodeId],
  );

  const selectNode = useCallback((nodeId: string) => {
    const next = selectedNodeId === nodeId ? null : nodeId;
    if (controlledSelected === undefined) setInternalSelected(next);
    onSelectNode?.(next);
  }, [controlledSelected, onSelectNode, selectedNodeId]);

  if (data.income <= 0 && data.expense <= 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>本月尚無收支流向可顯示</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={[styles.chartWrap, { height }]} onLayout={onLayout}>
        {chartWidth > 0 ? (
          <Svg width={chartWidth} height={height}>
            <Defs>
              {layout.links.map((link) => (
                <LinearGradient
                  key={`grad-${link.id}`}
                  id={`grad-${link.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop offset="0%" stopColor={link.color} stopOpacity={link.opacity} />
                  <Stop offset="100%" stopColor={link.color} stopOpacity={Math.min(0.85, link.opacity + 0.2)} />
                </LinearGradient>
              ))}
            </Defs>

            {layout.links.map((link) => {
              const dimmed = selectedNodeId
                && link.sourceId !== selectedNodeId
                && link.targetId !== selectedNodeId;
              return (
                <Path
                  key={link.id}
                  d={link.d}
                  fill={`url(#grad-${link.id})`}
                  opacity={dimmed ? 0.18 : 1}
                />
              );
            })}

            {layout.nodes.map((node) => {
              const color = resolveColor(node.colorKey, colors, isDark);
              const active = !selectedNodeId || selectedNodeId === node.id;
              return (
                <Rect
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={3}
                  fill={color}
                  opacity={active ? 1 : 0.28}
                />
              );
            })}
          </Svg>
        ) : null}

        {layout.nodes.map((node) => {
          const active = !selectedNodeId || selectedNodeId === node.id;
          const showAmount = node.height >= 22 || selectedNodeId === node.id;
          const isSource = node.kind === 'source';
          const isDest = node.kind === 'destination';
          const isHub = node.kind === 'hub';

          const labelStyle = [
            styles.nodeLabel,
            isSource && styles.nodeLabelSource,
            isDest && styles.nodeLabelDest,
            isHub && styles.nodeLabelHub,
            !active && styles.nodeLabelDimmed,
            {
              top: node.y,
              height: Math.max(22, node.height),
              ...(isSource
                ? { left: 0, width: LABEL_LEFT + NODE_W, paddingRight: NODE_W + 6 }
                : isDest
                  ? { left: node.x - 4, width: LABEL_RIGHT + NODE_W, paddingLeft: NODE_W + 10 }
                  : {
                      left: node.x - 42,
                      width: 42 + NODE_W + 8,
                      paddingRight: NODE_W + 6,
                    }),
            },
          ];

          return (
            <Pressable
              key={`label-${node.id}`}
              onPress={() => selectNode(node.id)}
              style={labelStyle}
              accessibilityRole="button"
              accessibilityLabel={`${node.label} ${money(node.amount)}`}
              accessibilityState={{ selected: selectedNodeId === node.id }}
            >
              <Text
                style={[styles.nodeTitle, isHub && styles.nodeTitleHub]}
                numberOfLines={1}
              >
                {node.label}
              </Text>
              {showAmount ? (
                <Text style={[styles.nodeAmount, isHub && styles.nodeAmountHub]} numberOfLines={1}>
                  {compact(node.amount)}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>點選節點可對照明細金額</Text>

      {selectedNode ? (
        <View style={styles.selection}>
          <View style={[styles.selectionDot, { backgroundColor: resolveColor(selectedNode.colorKey, colors, isDark) }]} />
          <Text style={styles.selectionLabel} numberOfLines={1}>{selectedNode.label}</Text>
          <Text style={styles.selectionValue}>{money(selectedNode.amount)}</Text>
        </View>
      ) : null}
    </View>
  );
});

export function sankeyColor(key: CashflowSankeyColorKey, colors: AppColors, isDark: boolean): string {
  return resolveColor(key, colors, isDark);
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...withContinuousRadius(RADIUS.md),
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
  },
  chartWrap: {
    position: 'relative',
    width: '100%',
  },
  nodeLabel: {
    position: 'absolute',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  nodeLabelSource: {
    alignItems: 'flex-end',
  },
  nodeLabelDest: {
    alignItems: 'flex-start',
  },
  nodeLabelHub: {
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  nodeLabelDimmed: {
    opacity: 0.4,
  },
  nodeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  nodeTitleHub: {
    fontSize: 10,
  },
  nodeAmount: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  nodeAmountHub: {
    fontSize: 9,
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  selection: {
    marginTop: 8,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: colors.surfaceContainerHigh,
  },
  selectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  selectionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  selectionValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 36,
    fontSize: 13,
    color: colors.textMuted,
  },
});

export default CashflowSankeyChart;
