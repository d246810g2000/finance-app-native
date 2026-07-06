import { NativeModules, Platform } from 'react-native';
import { loadBudgets, loadBudgetConfig, calculateBudgetStatus } from './budgetService';
import { RawRecord, BudgetRule, BudgetGlobalConfig } from '../types';

const SharedPrefs = NativeModules.SharedPreferencesModule;

class WidgetService {
    isSupported(): boolean {
        return Platform.OS === 'android' && !!SharedPrefs;
    }

    /**
     * 計算預算數據並寫入 SharedPreferences，觸發 Widget 更新
     */
    async syncWidgetData(records: RawRecord[]): Promise<void> {
        if (!this.isSupported()) return;

        try {
            const budgets = await loadBudgets();
            const config = await loadBudgetConfig();

            if (budgets.length === 0) return;

            const now = new Date();
            const syncOps: Promise<any>[] = [];

            // 同步 前一個月、當前月、下一個月
            for (let offset = -1; offset <= 1; offset++) {
                const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
                const prefix = `m${offset}_`;
                syncOps.push(...await this._syncMonthData(records, budgets, config, targetMonth, prefix));
            }

            await Promise.all(syncOps);
            
            // 每次同步時重置偏移量為 0 (回到當前月)
            await SharedPrefs.setInt('viewedMonthOffset', 0);
 
            // 觸發 Widget 刷新
            await SharedPrefs.updateWidget();
        } catch (e) {
            console.warn('Failed to sync widget data', e);
        }
    }

    private async _syncMonthData(
        records: RawRecord[],
        budgets: BudgetRule[],
        config: BudgetGlobalConfig,
        targetMonth: Date,
        prefix: string
    ): Promise<Promise<any>[]> {
        const {
            totalDailyBudget,
            totalDailySpent,
            totalFixedSpent,
            totalFixedBudget,
            nextFixedExpense,
            totalSpent
        } = calculateBudgetStatus(records, budgets, targetMonth, config);

        const now = new Date();
        const isCurrentMonth = now.getFullYear() === targetMonth.getFullYear() && now.getMonth() === targetMonth.getMonth();

        const totalBudget = totalDailyBudget;
        const disposableDailyBudget = totalBudget - totalFixedSpent;
        
        if (totalBudget <= 0) return [];

        const dailyRemaining = disposableDailyBudget - totalDailySpent;
        const isDailyOver = dailyRemaining < 0;
        const dailyPercent = Math.round((totalDailySpent / Math.max(1, disposableDailyBudget)) * 100);

        const lastDayOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
        
        let remainingDays: number;
        if (isCurrentMonth) {
            remainingDays = Math.max(1, lastDayOfMonth - now.getDate() + 1);
        } else {
            // 對於非當前月，如果是在過去，剩餘天數為 0 (或 1)；如果是在未來，剩餘天數為整月天數
            remainingDays = targetMonth.getTime() < now.getTime() ? 1 : lastDayOfMonth;
        }

        const dailyAllowance = isDailyOver ? 0 : Math.floor(dailyRemaining / remainingDays);
        const monthLabel = `${targetMonth.getFullYear()}/${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;

        const ops = [
            SharedPrefs.setString(prefix + 'monthLabel', monthLabel),
            SharedPrefs.setInt(prefix + 'dailyBudget', Math.round(disposableDailyBudget)),
            SharedPrefs.setInt(prefix + 'dailySpent', Math.round(totalDailySpent)),
            SharedPrefs.setInt(prefix + 'dailyRemaining', Math.round(dailyRemaining)),
            SharedPrefs.setInt(prefix + 'dailyAllowance', dailyAllowance),
            SharedPrefs.setInt(prefix + 'dailyPercent', Math.min(100, Math.max(0, dailyPercent))),
            SharedPrefs.setBoolean(prefix + 'isDailyOver', isDailyOver),
            SharedPrefs.setInt(prefix + 'fixedSpent', Math.round(totalFixedSpent)),
            SharedPrefs.setInt(prefix + 'fixedBudget', Math.round(totalFixedBudget)),
            SharedPrefs.setInt(prefix + 'totalSpent', Math.round(totalSpent)),
            SharedPrefs.setInt(prefix + 'totalBudget', Math.round(totalBudget)),
            SharedPrefs.setInt(prefix + 'remainingDays', remainingDays),
        ];

        if (nextFixedExpense) {
            ops.push(SharedPrefs.setString(prefix + 'nextFixedName', nextFixedExpense.name));
            ops.push(SharedPrefs.setString(prefix + 'nextFixedDate', nextFixedExpense.date));
            ops.push(SharedPrefs.setInt(prefix + 'nextFixedAmount', nextFixedExpense.amount));
        } else {
            ops.push(SharedPrefs.setString(prefix + 'nextFixedName', ''));
            ops.push(SharedPrefs.setString(prefix + 'nextFixedDate', ''));
            ops.push(SharedPrefs.setInt(prefix + 'nextFixedAmount', 0));
        }

        return ops;
    }
}

export default new WidgetService();
