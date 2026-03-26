
import { RawRecord, TransformedRecord, AccountsSummaryMap, TrendDataPoint, BudgetGlobalConfig } from '../types';
import { ACCOUNT_CATEGORIES, EXCHANGE_RATES, SHARED_ACCOUNTS } from '../constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import iconv from 'iconv-lite';
import { parseFormattedDate, zeroPadDate } from '../utils/dateUtils';

// 輔助函數：根據帳戶名稱獲取其類別
export const getCategoryForAccount = (accountName: string): string => {
  for (const category in ACCOUNT_CATEGORIES) {
    if (ACCOUNT_CATEGORIES[category].includes(accountName)) {
      return category;
    }
  }
  return '未分類';
};

// 輔助函數：讀取檔案內容並解碼 (支援 Web 與 Native)
export const readFileContent = async (fileObjOrUri: any, encoding: string): Promise<string> => {
  try {
    // 判斷是否在 Web 環境 (直接傳入 File object)
    if (fileObjOrUri instanceof File || (fileObjOrUri && typeof fileObjOrUri.text === 'function')) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (encoding === 'big5') {
            // Web 端的 FileReader 雖然可以 readAsText 指定編碼，但有時會失真，
            // 這裡使用 ArrayBuffer 來用 iconv-lite 解碼會比較穩定
            const buf = Buffer.from(result as ArrayBuffer);
            resolve(iconv.decode(buf, 'big5'));
          } else {
            // 若為 utf-8 或本身已經被 reader 解碼
            if (result instanceof ArrayBuffer) {
              const buf = Buffer.from(result);
              resolve(buf.toString('utf-8'));
            } else {
              resolve(result as string);
            }
          }
        };
        reader.onerror = (e) => reject(new Error('讀取檔案失敗'));

        if (encoding === 'big5') {
          reader.readAsArrayBuffer(fileObjOrUri);
        } else {
          reader.readAsText(fileObjOrUri, 'UTF-8');
        }
      });
    }

    // Native 環境，原本的處理邏輯
    const fileUri = typeof fileObjOrUri === 'string' ? fileObjOrUri : fileObjOrUri.uri;
    if (encoding === 'big5') {
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      const buf = Buffer.from(base64, 'base64');
      return iconv.decode(buf, 'big5');
    }

    const text = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8
    });
    return text;
  } catch (error: any) {
    throw new Error(`無法讀取檔案或編碼不支援 (${encoding})：${error?.message ?? ''}`);
  }
};

// 輔助函數：解析 CSV 數據，處理引號並移除多餘空白
export const parseCsvData = (csvText: string): RawRecord[] => {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length < 3) {
    throw new Error('CSV 檔案的格式不符合預期 (至少需要 3 行數據，包含標題)。');
  }

  // 處理 CSV 行的正規表達式，正確解析帶引號的欄位
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseCsvLine(lines[1]);

  const rows = lines.slice(2).map(line => {
    const values = parseCsvLine(line);
    const rowObject: { [key: string]: string | any } = {};
    headers.forEach((header, index) => {
      // 移除引號與 BOM (Byte Order Mark)
      const cleanHeader = header.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').trim();
      const cleanValue = values[index] ? values[index].replace(/^"|"$/g, '').trim() : '';
      rowObject[cleanHeader] = cleanValue;
    });

    // 兼容性映射：AndroMoney 常用 '主類別'，程式碼常用 '分類'
    if (rowObject['主類別'] && !rowObject['分類']) {
      rowObject['分類'] = rowObject['主類別'];
    }

    // Generate a simple unique ID
    rowObject.id = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    return rowObject as unknown as RawRecord;
  });

  return rows;
};

// 輔助函數：初始化帳戶數據 - 確保包含所有已定義的帳戶，不僅限於有交易的
export const initializeAccountData = (rawRecords: RawRecord[], accountFilter: string[] | null = null, excludedAccounts: string[] = []): { accountRunningBalances: { [key: string]: number }, finalAccountsSummary: AccountsSummaryMap } => {
  const accountRunningBalances: { [key: string]: number } = {};
  const finalAccountsSummary: AccountsSummaryMap = {};
  const allKnownAccountNames = new Set<string>();

  if (accountFilter) {
    accountFilter.forEach(account => allKnownAccountNames.add(account));
  } else {
    Object.values(ACCOUNT_CATEGORIES).flat().forEach(account => allKnownAccountNames.add(account));
    rawRecords.forEach(row => {
      if (row['收款(轉入)']) allKnownAccountNames.add(row['收款(轉入)']);
      if (row['付款(轉出)']) allKnownAccountNames.add(row['付款(轉出)']);
    });
  }

  allKnownAccountNames.forEach(accountName => {
    // 排除特定帳戶
    if (!excludedAccounts.includes(accountName)) {
      accountRunningBalances[accountName] = 0;
      finalAccountsSummary[accountName] = {
        income: 0,
        expenditure: 0,
        balance: 0,
        category: getCategoryForAccount(accountName)
      };
    }
  });

  return { accountRunningBalances, finalAccountsSummary };
};

// 輔助函數：篩選和排序記錄
export const filterAndSortRecords = (rawRecords: RawRecord[], startDate: Date | null = null, endDate: Date | null = null): RawRecord[] => {
  const allRecords = rawRecords
    .filter(row => {
      if (row['分類'] === 'SYSTEM') return false;
      const recordDateStr = typeof row['日期'] === 'string' ? row['日期'] : '';
      return !(recordDateStr.length < 8);
    })
    .map(row => {
      const dateStr = (row['日期'] || '').toString();
      // 使用共用工具解析日期，解決 Hermes 兼容性問題
      const date = parseFormattedDate(dateStr);

      // 兼容性補強：確保 '分類' 欄位存在
      const category = row['分類'] || row['主類別'] || '';

      return { ...row, '分類': category, parsedDate: date };
    })
    .sort((a, b) => (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0));

  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return allRecords.filter(row => row.parsedDate && !isNaN(row.parsedDate.getTime()) && row.parsedDate >= start && row.parsedDate <= end);
  } else if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return allRecords.filter(row => row.parsedDate && !isNaN(row.parsedDate.getTime()) && row.parsedDate <= end);
  } else {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return allRecords.filter(row => row.parsedDate && !isNaN(row.parsedDate.getTime()) && row.parsedDate <= today);
  }
};

// 輔助函數：更新帳戶餘額和快照
export const updateAccountBalancesAndSnapshots = (filteredRecords: RawRecord[], accountRunningBalances: { [key: string]: number }): void => {
  filteredRecords.forEach(row => {
    const amountStrRaw = row['金額'];
    const cleanedAmountStr = (amountStrRaw || '').replace(/[,￥$€£]/g, '').trim();
    let amount = parseFloat(cleanedAmountStr) || 0;

    const currency = row['幣別'];
    const exchangeRate = EXCHANGE_RATES[currency] || 1;
    if (currency && currency !== 'TWD' && EXCHANGE_RATES[currency]) {
      amount *= exchangeRate;
    }

    const incomeAccountName = row['收款(轉入)'];
    const expenseAccountName = row['付款(轉出)'];

    if (incomeAccountName && accountRunningBalances.hasOwnProperty(incomeAccountName)) {
      accountRunningBalances[incomeAccountName] += amount;
    }
    if (expenseAccountName && accountRunningBalances.hasOwnProperty(expenseAccountName)) {
      accountRunningBalances[expenseAccountName] -= amount;
    }
  });
};

export const generateTrendData = (rawRecords: RawRecord[], startDateOfPeriod: Date, endDateOfPeriod: Date, durationInDays: number, accountFilter: string[] | null = null, excludedAccounts: string[] = []) => {
  const { accountRunningBalances: initialAccountsState } = initializeAccountData(rawRecords, accountFilter, excludedAccounts);

  const sortedAllRecords = [...rawRecords]
    .filter(row => {
      if (row['分類'] === 'SYSTEM') return false;
      const recordDateStr = typeof row['日期'] === 'string' ? row['日期'] : '';
      return recordDateStr.length >= 8;
    })
    .map(row => {
      const dateStr = (row['日期'] || '').toString();
      const date = parseFormattedDate(dateStr);
      const category = row['分類'] || row['主類別'] || '';
      return { ...row, '分類': category, parsedDate: date };
    })
    .sort((a, b) => (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0));

  if (sortedAllRecords.length === 0) {
    return { trendData: [], fullDailyBalanceSnapshots: new Map<string, { [key: string]: number }>(), minDateOverall: null, maxDateOverall: null };
  }

  const fullDailyBalanceSnapshots = new Map<string, { [key: string]: number }>();
  const fullDailyIncomeExpense = new Map<string, { income: number, expense: number }>();

  const currentOverallBalances: { [key: string]: number } = JSON.parse(JSON.stringify(initialAccountsState));

  const minDateOverall = sortedAllRecords[0].parsedDate!;
  const maxDateOverall = sortedAllRecords[sortedAllRecords.length - 1].parsedDate!;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const finalDateForSnapshots = maxDateOverall.getTime() > today.getTime() ? maxDateOverall : today;

  let dailyCursor = new Date(minDateOverall);
  dailyCursor.setHours(0, 0, 0, 0);
  let recordIndex = 0;
  while (dailyCursor.getTime() <= finalDateForSnapshots.getTime()) {
    const dateKey = dailyCursor.toISOString().split('T')[0];
    let dayIncome = 0;
    let dayExpense = 0;

    if (dailyCursor.getTime() <= maxDateOverall.getTime()) {
      while (recordIndex < sortedAllRecords.length && sortedAllRecords[recordIndex].parsedDate!.getTime() === dailyCursor.getTime()) {
        const row = sortedAllRecords[recordIndex];
        const amount = Math.round(parseFloat((row['金額'] || '').replace(/[,￥$€£]/g, '').trim()) * (EXCHANGE_RATES[row['幣別']] || 1));

        const isIncomeAccountInFilter = row['收款(轉入)'] && currentOverallBalances.hasOwnProperty(row['收款(轉入)']);
        const isExpenseAccountInFilter = row['付款(轉出)'] && currentOverallBalances.hasOwnProperty(row['付款(轉出)']);

        // Balance updates must include ALL transactions to be accurate
        if (isIncomeAccountInFilter) {
          currentOverallBalances[row['收款(轉入)']] += amount;
        }
        if (isExpenseAccountInFilter) {
          currentOverallBalances[row['付款(轉出)']] -= amount;
        }

        // Stats filtering: Determine what counts as "Income" or "Expense" for the chart
        let isIncome = isIncomeAccountInFilter && !isExpenseAccountInFilter;
        let isExpense = isExpenseAccountInFilter && !isIncomeAccountInFilter;

        // Reset income/expense determination if cross-account transfers
        if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) {
          isIncome = false;
          isExpense = false;
        } else if (row['分類'] === '轉帳') {
          // Exclude transfers, unless it is '小伊轉帳' coming in as income
          if (!(row['子分類'] === '小伊轉帳' && isIncome)) {
            isIncome = false;
            isExpense = false;
          }
        }

        if (isIncome) dayIncome += amount;
        else if (isExpense) dayExpense += amount;

        recordIndex++;
      }
    }

    fullDailyBalanceSnapshots.set(dateKey, { ...currentOverallBalances });
    fullDailyIncomeExpense.set(dateKey, { income: dayIncome, expense: dayExpense });
    dailyCursor.setDate(dailyCursor.getDate() + 1);
  }

  const trendData: TrendDataPoint[] = [];
  const isDailyView = durationInDays < 89;
  let chartCursor = new Date(startDateOfPeriod);
  chartCursor.setHours(0, 0, 0, 0);

  let prevDayForChartStart = new Date(startDateOfPeriod.getTime() - (1000 * 60 * 60 * 24));
  const prevDayKeyForChartStart = prevDayForChartStart.toISOString().split('T')[0];
  const initialSnapshot = fullDailyBalanceSnapshots.get(prevDayKeyForChartStart);
  let currentRenderTotalBalance = initialSnapshot ? Object.values(initialSnapshot).reduce((s: number, v: number) => s + v, 0) : 0;

  while (chartCursor.getTime() <= endDateOfPeriod.getTime()) {
    const dateKeyDaily = chartCursor.toISOString().split('T')[0];
    let incomeForPeriod = 0;
    let expenseForPeriod = 0;
    let balanceForPoint = currentRenderTotalBalance;

    if (isDailyView) {
      const dailyAgg = fullDailyIncomeExpense.get(dateKeyDaily);
      if (dailyAgg) {
        incomeForPeriod = dailyAgg.income;
        expenseForPeriod = dailyAgg.expense;
      }
      if (fullDailyBalanceSnapshots.has(dateKeyDaily)) {
        balanceForPoint = Object.values(fullDailyBalanceSnapshots.get(dateKeyDaily)!).reduce((s: number, v: number) => s + v, 0);
      }
    } else {
      let tempMonthIncome = 0;
      let tempMonthExpense = 0;
      let lastSnapshotForMonth: { [key: string]: number } | null = null;
      let monthDayCursor = new Date(chartCursor.getFullYear(), chartCursor.getMonth(), 1);
      let actualMonthEndDate = new Date(chartCursor.getFullYear(), chartCursor.getMonth() + 1, 0);
      if (actualMonthEndDate.getTime() > endDateOfPeriod.getTime()) actualMonthEndDate = new Date(endDateOfPeriod);

      while (monthDayCursor.getTime() <= actualMonthEndDate.getTime()) {
        const dailyKey = monthDayCursor.toISOString().split('T')[0];
        const dailyAgg = fullDailyIncomeExpense.get(dailyKey);
        if (dailyAgg) {
          tempMonthIncome += dailyAgg.income;
          tempMonthExpense += dailyAgg.expense;
        }
        if (fullDailyBalanceSnapshots.has(dailyKey)) lastSnapshotForMonth = fullDailyBalanceSnapshots.get(dailyKey)!;
        monthDayCursor.setDate(monthDayCursor.getDate() + 1);
      }
      incomeForPeriod = tempMonthIncome;
      expenseForPeriod = tempMonthExpense;
      if (lastSnapshotForMonth) {
        balanceForPoint = Object.values(lastSnapshotForMonth).reduce((s: number, v: number) => s + v, 0);
      }
    }

    currentRenderTotalBalance = balanceForPoint;

    trendData.push({
      date: new Date(chartCursor),
      income: Math.round(incomeForPeriod),
      expense: Math.round(expenseForPeriod),
      balance: Math.round(balanceForPoint)
    });

    if (isDailyView) {
      chartCursor.setDate(chartCursor.getDate() + 1);
    } else {
      chartCursor.setMonth(chartCursor.getMonth() + 1);
      chartCursor.setDate(1);
    }
  }

  return { trendData, fullDailyBalanceSnapshots, minDateOverall, maxDateOverall: finalDateForSnapshots };
};

export const processAndAggregateRecords = (rawRecords: RawRecord[], chartStartDate: Date | null, chartEndDate: Date | null, accountFilter: string[] | null = null, excludedAccounts: string[] = []) => {
  if (!chartStartDate || !chartEndDate) {
    return { aggregatedSummary: {}, dailyTrend: [], periodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 }, previousPeriodSummary: { totalBalance: 0, totalIncome: 0, totalExpense: 0 } };
  }

  const { accountRunningBalances: initialAllAccountsState } = initializeAccountData(rawRecords, accountFilter, excludedAccounts);
  let currentAccumulatedBalancesForSummary = { ...initialAllAccountsState };
  const recordsUpToChartEndDate = filterAndSortRecords(rawRecords, null, chartEndDate);
  updateAccountBalancesAndSnapshots(recordsUpToChartEndDate, currentAccumulatedBalancesForSummary);

  const finalAccountsSummary: AccountsSummaryMap = {};
  Object.keys(currentAccumulatedBalancesForSummary).forEach(accName => {
    finalAccountsSummary[accName] = {
      income: 0,
      expenditure: 0,
      balance: Math.round(currentAccumulatedBalancesForSummary[accName]),
      category: getCategoryForAccount(accName)
    };
  });

  const durationInDays = Math.ceil(Math.abs(chartEndDate.getTime() - chartStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const { trendData: dailyTrend, fullDailyBalanceSnapshots } = generateTrendData(rawRecords, chartStartDate, chartEndDate, durationInDays, accountFilter, excludedAccounts);

  let periodSummary = { totalBalance: 0, totalIncome: 0, totalExpense: 0 };
  const chartEndDateKey = new Date(chartEndDate).toISOString().split('T')[0];
  if (fullDailyBalanceSnapshots.has(chartEndDateKey)) {
    periodSummary.totalBalance = Math.round(Object.values(fullDailyBalanceSnapshots.get(chartEndDateKey)!).reduce((s: number, v: number) => s + v, 0));
  }

  const recordsInCurrentChartPeriod = filterAndSortRecords(rawRecords, chartStartDate, chartEndDate);
  recordsInCurrentChartPeriod.forEach(row => {
    let amount = Math.round(parseFloat((row['金額'] || '').replace(/[,￥$€£]/g, '').trim()) * (EXCHANGE_RATES[row['幣別']] || 1));
    const isIncomeAccountInFilter = row['收款(轉入)'] && currentAccumulatedBalancesForSummary.hasOwnProperty(row['收款(轉入)']) && (!accountFilter || accountFilter.includes(row['收款(轉入)']));
    const isExpenseAccountInFilter = row['付款(轉出)'] && currentAccumulatedBalancesForSummary.hasOwnProperty(row['付款(轉出)']) && (!accountFilter || accountFilter.includes(row['付款(轉出)']));

    let isIncome = isIncomeAccountInFilter && !isExpenseAccountInFilter;
    let isExpense = isExpenseAccountInFilter && !isIncomeAccountInFilter;

    if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) {
      isIncome = false;
      isExpense = false;
    } else if (row['分類'] === '轉帳') {
      if (!(row['子分類'] === '小伊轉帳' && isIncome)) {
        isIncome = false;
        isExpense = false;
      }
    }

    if (isIncome) periodSummary.totalIncome += amount;
    else if (isExpense) periodSummary.totalExpense += amount;
  });

  let previousPeriodSummary = { totalBalance: 0, totalIncome: 0, totalExpense: 0 };
  const ONE_DAY_MS = 1000 * 60 * 60 * 24;
  const durationMs = durationInDays * ONE_DAY_MS;
  const prevEndDate = new Date(chartStartDate.getTime() - ONE_DAY_MS);
  const prevStartDate = new Date(prevEndDate.getTime() - durationMs + ONE_DAY_MS);
  const prevEndDateKey = new Date(prevEndDate).toISOString().split('T')[0];
  if (fullDailyBalanceSnapshots.has(prevEndDateKey)) {
    previousPeriodSummary.totalBalance = Math.round(Object.values(fullDailyBalanceSnapshots.get(prevEndDateKey)!).reduce((s: number, v: number) => s + v, 0));
  }
  const recordsInPrevChartPeriod = filterAndSortRecords(rawRecords, prevStartDate, prevEndDate);
  recordsInPrevChartPeriod.forEach(row => {
    let amount = Math.round(parseFloat((row['金額'] || '').replace(/[,￥$€£]/g, '').trim()) * (EXCHANGE_RATES[row['幣別']] || 1));
    const isIncomeAccountInFilter = row['收款(轉入)'] && currentAccumulatedBalancesForSummary.hasOwnProperty(row['收款(轉入)']) && (!accountFilter || accountFilter.includes(row['收款(轉入)']));
    const isExpenseAccountInFilter = row['付款(轉出)'] && currentAccumulatedBalancesForSummary.hasOwnProperty(row['付款(轉出)']) && (!accountFilter || accountFilter.includes(row['付款(轉出)']));

    let isIncome = isIncomeAccountInFilter && !isExpenseAccountInFilter;
    let isExpense = isExpenseAccountInFilter && !isIncomeAccountInFilter;

    if (row['分類'] === '代付' || (row['分類'] === '其他' && row['子分類'] === '代付')) {
      isIncome = false;
      isExpense = false;
    } else if (row['分類'] === '轉帳') {
      if (!(row['子分類'] === '小伊轉帳' && isIncome)) {
        isIncome = false;
        isExpense = false;
      }
    }

    if (isIncome) previousPeriodSummary.totalIncome += amount;
    else if (isExpense) previousPeriodSummary.totalExpense += amount;
  });

  return { aggregatedSummary: finalAccountsSummary, dailyTrend, periodSummary, previousPeriodSummary };
};

export const formatProductDetailLine = (line: string): string => {
  const regex = /(.*?)(?:\[NT\$(\d+\.?\d*)\])?\s*x\s*(\d+\.?\d*)/;
  const match = line.match(regex);
  if (match) {
    const itemName = match[1].trim();
    const price = parseFloat(match[2]) || 0;
    const quantity = parseFloat(match[3]) || 0;
    const total = Math.round(price * quantity);
    return `${itemName} ($${Math.round(price)}) ✕ ${quantity} ＝ $${total}`;
  }
  return line.trim();
};

// NEW HELPER FUNCTION: Extracts merchant name from notes if available, otherwise returns raw field
export const extractMerchantName = (record: RawRecord): string => {
  const finalMerchant = record['商家(公司)'];
  const originalNotes = record['備註'] || '';

  // 1. Explicit merchant field (Highest priority)
  if (finalMerchant && finalMerchant.trim() !== '') {
    return finalMerchant.trim();
  }

  // 2. "商家:" in Notes
  if (originalNotes.includes('商家:')) {
    const noteLines = originalNotes.replace(/\\n|\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l);
    for (const line of noteLines) {
      if (line.startsWith('商家:')) {
        return line.substring('商家:'.length).trim();
      }
    }
  }

  // 3. Enhanced Extraction Logic from Notes (Payment Gateways, etc.)
  if (originalNotes.trim()) {
    let note = originalNotes.trim();

    // Strategy A: Check for Payment Gateway prefixes
    // Matches "Line Pay - Merchant", "街口 - Merchant", etc.
    const paymentPrefixes = ['Line Pay', '街口', '台灣Pay', '悠遊付', '全支付', 'Uber Eats', 'Foodpanda', 'Uber'];
    for (const prefix of paymentPrefixes) {
      // Regex looks for Prefix followed by optional separators like " - ", ":", " "
      // e.g., "Line Pay - 7-ELEVEN"
      const regex = new RegExp(`^${prefix}[\\s-]*[:：\\-]?\\s*(.*)`, 'i');
      const match = note.match(regex);

      // If matched and the remainder isn't empty
      if (match && match[1] && match[1].trim().length > 0) {
        const extractedName = match[1].trim();
        return `${extractedName} (${prefix})`;
      }
    }

    // Strategy B: Use note as merchant if it's short and text-like (e.g. "午餐", "計程車")
    // Avoid using long sentences or purely numeric IDs
    const cleanNote = note.split(/\n|\\n/)[0].trim();
    const isNumeric = /^\d+$/.test(cleanNote);

    if (cleanNote.length > 0 && cleanNote.length < 20 && !isNumeric) {
      return cleanNote;
    }

    // Strategy C: If it's a bit longer but starts with typical merchant names, we might consider truncating
    if (cleanNote.length >= 20 && cleanNote.length <= 40) {
      return cleanNote;
    }
  }

  // 4. Fallback: Category - SubCategory
  const category = record['分類'] || record['主類別'];
  const subCategory = record['子分類'];
  if (category && category !== 'SYSTEM' && category.trim() !== '') {
    if (subCategory && subCategory.trim() !== '') {
      return `${category}-${subCategory}`;
    }
    return category;
  }

  return '';
};

export const transformRecord = (record: RawRecord): TransformedRecord[] | TransformedRecord | null => {
  if (record['分類'] === 'SYSTEM') return null;

  let amount = Math.round(parseFloat((record['金額'] || '').replace(/[,￥$€£]/g, '').trim()) * (EXCHANGE_RATES[record['幣別']] || 1));
  const incomeAccountName = record['收款(轉入)'];
  const expenseAccountName = record['付款(轉出)'];
  const originalDate = record['日期'] || '';
  const originalTimeStr = record['時間'] || '';
  const formattedTime = originalTimeStr.length >= 4 ? `${originalTimeStr.substring(0, 2)}:${originalTimeStr.substring(2, 4)}` : '09:00';
  const originalNotes = record['備註'];

  // Use the shared extraction logic
  const finalMerchant = extractMerchantName(record);

  let productDetailsRawLines: string[] = [];
  let otherNotesLines: string[] = [];

  const invoicePatternDetected = originalNotes && originalNotes.includes('發票號碼:');
  if (invoicePatternDetected) {
    const noteLines = originalNotes.replace(/\\n|\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l);
    let parsingProductDetails = false;
    noteLines.forEach(line => {
      // "商家:" line is handled by extractMerchantName, but we parse here to separate product details
      if (line.startsWith('商家:')) {
        parsingProductDetails = true;
      } else if (parsingProductDetails && !line.startsWith('發票號碼:')) {
        productDetailsRawLines.push(line);
      } else if (!line.startsWith('發票號碼:')) {
        otherNotesLines.push(line);
      }
    });
  } else if (originalNotes) {
    otherNotesLines.push(originalNotes);
  }

  const formattedProductDetails = productDetailsRawLines.map(item => `◎ ${formatProductDetailLine(item)}`).join(' ');
  let finalDescriptionContent = otherNotesLines.filter(Boolean).join('\n').trim();
  if (formattedProductDetails) {
    finalDescriptionContent = finalDescriptionContent ? `${finalDescriptionContent}\n${formattedProductDetails}` : formattedProductDetails;
  }

  const formattedDate = zeroPadDate(originalDate);
  let recordType: TransformedRecord['記錄類型'] = '未知';
  if (incomeAccountName && !expenseAccountName) recordType = '收入';
  else if (expenseAccountName && !incomeAccountName) recordType = '支出';
  else if (incomeAccountName && expenseAccountName) recordType = '轉帳';

  const baseExportRecord: Omit<TransformedRecord, '帳戶' | '記錄類型' | '金額'> = {
    id: record.id,
    '幣種': 'TWD', '主類別': record['分類'] || record['主類別'] || '', '子類別': record['子分類'],
    '手續費': 0, '折扣': 0, '名稱': '', '商家': finalMerchant ? finalMerchant.substring(0, 30) : '',
    '日期': formattedDate, '時間': formattedTime, '專案': record['專案'], '描述': finalDescriptionContent,
    '標籤': '', '對象': '',
  };

  if (recordType === '收入') return { ...baseExportRecord, '帳戶': incomeAccountName, '記錄類型': '收入', '金額': Math.abs(amount) };
  if (recordType === '支出') return { ...baseExportRecord, '帳戶': expenseAccountName, '記錄類型': '支出', '金額': -Math.abs(amount) };
  if (recordType === '轉帳') {
    return [
      { ...baseExportRecord, id: `${record.id}-out`, '帳戶': expenseAccountName, '記錄類型': '轉出', '主類別': '轉帳', '子類別': '轉帳', '金額': -Math.abs(amount) },
      { ...baseExportRecord, id: `${record.id}-in`, '帳戶': incomeAccountName, '記錄類型': '轉入', '主類別': '轉帳', '子類別': '轉帳', '金額': Math.abs(amount) },
    ];
  }
  return null;
};

export const transformRecordsForExport = (rawRecords: RawRecord[]): TransformedRecord[] => {
  return rawRecords.flatMap(record => {
    const transformed = transformRecord(record);
    return transformed ? (Array.isArray(transformed) ? transformed : [transformed]) : [];
  });
};

export const generateAndDownloadCsv = async (data: RawRecord[]): Promise<void> => {
  const exportColumnNames: (keyof TransformedRecord)[] = [
    '帳戶', '幣種', '記錄類型', '主類別', '子類別', '金額', '手續費', '折扣', '名稱', '商家', '日期', '時間', '專案', '描述', '標籤', '對象'
  ];
  let csvContent = exportColumnNames.join(',') + '\n';
  const transformedRecords = transformRecordsForExport(data);
  const csvDataRows = transformedRecords.map(row => {
    return exportColumnNames.map(header => {
      let value = row[header];
      if (value === undefined || value === null) value = '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  csvContent += csvDataRows.join('\n');

  try {
    const fileName = `exported_records_${new Date().getTime()}.csv`;
    const fileUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + fileName;

    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: 'utf8'
    });

    // Check availability and share
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: '匯出財務記錄'
      });
    } else {
      alert('此裝置不支援分享功能');
    }
  } catch (error) {
    console.error('Export error:', error);
    alert('匯出失敗');
  }
};

// Generates a concise summary string of the entire dataset for AI context
export const generateFinancialContext = (rawRecords: RawRecord[]): string => {
  if (rawRecords.length === 0) return "無數據";

  const transformed = transformRecordsForExport(rawRecords);
  let totalIncome = 0;
  let totalExpense = 0;
  const categoryExpenses: { [key: string]: number } = {};
  const merchantExpenses: { [key: string]: number } = {};
  const monthlyStats: { [key: string]: { income: number; expense: number } } = {};
  let minDate = '9999/99/99';
  let maxDate = '0000/00/00';

  transformed.forEach(r => {
    if (r['日期'] < minDate) minDate = r['日期'];
    if (r['日期'] > maxDate) maxDate = r['日期'];

    // Monthly Aggregation
    const monthKey = r['日期'].substring(0, 7); // YYYY/MM
    if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { income: 0, expense: 0 };

    if (r['記錄類型'] === '收入') {
      totalIncome += r['金額'];
      monthlyStats[monthKey].income += r['金額'];
    } else if (r['記錄類型'] === '支出') {
      const absAmount = Math.abs(r['金額']);
      totalExpense += absAmount;
      monthlyStats[monthKey].expense += absAmount;

      // Category Aggregation
      const cat = r['主類別'];
      categoryExpenses[cat] = (categoryExpenses[cat] || 0) + absAmount;

      // Merchant Aggregation
      const merch = r['商家'] || '未分類';
      merchantExpenses[merch] = (merchantExpenses[merch] || 0) + absAmount;
    }
  });

  const topCategories = Object.entries(categoryExpenses)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k, v]) => `${k}: $${Math.round(v)}`)
    .join(', ');

  const topMerchants = Object.entries(merchantExpenses)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k, v]) => `${k}: $${Math.round(v)}`)
    .join(', ');

  // Summarize last 6 months specifically
  const sortedMonths = Object.keys(monthlyStats).sort().slice(-6);
  const recentMonthsTrend = sortedMonths.map(m =>
    `${m} (收: $${Math.round(monthlyStats[m].income)}, 支: $${Math.round(monthlyStats[m].expense)})`
  ).join('\n');

  return `
    資料區間: ${minDate} 至 ${maxDate}
    總收入: $${Math.round(totalIncome)}
    總支出: $${Math.round(totalExpense)}
    淨資產變動: $${Math.round(totalIncome - totalExpense)}
    
    前五大支出類別:
    ${topCategories}
    
    前五大消費商家:
    ${topMerchants}
    
    近六個月收支趨勢:
    ${recentMonthsTrend}
  `;
};

// Calculate average monthly spending for a specific category over the last 3 complete months
export const getCategoryAverage = (
  records: RawRecord[],
  category: string,
  config: BudgetGlobalConfig
): number => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11

  // Start date: 1st day of 3 months ago
  // End date: Last day of previous month
  const endDate = new Date(currentYear, currentMonth, 0); // Last day of prev month
  const startDate = new Date(currentYear, currentMonth - 3, 1); // 1st day of 3 months ago

  let totalAmount = 0;

  // Convert Date to YYYYMMDD string for comparison
  const toYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  const startYMD = toYMD(startDate);
  const endYMD = toYMD(endDate);

  records.forEach(r => {
    // Date Check
    if (!r['日期'] || r['日期'] < startYMD || r['日期'] > endYMD) return;

    // Category Check
    if (r['分類'] !== category) return;

    // Expense Check
    if (!r['付款(轉出)'] || r['收款(轉入)'] || r['分類'] === 'SYSTEM' || r['分類'] === '代付' || (r['分類'] === '其他' && r['子分類'] === '代付')) return;

    // Project Check
    const project = r['專案'];
    // Filter Logic: Must be in includedProjects
    if (!config.includedProjects.includes(project || '')) return;

    // Amount
    const rawAmount = parseFloat((r['金額'] || '').replace(/[,￥$€£]/g, '').trim()) || 0;
    let amount = Math.abs(rawAmount);

    const currency = r['幣別'];
    if (EXCHANGE_RATES[currency]) {
      amount *= EXCHANGE_RATES[currency];
    }

    // Split Logic
    if (config.splitProjects.includes(project || '') || SHARED_ACCOUNTS.includes(r['付款(轉出)'])) {
      amount *= 0.5;
    }

    totalAmount += amount;
  });

  return Math.round(totalAmount / 3);
};
