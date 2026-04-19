
import * as FileSystem from 'expo-file-system/legacy';
import { RawRecord, BudgetRule, BudgetStatus, BudgetCalculationResult, BudgetGlobalConfig, FixedProjectStatus } from '../types';
import { SHARED_ACCOUNTS, EXCHANGE_RATES } from '../constants';

const BUDGET_FILE_NAME = 'budget_rules.json';
const CONFIG_FILE_NAME = 'budget_config.json';
const BUDGET_FILE_URI = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + BUDGET_FILE_NAME;
const CONFIG_FILE_URI = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + CONFIG_FILE_NAME;

// Default configuration
const DEFAULT_CONFIG: BudgetGlobalConfig = {
  includedProjects: ['正常開銷', '共同開銷'],
  splitProjects: ['共同開銷'],
  projectGroups: {},
};

export const loadBudgets = async (): Promise<BudgetRule[]> => {
  try {
    const info = await FileSystem.getInfoAsync(BUDGET_FILE_URI);
    if (!info.exists) return [];
    const content = await FileSystem.readAsStringAsync(BUDGET_FILE_URI);
    const parsed = JSON.parse(content);
    // 向下相容：移除舊的 group 欄位（如果有的話）
    return parsed.map((b: any) => ({
      id: b.id,
      category: b.category,
      monthlyLimit: b.monthlyLimit,
    }));
  } catch (e) {
    console.error('Failed to load budgets', e);
    return [];
  }
};

export const saveBudgets = async (budgets: BudgetRule[]): Promise<void> => {
  try {
    await FileSystem.writeAsStringAsync(BUDGET_FILE_URI, JSON.stringify(budgets));
  } catch (e) {
    console.error('Failed to save budgets', e);
  }
};

export const loadBudgetConfig = async (): Promise<BudgetGlobalConfig> => {
  try {
    const info = await FileSystem.getInfoAsync(CONFIG_FILE_URI);
    if (!info.exists) return DEFAULT_CONFIG;
    const content = await FileSystem.readAsStringAsync(CONFIG_FILE_URI);
    const parsed = JSON.parse(content);
    // 向下相容：若缺少 projectGroups 欄位，自動填入空物件
    return {
      ...parsed,
      projectGroups: parsed.projectGroups || {},
    };
  } catch (e) {
    console.error('Failed to load budget config', e);
    return DEFAULT_CONFIG;
  }
};

export const saveBudgetConfig = async (config: BudgetGlobalConfig): Promise<void> => {
  try {
    await FileSystem.writeAsStringAsync(CONFIG_FILE_URI, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save budget config', e);
  }
};

/**
 * 判斷專案屬於哪個群組
 */
const getProjectGroup = (project: string, config: BudgetGlobalConfig): 'fixed' | 'daily' => {
  return config.projectGroups[project] || 'daily';
};

/**
 * 從 Periodic 字串或日期字串提取扣款日 (Day)
 */
const getDueDayFromRecord = (record: RawRecord): number | null => {
  // 優先從 Periodic 提取 (格式: Type|YYYYMMDD|...)
  if (record['Periodic'] && typeof record['Periodic'] === 'string') {
    const parts = record['Periodic'].split('|');
    if (parts.length > 1 && parts[1].length === 8) {
      const day = parseInt(parts[1].substring(6, 8), 10);
      if (!isNaN(day)) return day;
    }
  }

  // 次之從日期字串提取
  const dateStr = record['日期'];
  if (!dateStr) return null;

  if (dateStr.includes('/') || dateStr.includes('-')) {
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    if (parts.length === 3) {
      return parseInt(parts[2], 10);
    }
  } else if (dateStr.length >= 8) {
    return parseInt(dateStr.substring(6, 8), 10);
  }

  return null;
};

export const calculateBudgetStatus = (
  records: RawRecord[],
  budgets: BudgetRule[],
  targetMonth: Date,
  config: BudgetGlobalConfig
): BudgetCalculationResult => {
  const targetYear = targetMonth.getFullYear();
  const targetMonthIndex = targetMonth.getMonth();

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === targetYear && now.getMonth() === targetMonthIndex;

  // 1. Filter records for the target month
  const monthRecords = records.filter(record => {
    let year, month;
    if (record.parsedDate) {
      year = record.parsedDate.getFullYear();
      month = record.parsedDate.getMonth();
    } else if (record['日期'] && typeof record['日期'] === 'string') {
      const dateStr = record['日期'];
      if (dateStr.includes('/') || dateStr.includes('-')) {
        const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
        if (parts.length === 3) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
        } else {
          return false;
        }
      } else if (dateStr.length >= 8) {
        year = parseInt(dateStr.substring(0, 4), 10);
        month = parseInt(dateStr.substring(4, 6), 10) - 1;
      } else {
        return false;
      }
    } else {
      return false;
    }
    return year === targetYear && month === targetMonthIndex;
  });

  // 2. Aggregate expenses by category AND project group
  const dailyCategorySpent: { [category: string]: number } = {};
  const fixedCategorySpent: { [category: string]: number } = {};
  const fixedProjectSpent: { [project: string]: number } = {};
  let totalSpent = 0;
  let totalDailySpent = 0;
  let totalFixedSpent = 0;

  // 追蹤固定支出專案是否已付 (用於判斷待繳)
  const paidFixedProjects = new Set<string>();

  monthRecords.forEach(record => {
    const expenseAccount = record['付款(轉出)'];
    const incomeAccount = record['收款(轉入)'];

    if (expenseAccount && !incomeAccount && record['分類'] !== 'SYSTEM' && record['分類'] !== '代付') {
      const project = record['專案'] || '';

      if (!config.includedProjects.includes(project)) {
        return;
      }

      const category = record['分類'];
      const rawAmountStr = (record['金額'] || '').replace(/[,￥$€£]/g, '').trim();
      let amount = parseFloat(rawAmountStr) || 0;

      const currency = record['幣別'];
      const exchangeRate = EXCHANGE_RATES[currency] || 1;
      amount = Math.abs(amount * exchangeRate);

      if (config.splitProjects.includes(project)) {
        amount = amount * 0.5;
      }

      totalSpent += amount;

      const group = getProjectGroup(project, config);
      if (group === 'fixed') {
        fixedProjectSpent[project] = (fixedProjectSpent[project] || 0) + amount;
        fixedCategorySpent[category] = (fixedCategorySpent[category] || 0) + amount;
        totalFixedSpent += amount;
        paidFixedProjects.add(project);
      } else {
        dailyCategorySpent[category] = (dailyCategorySpent[category] || 0) + amount;
        totalDailySpent += amount;
      }
    }
  });

  // 3. Map budget rules to daily statuses
  let totalFixedBudget = 0;
  const fixedCategories = new Set<string>();

  const dailyStatuses: BudgetStatus[] = budgets.map(rule => {
    const dailySpent = Math.round(dailyCategorySpent[rule.category] || 0);
    const fixedSpent = Math.round(fixedCategorySpent[rule.category] || 0);
    
    // 如果該類別下有任何一個專案是固定支出，則整個類別的預算計入固定預算
    // 這裡我們預設使用者會把固定支出類別分開
    const hasFixedProjectInThisCategory = records.some(r => r['分類'] === rule.category && getProjectGroup(r['專案'], config) === 'fixed');
    if (hasFixedProjectInThisCategory) {
      totalFixedBudget += rule.monthlyLimit;
      fixedCategories.add(rule.category);
    }

    const effectiveLimit = Math.max(0, rule.monthlyLimit - fixedSpent);
    const remaining = effectiveLimit - dailySpent;
    const percentage = effectiveLimit > 0 ? (dailySpent / effectiveLimit) * 100 : (dailySpent > 0 ? 100 : 0);

    let status: BudgetStatus['status'] = 'safe';
    if (percentage >= 100) status = 'exceeded';
    else if (percentage >= 90) status = 'danger';
    else if (percentage >= 80) status = 'warning';

    let dailySafeSpend: number | undefined;
    if (isCurrentMonth) {
      const daysInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
      const currentDay = now.getDate();
      const remainingDays = Math.max(1, daysInMonth - currentDay + 1);

      if (remaining > 0) {
        dailySafeSpend = Math.round(remaining / remainingDays);
      } else {
        dailySafeSpend = 0;
      }
    }

    return { 
      rule: { ...rule, monthlyLimit: effectiveLimit },
      originalLimit: rule.monthlyLimit,
      spent: dailySpent, 
      remaining, 
      percentage, 
      status, 
      dailySafeSpend 
    } as any;
  });

  // 4. Build fixed project statuses
  const fixedProjectsInConfig = config.includedProjects.filter(p => getProjectGroup(p, config) === 'fixed');
  const fixedProjectStatuses: FixedProjectStatus[] = fixedProjectsInConfig.map(project => ({
    project,
    spent: Math.round(fixedProjectSpent[project] || 0),
  }));

  // 5. Calculate nextFixedExpense (待繳項目)
  let nextFixedExpense: BudgetCalculationResult['nextFixedExpense'] = undefined;
  
  if (isCurrentMonth) {
    const pendingItems: { name: string; amount: number; day: number }[] = [];
    
    fixedProjectsInConfig.forEach(project => {
      if (!paidFixedProjects.has(project)) {
        // 尋找該專案的扣款日與最近一筆金額
        // 我們從所有紀錄中尋找
        const projectRecords = records.filter(r => r['專案'] === project).sort((a, b) => {
          const dateA = a.parsedDate || new Date(0);
          const dateB = b.parsedDate || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        if (projectRecords.length > 0) {
          const lastRecord = projectRecords[0];
          const dueDay = getDueDayFromRecord(lastRecord);
          if (dueDay !== null) {
            const rawAmountStr = (lastRecord['金額'] || '').replace(/[,￥$€£]/g, '').trim();
            let lastAmount = parseFloat(rawAmountStr) || 0;
            const exchangeRate = EXCHANGE_RATES[lastRecord['幣別']] || 1;
            lastAmount = Math.abs(lastAmount * exchangeRate);
            if (config.splitProjects.includes(project)) lastAmount *= 0.5;

            pendingItems.push({
              name: project,
              amount: Math.round(lastAmount),
              day: dueDay
            });
          }
        }
      }
    });

    if (pendingItems.length > 0) {
      const today = now.getDate();
      // 排序規則：優先找今天之後最接近的；如果都過了，選日期最小的（可能是下個月或過期）
      pendingItems.sort((a, b) => {
        const diffA = a.day >= today ? a.day - today : a.day + 31 - today;
        const diffB = b.day >= today ? b.day - today : b.day + 31 - today;
        return diffA - diffB;
      });

      const next = pendingItems[0];
      nextFixedExpense = {
        name: next.name,
        amount: next.amount,
        date: `${String(targetMonthIndex + 1).padStart(2, '0')}/${String(next.day).padStart(2, '0')}`
      };
    }
  }

  // 6. Calculate daily unbudgeted spent
  const budgetedCategories = new Set(budgets.map(b => b.category));
  let dailyUnbudgetedSpent = 0;
  for (const [cat, amount] of Object.entries(dailyCategorySpent)) {
    if (!budgetedCategories.has(cat)) {
      dailyUnbudgetedSpent += amount;
    }
  }

  const totalDailyBudget = budgets.reduce((sum, b) => sum + b.monthlyLimit, 0);

  return {
    dailyStatuses: dailyStatuses.sort((a, b) => b.percentage - a.percentage),
    dailyUnbudgetedSpent: Math.round(dailyUnbudgetedSpent),
    totalDailyBudget,
    totalDailySpent: Math.round(totalDailySpent),
    fixedProjectStatuses,
    totalFixedSpent: Math.round(totalFixedSpent),
    totalFixedBudget: Math.round(totalFixedBudget),
    nextFixedExpense,
    totalSpent: Math.round(totalSpent),
  };
};
