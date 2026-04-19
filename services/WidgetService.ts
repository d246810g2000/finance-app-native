import { NativeModules, Platform } from 'react-native';
import { loadBudgets, loadBudgetConfig, calculateBudgetStatus } from './budgetService';
import { RawRecord } from '../types';

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
            const { 
                totalDailyBudget, 
                totalDailySpent, 
                totalFixedSpent, 
                totalFixedBudget,
                nextFixedExpense,
                totalSpent 
            } = calculateBudgetStatus(records, budgets, now, config);

            // 邏輯與 budget.tsx 保持一致
            const totalBudget = totalDailyBudget;
            const disposableDailyBudget = totalBudget - totalFixedSpent;
            
            if (totalBudget <= 0) return;

            const dailyRemaining = disposableDailyBudget - totalDailySpent;
            const isDailyOver = dailyRemaining < 0;
            const dailyPercent = Math.round((totalDailySpent / Math.max(1, disposableDailyBudget)) * 100);

            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const remainingDays = Math.max(1, lastDayOfMonth - now.getDate() + 1);
            // 日常剩餘 / 剩餘天數 = 每日可用
            const dailyAllowance = isDailyOver ? 0 : Math.floor(dailyRemaining / remainingDays);

            // 寫入 SharedPreferences
            const syncOps = [
                SharedPrefs.setInt('dailyBudget', Math.round(disposableDailyBudget)),
                SharedPrefs.setInt('dailySpent', Math.round(totalDailySpent)),
                SharedPrefs.setInt('dailyRemaining', Math.round(dailyRemaining)),
                SharedPrefs.setInt('dailyAllowance', dailyAllowance),
                SharedPrefs.setInt('dailyPercent', Math.min(100, Math.max(0, dailyPercent))),
                SharedPrefs.setBoolean('isDailyOver', isDailyOver),
                
                SharedPrefs.setInt('fixedSpent', Math.round(totalFixedSpent)),
                SharedPrefs.setInt('fixedBudget', Math.round(totalFixedBudget)),
                
                SharedPrefs.setInt('totalSpent', Math.round(totalSpent)),
                SharedPrefs.setInt('totalBudget', Math.round(totalBudget)), 
                SharedPrefs.setInt('remainingDays', remainingDays),
            ];

            // 待繳項目數據
            if (nextFixedExpense) {
                syncOps.push(SharedPrefs.setString('nextFixedName', nextFixedExpense.name));
                syncOps.push(SharedPrefs.setString('nextFixedDate', nextFixedExpense.date));
                syncOps.push(SharedPrefs.setInt('nextFixedAmount', nextFixedExpense.amount));
            } else {
                syncOps.push(SharedPrefs.setString('nextFixedName', ''));
                syncOps.push(SharedPrefs.setString('nextFixedDate', ''));
                syncOps.push(SharedPrefs.setInt('nextFixedAmount', 0));
            }

            await Promise.all(syncOps);

            // 觸發 Widget 刷新
            await SharedPrefs.updateWidget();
        } catch (e) {
            console.warn('Failed to sync widget data', e);
        }
    }
}

export default new WidgetService();
