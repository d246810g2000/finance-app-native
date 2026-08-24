import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, useMemo } from 'react';
import { RawRecord, CustomAccountMappings, BudgetRule, BudgetGlobalConfig, CreditCardSettingsMap } from '../types';
import { AppState, AppStateStatus } from 'react-native';
import { PERSONAL_ACCOUNTS, SHARED_ACCOUNTS } from '../constants';
import { loadCustomAccountMappings, saveCustomAccountMappings, loadExcludedAccounts, saveExcludedAccounts as saveExcludedAccountsService } from '../services/accountConfigService';
import { loadBudgetConfig, saveBudgetConfig as saveBudgetConfigService, loadBudgets, saveBudgets as saveBudgetsService } from '../services/budgetService';
import { loadCreditCardSettings, saveCreditCardSettings as saveCreditCardSettingsService } from '../services/creditCardSettingsService';
import { upsertRecordsById, UpsertResult } from '../services/financeService';
import { createPersistenceQueue } from '../services/persistence/persistenceQueue';
import { createFileSystemRecordsRepository } from '../services/persistence/recordsRepository';
import { showPersistenceIssueAlert } from '../services/persistence/persistenceFeedback';
import { createRecordSynchronizer } from '../services/recordSyncService';
import { parseFormattedDate } from '../utils/dateUtils';
import { FinanceUIProvider, useFinanceUI } from './FinanceUIContext';
import type { SearchFilters } from './FinanceUIContext';

export type { SearchFilters };
export { useFinanceUI };

interface FinanceContextType {
    records: RawRecord[];
    isLoading: boolean;
    persistenceError: string | null;
    loadRecords: (records: RawRecord[]) => void;
    mergeRecords: (records: RawRecord[], options?: { syncDelete?: boolean }) => UpsertResult;
    clearRecords: () => void;
    deleteRecord: (id: string) => void;
    updateRecords: (updates: Array<{ id: string; patch: Partial<RawRecord> }>) => void;
    refreshRecords: () => Promise<void>;
    globalExcludeTravel: boolean;
    setGlobalExcludeTravel: (value: boolean) => void;
    customMappings: CustomAccountMappings;
    saveCustomMappings: (mappings: CustomAccountMappings) => Promise<void>;
    personalAccounts: string[];
    sharedAccounts: string[];
    excludedAccounts: string[];
    saveExcludedAccounts: (exclusions: string[]) => Promise<void>;
    budgetConfig: BudgetGlobalConfig;
    saveBudgetConfig: (config: BudgetGlobalConfig) => Promise<void>;
    budgets: BudgetRule[];
    saveBudgets: (budgets: BudgetRule[]) => Promise<void>;
    creditCardSettings: CreditCardSettingsMap;
    saveCreditCardSettings: (settings: CreditCardSettingsMap) => Promise<void>;
}

export interface SearchMetadata {
    categories: string[];
    accounts: string[];
    projects: string[];
    minDate: Date;
    maxDate: Date;
}

const EMPTY_SEARCH_METADATA: SearchMetadata = {
    categories: [],
    accounts: [],
    projects: [],
    minDate: new Date(),
    maxDate: new Date(),
};

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

/** 僅在搜尋 Modal 開啟時計算，避免 records 變動時全 App 承擔 Set/Date 掃描 */
export function buildSearchMetadata(records: RawRecord[]): SearchMetadata {
    const cats = new Set<string>();
    const accs = new Set<string>();
    const projs = new Set<string>();
    let min = new Date();
    let max = new Date(0);

    if (records.length > 0) {
        records.forEach(r => {
            const cat = r['分類'] || r['主類別'];
            if (cat && cat !== 'SYSTEM') cats.add(cat);
            if (r['收款(轉入)']) accs.add(r['收款(轉入)']);
            if (r['付款(轉出)']) accs.add(r['付款(轉出)']);
            if (r['專案']) projs.add(r['專案']);

            const dateStr = (r['日期'] || '').toString();
            if (dateStr.length >= 8) {
                const d = parseFormattedDate(dateStr);
                if (d && !isNaN(d.getTime())) {
                    if (d < min) min = d;
                    if (d > max) max = d;
                }
            }
        });
    }

    if (max.getTime() === 0) max = new Date();

    return {
        categories: Array.from(cats).sort(),
        accounts: Array.from(accs).sort(),
        projects: Array.from(projs).sort(),
        minDate: min,
        maxDate: max,
    };
}

function FinanceDataProvider({ children }: { children: ReactNode }) {
    const [records, setRecords] = useState<RawRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [persistenceError, setPersistenceError] = useState<string | null>(null);
    const [globalExcludeTravel, setGlobalExcludeTravel] = useState(false);
    const [customMappings, setCustomMappings] = useState<CustomAccountMappings>({});
    const [excludedAccounts, setExcludedAccounts] = useState<string[]>([]);
    const [budgetConfig, setBudgetConfig] = useState<BudgetGlobalConfig>({ includedProjects: [], splitProjects: [], projectGroups: {} });
    const [budgets, setBudgets] = useState<BudgetRule[]>([]);
    const [creditCardSettings, setCreditCardSettings] = useState<CreditCardSettingsMap>({});

    const pendingSaveRef = useRef<RawRecord[] | null>(null);
    const recordsRef = useRef<RawRecord[]>([]);
    recordsRef.current = records;

    const recordsRepositoryRef = useRef(createFileSystemRecordsRepository());
    const recordSynchronizerRef = useRef(createRecordSynchronizer());
    const persistenceQueueRef = useRef(createPersistenceQueue<RawRecord[]>({
        save: async newRecords => {
            setPersistenceError(null);
            await recordsRepositoryRef.current.save(newRecords);
            await recordSynchronizerRef.current.sync(newRecords);
        },
        clear: () => recordsRepositoryRef.current.clear(),
        onError: error => {
            console.error('Failed to persist finance records', error);
            showPersistenceIssueAlert('無法儲存記錄。');
            setPersistenceError('無法儲存記錄。');
        },
    }));

    useEffect(() => {
        loadCustomAccountMappings().then(setCustomMappings);
        loadExcludedAccounts().then(setExcludedAccounts);
        loadBudgetConfig().then(setBudgetConfig);
        loadBudgets().then(setBudgets);
        loadCreditCardSettings().then(setCreditCardSettings);
    }, []);

    const saveCustomMappings = useCallback(async (newMappings: CustomAccountMappings) => {
        setCustomMappings(newMappings);
        await saveCustomAccountMappings(newMappings);
    }, []);

    const saveExcludedAccounts = useCallback(async (exclusions: string[]) => {
        setExcludedAccounts(exclusions);
        await saveExcludedAccountsService(exclusions);
    }, []);

    const saveBudgetConfig = useCallback(async (newConfig: BudgetGlobalConfig) => {
        setBudgetConfig(newConfig);
        await saveBudgetConfigService(newConfig);
    }, []);

    const saveBudgets = useCallback(async (newBudgets: BudgetRule[]) => {
        setBudgets(newBudgets);
        await saveBudgetsService(newBudgets);
    }, []);

    const saveCreditCardSettings = useCallback(async (newSettings: CreditCardSettingsMap) => {
        setCreditCardSettings(newSettings);
        await saveCreditCardSettingsService(newSettings);
    }, []);

    const setGlobalExcludeTravelStable = useCallback((value: boolean) => {
        setGlobalExcludeTravel(value);
    }, []);

    const personalAccounts = useMemo(() => {
        const base = PERSONAL_ACCOUNTS.filter(acc => {
            const mapping = customMappings[acc];
            return !mapping || mapping.type !== 'shared';
        });
        Object.entries(customMappings).forEach(([acc, config]) => {
            if (config.type === 'personal' && !base.includes(acc)) {
                base.push(acc);
            }
        });
        return base;
    }, [customMappings]);

    const sharedAccounts = useMemo(() => {
        const base = SHARED_ACCOUNTS.filter(acc => {
            const mapping = customMappings[acc];
            return !mapping || mapping.type !== 'personal';
        });
        Object.entries(customMappings).forEach(([acc, config]) => {
            if (config.type === 'shared' && !base.includes(acc)) {
                base.push(acc);
            }
        });
        return base;
    }, [customMappings]);

    /** 所有寫入走同一線性佇列；immediate=true 時略過防抖（背景 flush / 匯入刪除） */
    const enqueueSave = useCallback((recordsToSave: RawRecord[], immediate = false) => {
        pendingSaveRef.current = recordsToSave;
        persistenceQueueRef.current.enqueue(recordsToSave, immediate);
    }, []);

    const refreshRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            const storedRecords = await recordsRepositoryRef.current.load();
            const withIds = storedRecords.map(r => ({
                ...r,
                id: r.id || Math.random().toString(36).substring(2, 11) + Date.now().toString(36)
            }));
            setRecords(withIds);
            recordSynchronizerRef.current.sync(withIds).catch((error: unknown) => {
                console.error('Failed to synchronize notifications', error);
            });
        } catch (error) {
            console.error('Failed to restore records from file storage', error);
            showPersistenceIssueAlert('無法讀取記錄檔案。');
            setPersistenceError('無法讀取記錄檔案。');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshRecords();
    }, [refreshRecords]);

    // 前景同步通知；背景強制 flush 待寫入快照
    const appState = useRef(AppState.currentState);
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (appState.current.match(/inactive|background/) && nextState === 'active') {
                recordSynchronizerRef.current.sync(recordsRef.current);
            }
            if (nextState.match(/inactive|background/) && pendingSaveRef.current) {
                enqueueSave(pendingSaveRef.current, true);
            }
            appState.current = nextState;
        });
        return () => subscription.remove();
    }, [enqueueSave]);

    useEffect(() => () => {
        if (pendingSaveRef.current) {
            enqueueSave(pendingSaveRef.current, true);
        }
        persistenceQueueRef.current.dispose();
    }, [enqueueSave]);

    const loadRecords = useCallback((newRecords: RawRecord[]) => {
        const withIds = newRecords.map(r => ({
            ...r,
            id: r.id || Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
        }));
        setRecords(withIds);
        enqueueSave(withIds, true);
    }, [enqueueSave]);

    const mergeRecords = useCallback((incoming: RawRecord[], options?: { syncDelete?: boolean }): UpsertResult => {
        let result: UpsertResult = { records: [], added: 0, updated: 0, kept: 0, removed: 0 };
        setRecords(prev => {
            result = upsertRecordsById(prev, incoming, options);
            enqueueSave(result.records, true);
            return result.records;
        });
        return result;
    }, [enqueueSave]);

    const clearRecords = useCallback(() => {
        setRecords([]);
        pendingSaveRef.current = null;
        persistenceQueueRef.current.clear();
    }, []);

    const deleteRecord = useCallback((recordId: string) => {
        setRecords(prev => {
            const updated = prev.filter(r => r.id !== recordId);
            enqueueSave(updated, true);
            return updated;
        });
    }, [enqueueSave]);

    const updateRecords = useCallback((updates: Array<{ id: string; patch: Partial<RawRecord> }>) => {
        if (!updates.length) return;
        const patchMap = new Map(updates.map(u => [u.id, u.patch]));
        setRecords(prev => {
            let changed = false;
            const updated = prev.map(r => {
                const id = String(r.id || '');
                const patch = patchMap.get(id);
                if (!patch) return r;
                changed = true;
                const next: RawRecord = { ...r, ...patch, id: r.id };
                if ('isReconciled' in patch && patch.isReconciled === undefined) {
                    delete next.isReconciled;
                }
                delete next.postponedToPeriod;
                return next;
            });
            if (!changed) return prev;
            enqueueSave(updated, false);
            return updated;
        });
    }, [enqueueSave]);

    const value = useMemo(
        () => ({
            records,
            isLoading,
            persistenceError,
            loadRecords,
            mergeRecords,
            clearRecords,
            deleteRecord,
            updateRecords,
            refreshRecords,
            globalExcludeTravel,
            setGlobalExcludeTravel: setGlobalExcludeTravelStable,
            customMappings,
            saveCustomMappings,
            personalAccounts,
            sharedAccounts,
            excludedAccounts,
            saveExcludedAccounts,
            budgetConfig,
            saveBudgetConfig,
            budgets,
            saveBudgets,
            creditCardSettings,
            saveCreditCardSettings,
        }),
        [
            records,
            isLoading,
            loadRecords,
            mergeRecords,
            clearRecords,
            deleteRecord,
            updateRecords,
            refreshRecords,
            globalExcludeTravel,
            setGlobalExcludeTravelStable,
            customMappings,
            saveCustomMappings,
            personalAccounts,
            sharedAccounts,
            excludedAccounts,
            saveExcludedAccounts,
            budgetConfig,
            saveBudgetConfig,
            budgets,
            saveBudgets,
            creditCardSettings,
            saveCreditCardSettings,
        ]
    );

    return (
        <FinanceContext.Provider value={value}>
            {children}
        </FinanceContext.Provider>
    );
}

export const FinanceProvider = ({ children }: { children: ReactNode }) => (
    <FinanceUIProvider>
        <FinanceDataProvider>
            {children}
        </FinanceDataProvider>
    </FinanceUIProvider>
);

/** 僅訂閱領域資料（records / budgets 等），不受選單／搜尋／對帳 UI 狀態影響 */
export const useFinance = () => {
    const context = useContext(FinanceContext);
    if (!context) {
        throw new Error('useFinance must be used within a FinanceProvider');
    }
    return context;
};

/** 同時需要 Data + UI 時使用（例如 records 頁）；會訂閱兩邊變更 */
export const useFinanceWithUI = () => {
    const data = useFinance();
    const ui = useFinanceUI();
    return { ...data, ...ui, searchMetadata: EMPTY_SEARCH_METADATA };
};

export { EMPTY_SEARCH_METADATA };
