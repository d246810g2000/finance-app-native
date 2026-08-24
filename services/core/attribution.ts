import {
  ACCOUNT_CATEGORIES,
  PERSONAL_ACCOUNTS,
  SHARED_ACCOUNTS,
} from '../../constants';
import type { CustomAccountMappings, RawRecord } from '../../types';

export interface AttributionOptions {
  splitProjects?: string[] | null;
  isSplitShared?: boolean;
  customMappings?: CustomAccountMappings;
}

export const UNMAPPED_ACCOUNT_CATEGORY = '未分類';

export const getCategoryForAccount = (
  accountName: string,
  customMappings: CustomAccountMappings = {},
): string => customMappings[accountName]?.category ?? findStaticCategory(accountName);

function findStaticCategory(accountName: string): string {
  for (const category of Object.keys(ACCOUNT_CATEGORIES)) {
    if (ACCOUNT_CATEGORIES[category].includes(accountName)) return category;
  }
  return UNMAPPED_ACCOUNT_CATEGORY;
}

export const isSharedAccountName = (
  accountName: string | undefined | null,
  customMappings: CustomAccountMappings = {},
): boolean => {
  if (!accountName) return false;
  const mapping = customMappings[accountName];
  if (mapping?.type === 'shared') return true;
  if (mapping?.type === 'personal') return false;
  return SHARED_ACCOUNTS.includes(accountName);
};

/**
 * Project splitting takes precedence over account splitting. The factor is applied
 * once so a shared project paid from a shared account never becomes 25%.
 */
export const resolveExpenseSplitFactor = (
  project: string | undefined,
  payAccount: string | undefined,
  options: AttributionOptions = {},
): number => {
  if (project && options.splitProjects?.includes(project)) return 0.5;
  if (
    options.isSplitShared &&
    payAccount &&
    isSharedAccountName(payAccount, options.customMappings)
  ) {
    return 0.5;
  }
  return 1;
};

export const isSystemRecord = (record: RawRecord): boolean =>
  record['分類'] === 'SYSTEM' || record['主類別'] === 'SYSTEM';

export const isPaidOnBehalfRecord = (record: RawRecord): boolean =>
  record['分類'] === '代付' ||
  (record['分類'] === '其他' && record['子分類'] === '代付');

export const isTransferRecord = (record: RawRecord): boolean =>
  record['分類'] === '轉帳' ||
  Boolean(record['收款(轉入)'] && record['付款(轉出)']);

export const findUnmappedAccounts = (
  rawRecords: RawRecord[],
  customMappings: CustomAccountMappings = {},
): string[] => {
  const accounts = new Set<string>();
  for (const record of rawRecords) {
    if (record['收款(轉入)']) accounts.add(String(record['收款(轉入)']).trim());
    if (record['付款(轉出)']) accounts.add(String(record['付款(轉出)']).trim());
  }
  accounts.delete('');
  accounts.delete('代付');
  accounts.delete('轉帳');

  return Array.from(accounts).filter(accountName => (
    !PERSONAL_ACCOUNTS.includes(accountName) &&
    !SHARED_ACCOUNTS.includes(accountName) &&
    !customMappings[accountName]
  ));
};
