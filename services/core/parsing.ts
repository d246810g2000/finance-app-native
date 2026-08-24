import { EXCHANGE_RATES } from '../../constants';
import { parseFormattedDate } from '../../utils/dateUtils';
import type { RawRecord } from '../../types';

const CURRENCY_SYMBOLS = /[,￥$€£]/g;

export const parseAmount = (value: RawRecord['金額'] | number | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').replace(CURRENCY_SYMBOLS, '').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getExchangeRate = (currency: RawRecord['幣別']): number => {
  const rate = EXCHANGE_RATES[String(currency ?? '')];
  return rate ?? 1;
};

export const convertAmountToTwd = (
  value: RawRecord['金額'] | number | null | undefined,
  currency: RawRecord['幣別'],
): number => parseAmount(value) * getExchangeRate(currency);

export const normalizeDate = (value: unknown): Date => parseFormattedDate(String(value ?? ''));
export const isValidDate = (value: Date | null | undefined): value is Date =>
  Boolean(value && !Number.isNaN(value.getTime()));

export const getDateKey = (value: Date): string => [
  value.getFullYear(),
  String(value.getMonth() + 1).padStart(2, '0'),
  String(value.getDate()).padStart(2, '0'),
].join('-');

export const getYmdKey = (value: Date): string => getDateKey(value).replaceAll('-', '');

export const startOfDay = (value: Date): Date => new Date(
  value.getFullYear(),
  value.getMonth(),
  value.getDate(),
);

export const endOfDay = (value: Date): Date => new Date(
  value.getFullYear(),
  value.getMonth(),
  value.getDate(),
  23,
  59,
  59,
  999,
);

export const formatTime = (value: RawRecord['時間']): string => {
  const text = String(value ?? '');
  return text.length >= 4 ? `${text.slice(0, 2)}:${text.slice(2, 4)}` : '09:00';
};

export const normalizeNoteLines = (notes: string): string[] => {
  if (!notes) return [];
  return notes
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\s+n\s+/gi, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
};
