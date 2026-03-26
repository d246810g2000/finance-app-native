/**
 * 共用日期工具函數
 * 解決 Hermes / React Native 上 `new Date('YYYY/M/D')` 不可靠的問題
 */

/**
 * 解析 'YYYY/M/D' 或 'YYYY/MM/DD' 格式的日期字串
 * 避免使用 new Date(string) 的跨平台不一致問題
 */
export function parseFormattedDate(dateStr: string): Date {
    if (!dateStr || typeof dateStr !== 'string') return new Date(NaN);

    // 處理 YYYY/MM/DD 或 YYYY-MM-DD
    let parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');

    if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1; // 0-indexed
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            return new Date(y, m, d);
        }
    }

    // 處理 YYYYMMDD
    if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
        const y = parseInt(dateStr.substring(0, 4), 10);
        const m = parseInt(dateStr.substring(4, 6), 10) - 1;
        const d = parseInt(dateStr.substring(6, 8), 10);
        return new Date(y, m, d);
    }

    return new Date(NaN);
}

/**
 * 將 'YYYY/M/D' 格式 zero-pad 成 'YYYY/MM/DD'，方便字串排序
 */
export function zeroPadDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}/${m}/${d}`;
}

/**
 * 取得該日期的週起始日 (週日為第一天)
 */
export function getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

export function getEndOfWeek(date: Date): Date {
    const start = getStartOfWeek(date);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

export function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

export function addWeeks(date: Date, weeks: number): Date {
    return addDays(date, weeks * 7);
}

export function addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

export function addYears(date: Date, years: number): Date {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + years);
    return d;
}

