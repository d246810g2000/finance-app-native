import AsyncStorage from '@react-native-async-storage/async-storage';
import { BudgetRule, BudgetGlobalConfig, RawRecord } from '../types';
import { calculateBudgetStatus } from './budgetService';
import { Platform } from 'react-native';

const NOTIFICATION_CHANNEL_ID = 'budget-ongoing';
const SETTING_KEY = '@budget_notification_enabled';
const DEBOUNCE_MS = 2000; // 防止短時間內重複觸發

let notifee: any = null;
let AndroidImportance: any = null;
let AndroidStyle: any = null;

try {
    const notifeeModule = require('@notifee/react-native');
    notifee = notifeeModule.default;
    AndroidImportance = notifeeModule.AndroidImportance;
    AndroidStyle = notifeeModule.AndroidStyle;
} catch (e) {
    console.warn("Notifee native module not found. Budget notifications will be disabled.");
}

class NotificationService {
    private _syncTimer: ReturnType<typeof setTimeout> | null = null;
    private _isSyncing = false;

    isSupported(): boolean {
        return !!notifee && Platform.OS === 'android';
    }

    async isEnabled(): Promise<boolean> {
        if (!notifee || Platform.OS !== 'android') return false;
        try {
            const val = await AsyncStorage.getItem(SETTING_KEY);
            return val === 'true';
        } catch {
            return false;
        }
    }

    async setEnabled(enabled: boolean): Promise<void> {
        if (!notifee || Platform.OS !== 'android') {
            console.warn("Notifications are not supported in this environment");
            return;
        }
        try {
            await AsyncStorage.setItem(SETTING_KEY, enabled ? 'true' : 'false');
            if (!enabled) {
                await this.cancelNotification();
            }
        } catch (e) {
            console.error('Failed to save notification setting', e);
        }
    }

    async requestPermissions(): Promise<boolean> {
        if (!notifee) return false;
        try {
            const settings = await notifee.requestPermission();
            return settings.authorizationStatus >= 1;
        } catch (e) {
            console.error('Failed to request notification permissions', e);
            return false;
        }
    }

    async updateBudgetNotification(
        records: RawRecord[],
        budgets: BudgetRule[],
        config: BudgetGlobalConfig
    ): Promise<void> {
        if (!notifee) return;

        try {
            const enabled = await this.isEnabled();
            if (!enabled) return;

            const hasPermission = await this.requestPermissions();
            if (!hasPermission) return;

            // 計算當月預算狀態
            const now = new Date();
            const { totalSpent } = calculateBudgetStatus(records, budgets, now, config);

            const totalBudget = budgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
            if (totalBudget <= 0) return; // 沒有設定預算則不顯示

            const remaining = totalBudget - totalSpent;
            const isOverBudget = remaining < 0;

            await this.displayOngoingNotification(totalBudget, totalSpent, remaining, isOverBudget);
        } catch (e) {
            console.error('Failed to update budget notification', e);
        }
    }

    private async displayOngoingNotification(
        totalBudget: number,
        totalSpent: number,
        remaining: number,
        isOverBudget: boolean
    ) {
        if (!notifee) return;

        try {
            // 建立低干擾的常駐頻道
            const channelId = await notifee.createChannel({
                id: NOTIFICATION_CHANNEL_ID,
                name: '預算追蹤 (常駐)',
                importance: AndroidImportance?.LOW ?? 2,
            });

            // 計算本月剩餘天數與建議日支配額
            const now = new Date();
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const remainingDays = Math.max(1, lastDayOfMonth - now.getDate() + 1);
            const dailyAllowance = isOverBudget ? 0 : Math.floor(remaining / remainingDays);
            const spentPercent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

            const title = isOverBudget
                ? `⚠️ ${spentPercent}% 已超支 ・NT$ 0/天`
                : `${spentPercent}% 已花費 ・NT$ ${dailyAllowance.toLocaleString()}/天`;

            const body = `$${totalSpent.toLocaleString()} / $${totalBudget.toLocaleString()} ・${isOverBudget ? '超支' : '結餘'} $${Math.abs(remaining).toLocaleString()} ・剩餘 ${remainingDays} 天`;

            await notifee.displayNotification({
                id: NOTIFICATION_CHANNEL_ID,
                title,
                body,
                android: {
                    channelId,
                    ongoing: true,
                    autoCancel: false,
                    largeIcon: 'ic_launcher',     // 通知面板顯示的 App icon
                    style: {
                        type: AndroidStyle?.BIGTEXT ?? 1,
                        text: body,
                    },
                    pressAction: {
                        id: 'default',
                        launchActivity: 'default',
                    },
                },
            });
        } catch (e) {
            console.error('Failed to display notification', e);
        }
    }

    /**
     * Debounced sync — 防止短時間內多次呼叫導致通知閃爍
     */
    async syncWithRecords(records: RawRecord[]): Promise<void> {
        if (!notifee) return;

        // 清除之前的 pending sync
        if (this._syncTimer) {
            clearTimeout(this._syncTimer);
            this._syncTimer = null;
        }

        this._syncTimer = setTimeout(async () => {
            // 防止並行執行
            if (this._isSyncing) return;
            this._isSyncing = true;

            try {
                const enabled = await this.isEnabled();
                if (!enabled) return;

                const { loadBudgets, loadBudgetConfig } = await import('./budgetService');
                const budgets = await loadBudgets();
                const config = await loadBudgetConfig();

                await this.updateBudgetNotification(records, budgets, config);
            } catch (e) {
                console.error('Failed to sync notification with records', e);
            } finally {
                this._isSyncing = false;
            }
        }, DEBOUNCE_MS);
    }

    async cancelNotification(): Promise<void> {
        if (!notifee) return;
        try {
            await notifee.cancelNotification(NOTIFICATION_CHANNEL_ID);
        } catch (e) {
            console.error('Failed to cancel notification', e);
        }
    }
}

export default new NotificationService();
