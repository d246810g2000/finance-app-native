import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { RawRecord } from '../types';
import { transformRecordsForExport, filterAndSortRecords } from '../services/financeService';
import { TransformedRecord } from '../types';
import { COLORS, SHADOWS } from '../theme';
import { EXCHANGE_RATES } from '../constants';
import { parseFormattedDate } from '../utils/dateUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 32 - 6) / 7); // 16px padding each side, 6 gaps

interface MonthlyCalendarProps {
    records: RawRecord[];
    accountFilter: string[] | null;
    currentMonthStr: string; // YYYY/MM
    selectedDate: string | null; // YYYY/MM/DD
    onDateClick: (date: Date, records: TransformedRecord[]) => void;
}

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function MonthlyCalendar({ records, accountFilter, currentMonthStr, selectedDate, onDateClick }: MonthlyCalendarProps) {
    const [year, month] = useMemo(() => {
        const parts = currentMonthStr.split('/');
        return [parseInt(parts[0]), parseInt(parts[1]) - 1];
    }, [currentMonthStr]);

    const { dailyExpenses, totalMonthExpense, maxDailyExpense, dailyRecords } = useMemo(() => {
        const expenses: { [day: number]: number } = {};
        const recsByDay: { [day: number]: TransformedRecord[] } = {};
        let total = 0;

        records.forEach(r => {
            if (r['分類'] === 'SYSTEM' || !r['日期']) return;

            // Use robust parsing
            const rDate = parseFormattedDate(r['日期']);
            if (isNaN(rDate.getTime())) return;

            if (rDate.getFullYear() !== year || rDate.getMonth() !== month) return;

            const rDay = rDate.getDate();

            const expenseAccount = r['付款(轉出)'];
            const incomeAccount = r['收款(轉入)'];

            if (accountFilter) {
                if (!expenseAccount || !accountFilter.includes(expenseAccount)) return;
            }

            if (expenseAccount && !incomeAccount) {
                const amountStr = (r['金額'] || '').replace(/[,￥$€£]/g, '').trim();
                let amount = parseFloat(amountStr) || 0;
                const currency = r['幣別'];
                const exchangeRate = EXCHANGE_RATES[currency] || 1;
                amount = Math.abs(amount * exchangeRate);
                expenses[rDay] = (expenses[rDay] || 0) + amount;
                total += amount;
            }
        });

        // Also build TransformedRecord groups for drill-down
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        const filtered = filterAndSortRecords(records, monthStart, monthEnd);
        const transformed = transformRecordsForExport(filtered);
        transformed.forEach(r => {
            // TransformedRecord usually has YYYY/MM/DD
            // But let's be safe
            const rDate = parseFormattedDate(r['日期']);
            if (!isNaN(rDate.getTime()) && rDate.getFullYear() === year && rDate.getMonth() === month) {
                const day = rDate.getDate();
                if (!recsByDay[day]) recsByDay[day] = [];
                recsByDay[day].push(r);
            }
        });

        return {
            dailyExpenses: expenses,
            totalMonthExpense: total,
            maxDailyExpense: Math.max(...Object.values(expenses), 1),
            dailyRecords: recsByDay,
        };
    }, [records, year, month, accountFilter]);

    const calendarDays = useMemo(() => {
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(i);
        return days;
    }, [year, month]);

    const getDotColor = useCallback((amount: number) => {
        const ratio = amount / maxDailyExpense;
        if (ratio < 0.2) return COLORS.green;
        if (ratio < 0.5) return '#F59E0B';
        return COLORS.red;
    }, [maxDailyExpense]);

    const handleDayClick = useCallback((day: number) => {
        const date = new Date(year, month, day);
        const recs = dailyRecords[day] || [];
        onDateClick(date, recs);
    }, [year, month, dailyRecords, onDateClick]);

    const today = new Date();
    const isToday = (day: number) =>
        today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

    const isSelected = (day: number) => {
        if (!selectedDate) return false;
        const dStr = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
        return selectedDate === dStr;
    };

    return (
        <View style={styles.container}>
            {/* Header (Removed, controlled by parent) */}

            {/* Week Day Headers */}
            <View style={styles.weekRow}>
                {WEEK_DAYS.map((day, i) => (
                    <View key={day} style={styles.weekCell}>
                        <Text style={[styles.weekText, (i === 0 || i === 6) ? { color: '#F97316' } : null]}>{day}</Text>
                    </View>
                ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.grid}>
                {calendarDays.map((day, index) => {
                    if (day === null) {
                        return <View key={`empty-${index}`} style={styles.emptyCell} />;
                    }
                    const expense = dailyExpenses[day] || 0;
                    const isWeekend = index % 7 === 0 || index % 7 === 6;
                    const todayHighlight = isToday(day);

                    return (
                        <Pressable
                            key={day}
                            style={[styles.dayCell, isWeekend ? { backgroundColor: '#F8FAFC' } : null]}
                            onPress={() => handleDayClick(day)}
                        >
                            <View style={styles.dayHeader}>
                                <View style={[
                                    styles.dayNumber,
                                    isSelected(day) ? styles.selectedCircle : (todayHighlight ? styles.todayCircle : null)
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        (isSelected(day) || todayHighlight) ? { color: '#fff' } : isWeekend ? { color: COLORS.textMuted } : null
                                    ]}>{day}</Text>
                                </View>
                                {expense > 0 ? (
                                    <View style={[styles.dot, { backgroundColor: getDotColor(expense) }]} />
                                ) : null}
                            </View>
                            {expense > 0 ? (
                                <Text style={styles.expenseText} numberOfLines={1}>
                                    ${Math.round(expense).toLocaleString()}
                                </Text>
                            ) : null}
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: COLORS.card, marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.cardBorder, ...SHADOWS.sm },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    headerLeft: { flex: 1 },
    headerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
    headerTotal: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
    navButtons: { flexDirection: 'row', gap: 6 },
    navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
    navBtnText: { color: COLORS.accent, fontSize: 12, fontWeight: '600' },
    // Week
    weekRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.divider },
    weekCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
    weekText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
    // Grid
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    emptyCell: { width: `${100 / 7}%` as any, minHeight: 60, backgroundColor: '#F8FAFC' },
    dayCell: { width: `${100 / 7}%` as any, minHeight: 60, padding: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: COLORS.divider },
    dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dayNumber: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
    todayCircle: { backgroundColor: COLORS.accent },
    selectedCircle: { backgroundColor: COLORS.red },
    dayText: { fontSize: 12, fontWeight: '500', color: COLORS.textPrimary },
    dot: { width: 6, height: 6, borderRadius: 3 },
    expenseText: { fontSize: 9, color: COLORS.red, fontWeight: '700', marginTop: 2, textAlign: 'right' },
});
