
// A raw record directly from the parsed CSV
export interface RawRecord {
  [key: string]: any;
  id?: string; // Added for unique identification
  '日期': string;
  '時間': string;
  '分類': string;
  '子分類': string;
  '收款(轉入)': string;
  '付款(轉出)': string;
  '金額': string;
  '幣別': string;
  '商家(公司)': string;
  '專案': string;
  '備註': string;
  '摘要'?: string;
  parsedDate?: Date; // Optional, added after initial processing
}

// A record transformed for exporting to another format
export interface TransformedRecord {
  id?: string; // Transferred from RawRecord
  '帳戶': string;
  '幣種': 'TWD';
  '記錄類型': '收入' | '支出' | '轉帳' | '轉出' | '轉入' | '未知';
  '主類別': string;
  '子類別': string;
  '金額': number;
  '手續費': number;
  '折扣': number;
  '名稱': string;
  '商家': string;
  '日期': string;
  '時間': string;
  '專案': string;
  '描述': string;
  '標籤': string;
  '對象': string;
}

// Summary for a single account
export interface AccountSummary {
  income: number;
  expenditure: number;
  balance: number;
  category?: string; // Original account category
}

// A map of account names to their summaries
export interface AccountsSummaryMap {
  [accountName: string]: AccountSummary;
}

// Data point for the trend chart
export interface TrendDataPoint {
  date: Date;
  income: number;
  expense: number;
  balance: number;
}

// Generic data for pie charts or bar charts
export interface ChartData {
  name: string;
  value: number;
}

// Budget Management Interfaces
export interface BudgetRule {
  id: string;
  category: string;
  monthlyLimit: number;
}

export interface BudgetStatus {
  rule: BudgetRule;
  spent: number;
  remaining: number;
  percentage: number;
  status: 'safe' | 'warning' | 'danger' | 'exceeded';
  dailySafeSpend?: number;
}

// 固定支出專案的花費狀態
export interface FixedProjectStatus {
  project: string;
  spent: number;
}

export interface BudgetCalculationResult {
  // 日常預算（category-based，只計算日常專案的支出）
  dailyStatuses: BudgetStatus[];
  dailyUnbudgetedSpent: number;
  totalDailyBudget: number;
  totalDailySpent: number;
  // 固定支出（project-based，計算固定專案的支出）
  fixedProjectStatuses: FixedProjectStatus[];
  totalFixedSpent: number;
  // 全域
  totalSpent: number;
}

export interface BudgetGlobalConfig {
  includedProjects: string[];
  splitProjects: string[];
  // 專案群組：'fixed' = 固定支出, 'daily' = 日常預算（預設 'daily'）
  projectGroups: { [project: string]: 'fixed' | 'daily' };
  isSplitEnabled?: boolean;
}

