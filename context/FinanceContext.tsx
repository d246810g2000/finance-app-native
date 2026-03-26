
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { RawRecord } from '../types';
import { Alert, AppState, AppStateStatus } from 'react-native';

const RECORDS_FILE_NAME = 'finance_records.json';
const RECORDS_FILE_URI = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + RECORDS_FILE_NAME;

interface FinanceContextType {
    records: RawRecord[];
    isLoading: boolean;
    loadRecords: (records: RawRecord[]) => void;
    clearRecords: () => void;
    deleteRecord: (id: string) => void;
    refreshRecords: () => Promise<void>;
    globalExcludeTravel: boolean;
    setGlobalExcludeTravel: (value: boolean) => void;
    searchFilters: SearchFilters | null;
    setSearchFilters: (filters: SearchFilters | null) => void;
    searchModalVisible: boolean;
    setSearchModalVisible: (visible: boolean) => void;
    menuVisible: boolean;
    setMenuVisible: (visible: boolean) => void;
    searchMetadata: SearchMetadata;
}

export interface SearchMetadata {
    categories: string[];
    accounts: string[];
    projects: string[];
    minDate: Date;
    maxDate: Date;
}

export interface SearchFilters {
    keyword: string;
    category: string;
    startDate: Date | null;
    endDate: Date | null;
    account: string;
    project: string;
    minAmount: number | null;
    maxAmount: number | null;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider = ({ children }: { children: ReactNode }) => {
    const [records, setRecords] = useState<RawRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [globalExcludeTravel, setGlobalExcludeTravel] = useState(false);
    const [searchFilters, setSearchFilters] = useState<SearchFilters | null>(null);
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);

    const refreshRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            const fileInfo = await FileSystem.getInfoAsync(RECORDS_FILE_URI);
            if (fileInfo.exists) {
                const stored = await FileSystem.readAsStringAsync(RECORDS_FILE_URI);
                if (stored) {
                    const parsed: RawRecord[] = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        const withIds = parsed.map(r => ({
                            ...r,
                            id: r.id || Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
                        }));
                        setRecords(withIds);

                        import('../services/NotificationService').then(service => {
                            service.default.syncWithRecords(withIds);
                        });
                    }
                }
            } else {
                // File does not exist yet, initial state
                setRecords([]);
            }
        } catch (e: any) {
            console.error('Failed to restore records from file storage', e);
            Alert.alert('讀取錯誤', '無法讀取記錄檔案。');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // App 啟動時從 FileSystem 載入資料
    useEffect(() => {
        refreshRecords();
    }, [refreshRecords]);

    // 當 App 回到前景時，同步通知 + Widget
    const appState = useRef(AppState.currentState);
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (appState.current.match(/inactive|background/) && nextState === 'active') {
                import('../services/NotificationService').then(s => s.default.syncWithRecords(records));
                import('../services/WidgetService').then(s => s.default.syncWidgetData(records));
            }
            appState.current = nextState;
        });
        return () => subscription.remove();
    }, [records]);

    const saveRecordsToFile = async (newRecords: RawRecord[]) => {
        try {
            // 優化：儲存前移除額外欄位以節省空間
            const cleanForStorage = newRecords.map(({ parsedDate, ...rest }) => rest);
            await FileSystem.writeAsStringAsync(RECORDS_FILE_URI, JSON.stringify(cleanForStorage));

            // Trigger Notification + Widget Update asynchronously
            import('../services/NotificationService').then(s => s.default.syncWithRecords(newRecords));
            import('../services/WidgetService').then(s => s.default.syncWidgetData(newRecords));
        } catch (e) {
            console.error('Failed to save records to file', e);
            Alert.alert('儲存錯誤', '無法儲存記錄。');
        }
    };

    const loadRecords = useCallback((newRecords: RawRecord[]) => {
        const withIds = newRecords.map(r => ({
            ...r,
            id: r.id || Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
        }));
        setRecords(withIds);
        saveRecordsToFile(withIds);
    }, []);

    const clearRecords = useCallback(() => {
        setRecords([]);
        FileSystem.deleteAsync(RECORDS_FILE_URI, { idempotent: true }).catch(e =>
            console.error('Failed to clear records file', e)
        );
    }, []);

    const deleteRecord = useCallback((recordId: string) => {
        setRecords(prev => {
            const updated = prev.filter(r => r.id !== recordId);
            saveRecordsToFile(updated);
            return updated;
        });
    }, []);

    const searchMetadata = React.useMemo(() => {
        const cats = new Set<string>();
        const accs = new Set<string>();
        const projs = new Set<string>();
        let min = new Date();
        let max = new Date();

        if (records.length > 0) {
            // Avoid heavy transformation if we just need metadata
            // But for consistency we use the same logic
            records.forEach(r => {
                if (r['主類別']) cats.add(r['主類別']);
                if (r['帳戶']) accs.add(r['帳戶']);
                if (r['專案']) projs.add(r['專案']);

                if (r['日期']) {
                    const d = new Date(r['日期']);
                    if (!isNaN(d.getTime())) {
                        if (d < min) min = d;
                        if (d > max) max = d;
                    }
                }
            });
        }

        return {
            categories: Array.from(cats).sort(),
            accounts: Array.from(accs).sort(),
            projects: Array.from(projs).sort(),
            minDate: min,
            maxDate: max
        };
    }, [records]);

    return (
        <FinanceContext.Provider value={{
            records, isLoading, loadRecords, clearRecords, deleteRecord, refreshRecords,
            globalExcludeTravel, setGlobalExcludeTravel,
            searchFilters, setSearchFilters,
            searchModalVisible, setSearchModalVisible,
            menuVisible, setMenuVisible,
            searchMetadata
        }}>
            {children}
        </FinanceContext.Provider>
    );
};

export const useFinance = () => {
    const context = useContext(FinanceContext);
    if (!context) {
        throw new Error('useFinance must be used within a FinanceProvider');
    }
    return context;
};
