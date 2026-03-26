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
                totalSpent 
            } = calculateBudgetStatus(records, budgets, now, config);

            const dailyBudget = totalDailyBudget;
            if (dailyBudget <= 0) return;

            const dailyRemaining = dailyBudget - totalDailySpent;
            const isDailyOver = dailyRemaining < 0;
            const dailyPercent = Math.round((totalDailySpent / dailyBudget) * 100);

            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const remainingDays = Math.max(1, lastDayOfMonth - now.getDate() + 1);
            const dailyAllowance = isDailyOver ? 0 : Math.floor(dailyRemaining / remainingDays);

            // 寫入 SharedPreferences
            await Promise.all([
                SharedPrefs.setInt('dailyBudget', Math.round(dailyBudget)),
                SharedPrefs.setInt('dailySpent', Math.round(totalDailySpent)),
                SharedPrefs.setInt('dailyRemaining', Math.round(dailyRemaining)),
                SharedPrefs.setInt('dailyAllowance', dailyAllowance),
                SharedPrefs.setInt('dailyPercent', dailyPercent),
                SharedPrefs.setBoolean('isDailyOver', isDailyOver),
                
                SharedPrefs.setInt('fixedSpent', Math.round(totalFixedSpent)),
                
                SharedPrefs.setInt('totalSpent', Math.round(totalSpent)),
                SharedPrefs.setInt('totalBudget', Math.round(dailyBudget + totalFixedSpent)), // Assuming total is just sum here or whatever is appropriate
                SharedPrefs.setInt('remainingDays', remainingDays),
            ]);

            // 觸發 Widget 刷新
            await SharedPrefs.updateWidget();
        } catch (e) {
            console.warn('Failed to sync widget data', e);
        }
    }
}

export default new WidgetService();
