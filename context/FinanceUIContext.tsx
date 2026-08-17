import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';

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

interface FinanceUIContextType {
  searchFilters: SearchFilters | null;
  setSearchFilters: (filters: SearchFilters | null) => void;
  searchModalVisible: boolean;
  setSearchModalVisible: (visible: boolean) => void;
  menuVisible: boolean;
  setMenuVisible: (visible: boolean) => void;
  reconcilingCard: string | null;
  openReconciliation: (cardName: string) => void;
  closeReconciliation: () => void;
}

const FinanceUIContext = createContext<FinanceUIContextType | undefined>(undefined);

export function FinanceUIProvider({ children }: { children: ReactNode }) {
  const [searchFilters, setSearchFilters] = useState<SearchFilters | null>(null);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reconcilingCard, setReconcilingCard] = useState<string | null>(null);

  const openReconciliation = useCallback((cardName: string) => {
    setReconcilingCard(cardName);
  }, []);

  const closeReconciliation = useCallback(() => {
    setReconcilingCard(null);
  }, []);

  const setSearchFiltersStable = useCallback((filters: SearchFilters | null) => {
    setSearchFilters(filters);
  }, []);

  const setSearchModalVisibleStable = useCallback((visible: boolean) => {
    setSearchModalVisible(visible);
  }, []);

  const setMenuVisibleStable = useCallback((visible: boolean) => {
    setMenuVisible(visible);
  }, []);

  const value = useMemo(
    () => ({
      searchFilters,
      setSearchFilters: setSearchFiltersStable,
      searchModalVisible,
      setSearchModalVisible: setSearchModalVisibleStable,
      menuVisible,
      setMenuVisible: setMenuVisibleStable,
      reconcilingCard,
      openReconciliation,
      closeReconciliation,
    }),
    [
      searchFilters,
      setSearchFiltersStable,
      searchModalVisible,
      setSearchModalVisibleStable,
      menuVisible,
      setMenuVisibleStable,
      reconcilingCard,
      openReconciliation,
      closeReconciliation,
    ]
  );

  return (
    <FinanceUIContext.Provider value={value}>
      {children}
    </FinanceUIContext.Provider>
  );
}

export function useFinanceUI() {
  const context = useContext(FinanceUIContext);
  if (!context) {
    throw new Error('useFinanceUI must be used within a FinanceUIProvider');
  }
  return context;
}
