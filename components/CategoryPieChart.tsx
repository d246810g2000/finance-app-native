import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PieChart } from 'react-native-gifted-charts';
import { AccountsSummaryMap } from '../types';
import { COLORS, SHADOWS, CATEGORY_COLORS } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface CategoryPieChartProps {
    accountsSummary: AccountsSummaryMap;
    accountCategories: { [key: string]: string[] };
}

function getCategoryForAccount(accountName: string, accountCategories: { [key: string]: string[] }): string {
    for (const [category, accounts] of Object.entries(accountCategories)) {
        if (accounts.includes(accountName)) return category;
    }
    return '其他';
}

export default function CategoryPieChart({ accountsSummary, accountCategories }: CategoryPieChartProps) {
    const [chartType, setChartType] = useState<'asset' | 'liability'>('asset');

    const pieData = useMemo(() => {
        const categoryBalances: { [key: string]: number } = {};
        for (const accountName in accountsSummary) {
            const category = getCategoryForAccount(accountName, accountCategories);
            categoryBalances[category] = (categoryBalances[category] || 0) + accountsSummary[accountName].balance;
        }

        return Object.entries(categoryBalances)
            .filter(([, balance]) => (chartType === 'asset' ? balance > 0 : balance < 0))
            .map(([name, value], index) => ({
                name,
                value: Math.round(chartType === 'asset' ? value : Math.abs(value)),
                color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] as string,
            }))
            .sort((a, b) => b.value - a.value);
    }, [accountsSummary, accountCategories, chartType]);

    const totalValue = useMemo(() => pieData.reduce((sum, d) => sum + d.value, 0), [pieData]);

    return (
        <Animated.View entering={FadeInDown.delay(600).springify()} style={[styles.container, SHADOWS.sm]}>
            <View style={styles.header}>
                <Text style={styles.title}>各分組佔比</Text>
                <View style={styles.toggleRow}>
                    {(['asset', 'liability'] as const).map(type => (
                        <Pressable key={type}
                            onPress={() => setChartType(type)}
                            style={({ pressed }) => [
                                styles.toggleBtn,
                                chartType === type ? (type === 'asset' ? styles.toggleAsset : styles.toggleLiability) : null,
                                pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }
                            ]}
                        >
                            <Text style={[styles.toggleText, chartType === type ? { color: '#fff' } : null]}>
                                {type === 'asset' ? '資產' : '負債'}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            {pieData.length > 0 ? (
                <>
                    <View style={styles.chartCenter}>
                        <PieChart
                            data={pieData.map(d => ({ value: d.value, color: d.color }))}
                            donut
                            innerRadius={50}
                            radius={80}
                            centerLabelComponent={() => (
                                <View style={styles.centerLabel}>
                                    <Text style={styles.centerLabelTotal}>${(totalValue / 1000).toFixed(0)}k</Text>
                                    <Text style={styles.centerLabelSub}>{chartType === 'asset' ? '資產' : '負債'}</Text>
                                </View>
                            )}
                        />
                    </View>

                    {/* Legend */}
                    <View style={styles.legend}>
                        {pieData.map((item) => {
                            const pct = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : '0';
                            return (
                                <View key={item.name} style={styles.legendItem}>
                                    <View style={styles.legendLeft}>
                                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                                        <Text style={styles.legendName}>{item.name}</Text>
                                    </View>
                                    <View style={styles.legendRight}>
                                        <Text style={[styles.legendAmount, { color: chartType === 'asset' ? COLORS.accent : COLORS.red }]}>
                                            ${item.value.toLocaleString()}
                                        </Text>
                                        <Text style={styles.legendPct}>{pct}%</Text>
                                    </View>
                                </View>
                            );
                        })}
                        <View style={styles.legendTotal}>
                            <Text style={styles.legendTotalLabel}>總額</Text>
                            <Text style={[styles.legendTotalValue, { color: chartType === 'asset' ? COLORS.accent : COLORS.red }]}>
                                ${totalValue.toLocaleString()}
                            </Text>
                        </View>
                    </View>
                </>
            ) : (
                <View style={styles.emptyView}>
                    <Text style={styles.emptyText}>暫無{chartType === 'asset' ? '資產' : '負債'}數據</Text>
                </View>
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: COLORS.card, marginHorizontal: 16, marginTop: 16, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: COLORS.divider },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3 },
    toggleRow: { flexDirection: 'row', gap: 6, backgroundColor: COLORS.bg, padding: 4, borderRadius: 16, borderWidth: 1, borderColor: COLORS.divider },
    toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
    toggleAsset: { backgroundColor: COLORS.green, ...SHADOWS.sm },
    toggleLiability: { backgroundColor: COLORS.red, ...SHADOWS.sm },
    toggleText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
    // Chart
    chartCenter: { alignItems: 'center', marginBottom: 20 },
    centerLabel: { alignItems: 'center' },
    centerLabelTotal: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
    centerLabelSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' },
    // Legend
    legend: { gap: 8, marginTop: 4 },
    legendItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: COLORS.bg, borderRadius: 12 },
    legendLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 8 },
    legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
    legendName: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
    legendRight: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
    legendAmount: { fontSize: 14, fontWeight: '700', marginRight: 10 },
    legendPct: { fontSize: 12, color: COLORS.textMuted, width: 44, textAlign: 'right', fontWeight: '500' },
    legendTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.divider, paddingTop: 16, marginTop: 8, paddingHorizontal: 12 },
    legendTotalLabel: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary },
    legendTotalValue: { fontSize: 18, fontWeight: '800' },
    // Empty
    emptyView: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '500' },
});
