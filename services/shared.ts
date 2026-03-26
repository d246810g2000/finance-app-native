/**
 * 共用聚合邏輯 — 避免 travel.tsx / project.tsx 重複計算
 */
import { TransformedRecord } from '../types';
import { transformRecordsForExport } from './financeService';
import { RawRecord } from '../types';
import { parseFormattedDate } from '../utils/dateUtils';

// ─── Types ───

export interface TravelProject {
    name: string;
    totalExpense: number;
    startDate: string;
    endDate: string;
    durationDays: number;
    dailyAvg: number;
    records: TransformedRecord[];
    categoryBreakdown: { category: string; amount: number }[];
    currencies: string[];
    maxSingleExpense: TransformedRecord | null;
}

export interface ProjectData {
    name: string;
    totalExpense: number;
    recordCount: number;
    avgPerRecord: number;
}

// ─── Constants ───

export const TRAVEL_PROJECT_REGEX = /^(\d{6})-/;

// ─── Aggregation ───

/**
 * 從 raw records 聚合旅遊專案清單。
 * 只取符合 YYMMDD- 格式的專案名稱，只計算支出。
 */
export function aggregateTravelProjects(rawRecords: RawRecord[]): TravelProject[] {
    const transformed = transformRecordsForExport(rawRecords);
    const projectMap: { [key: string]: TransformedRecord[] } = {};

    transformed.forEach(r => {
        if (!r['專案'] || !TRAVEL_PROJECT_REGEX.test(r['專案'])) return;
        if (r['記錄類型'] !== '支出') return;
        if (!projectMap[r['專案']]) projectMap[r['專案']] = [];
        projectMap[r['專案']].push(r);
    });

    return Object.entries(projectMap).map(([name, recs]) => {
        const totalExpense = Math.round(recs.reduce((s, r) => s + Math.abs(r['金額']), 0));
        const dates = recs.map(r => r['日期']).sort();

        // Priority: Extract start date from Project Name (YYMMDD-...)
        let startDate = dates[0] || '';
        const nameMatch = name.match(TRAVEL_PROJECT_REGEX);
        if (nameMatch && nameMatch[1]) {
            const rawDate = nameMatch[1]; // "251003"
            startDate = `20${rawDate.substring(0, 2)}/${rawDate.substring(2, 4)}/${rawDate.substring(4, 6)}`;
        }

        let endDate = dates[dates.length - 1] || '';
        if (endDate && /^\d{8}$/.test(endDate)) {
            endDate = `${endDate.substring(0, 4)}/${endDate.substring(4, 6)}/${endDate.substring(6, 8)}`;
        }

        const start = parseFormattedDate(startDate);
        const end = parseFormattedDate(endDate);

        let durationDays = 1;
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        }

        const dailyAvg = Math.round(totalExpense / durationDays);

        // Category breakdown
        const catMap: { [key: string]: number } = {};
        recs.forEach(r => {
            const cat = r['主類別'] || '其他';
            catMap[cat] = (catMap[cat] || 0) + Math.abs(r['金額']);
        });
        const categoryBreakdown = Object.entries(catMap)
            .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
            .sort((a, b) => b.amount - a.amount);

        // Currencies
        const currencySet = new Set(recs.map(r => r['幣種']).filter(Boolean));
        const currencies = Array.from(currencySet);

        // Max single expense
        const maxSingle = recs.reduce<TransformedRecord | null>(
            (max, r) => (!max || Math.abs(r['金額']) > Math.abs(max['金額'])) ? r : max, null,
        );

        return { name, totalExpense, startDate, endDate, durationDays, dailyAvg, records: recs, categoryBreakdown, currencies, maxSingleExpense: maxSingle };
    });
}
