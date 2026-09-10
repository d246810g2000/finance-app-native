import { NativeModules, Platform } from 'react-native';
import { loadBudgets, loadBudgetConfig, calculateBudgetStatus, calculateBudgetStatusForMonths } from './budgetService';
import type { BudgetCalculationResult, BudgetGlobalConfig, BudgetRule, RawRecord } from '../types';
import { buildRecordIndex } from './core/recordIndex';

interface WidgetNativeModule {
    syncWidget: (payloadJson: string) => Promise<boolean>;
}

export interface WidgetMonthPayload {
    monthLabel: string;
    dailyBudget: number;
    dailySpent: number;
    dailyRemaining: number;
    dailyAllowance: number;
    dailyPercent: number;
    isDailyOver: boolean;
    fixedSpent: number;
    fixedBudget: number;
    totalSpent: number;
    totalBudget: number;
    remainingDays: number;
    nextFixedName: string;
    nextFixedDate: string;
    nextFixedAmount: number;
}

export interface WidgetPayload {
    minMonthOffset: number;
    maxMonthOffset: number;
    months: Record<string, WidgetMonthPayload>;
}

/** Canonical current-month snapshot consumed by both Widget and notification sync. */
export function buildCurrentMonthSummary(
    records: RawRecord[],
    budgets: BudgetRule[],
    config: BudgetGlobalConfig,
    now = new Date(),
): BudgetCalculationResult {
    return calculateBudgetStatus(records, budgets, now, config, buildRecordIndex(records));
}

const SharedPrefs = NativeModules.SharedPreferencesModule as WidgetNativeModule | undefined;

function monthPayload(
    summary: BudgetCalculationResult,
    targetMonth: Date,
    now: Date,
): WidgetMonthPayload {
    const totalBudget = summary.totalDailyBudget;
    const disposableDailyBudget = totalBudget - summary.totalFixedSpent;
    const lastDayOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
    const isCurrentMonth = now.getFullYear() === targetMonth.getFullYear()
        && now.getMonth() === targetMonth.getMonth();
    const remainingDays = isCurrentMonth
        ? Math.max(1, lastDayOfMonth - now.getDate() + 1)
        : targetMonth.getTime() < now.getTime() ? 1 : lastDayOfMonth;
    const dailyRemaining = disposableDailyBudget - summary.totalDailySpent;

    return {
        monthLabel: `${targetMonth.getFullYear()}/${String(targetMonth.getMonth() + 1).padStart(2, '0')}`,
        dailyBudget: Math.round(disposableDailyBudget),
        dailySpent: Math.round(summary.totalDailySpent),
        dailyRemaining: Math.round(dailyRemaining),
        dailyAllowance: dailyRemaining < 0 ? 0 : Math.floor(dailyRemaining / remainingDays),
        dailyPercent: Math.min(100, Math.max(0, Math.round(
            (summary.totalDailySpent / Math.max(1, disposableDailyBudget)) * 100,
        ))),
        isDailyOver: dailyRemaining < 0,
        fixedSpent: Math.round(summary.totalFixedSpent),
        fixedBudget: Math.round(summary.totalFixedBudget),
        totalSpent: Math.round(summary.totalSpent),
        totalBudget: Math.round(totalBudget),
        remainingDays,
        nextFixedName: summary.nextFixedExpense?.name || '',
        nextFixedDate: summary.nextFixedExpense?.date || '',
        nextFixedAmount: summary.nextFixedExpense?.amount || 0,
    };
}

export function buildWidgetPayload(
    records: RawRecord[],
    budgets: BudgetRule[],
    config: BudgetGlobalConfig,
    now = new Date(),
    monthRange = 12,
): WidgetPayload {
    const targetMonths = Array.from({ length: monthRange * 2 + 1 }, (_, index) => (
        new Date(now.getFullYear(), now.getMonth() + index - monthRange, 1)
    ));
    const index = buildRecordIndex(records);
    const summaries = calculateBudgetStatusForMonths(records, budgets, targetMonths, config, index);
    const months: Record<string, WidgetMonthPayload> = {};

    summaries.forEach((summary, indexInRange) => {
        if (summary.totalDailyBudget <= 0) return;
        const offset = indexInRange - monthRange;
        months[`m${offset}_`] = monthPayload(summary, targetMonths[indexInRange], now);
    });

    return {
        minMonthOffset: -monthRange,
        maxMonthOffset: monthRange,
        months,
    };
}

class WidgetService {
    isSupported(): boolean {
        return Platform.OS === 'android' && !!SharedPrefs;
    }

    async syncWidgetData(records: RawRecord[]): Promise<void> {
        if (!this.isSupported() || !SharedPrefs) return;

        try {
            const budgets = await loadBudgets();
            if (budgets.length === 0) return;
            const config = await loadBudgetConfig();
            const payload = buildWidgetPayload(records, budgets, config);
            await SharedPrefs.syncWidget(JSON.stringify(payload));
        } catch (error) {
            console.warn('Failed to sync widget data', error);
        }
    }
}

export default new WidgetService();
