import * as FileSystem from 'expo-file-system/legacy';
import { CreditCardSettings, CreditCardSettingsMap } from '../types';

const FILE_NAME = 'credit_card_settings.json';
const FILE_URI = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + FILE_NAME;

export const DEFAULT_STATEMENT_DAY = 15;

export const clampStatementDay = (day: number): number => {
  if (!Number.isFinite(day)) return DEFAULT_STATEMENT_DAY;
  return Math.min(28, Math.max(1, Math.round(day)));
};

export const getSettingsForCard = (
  map: CreditCardSettingsMap,
  accountName: string
): CreditCardSettings => {
  const existing = map[accountName];
  if (!existing) {
    return { statementDay: DEFAULT_STATEMENT_DAY };
  }
  return {
    statementDay: clampStatementDay(existing.statementDay ?? DEFAULT_STATEMENT_DAY),
    statementGroup: existing.statementGroup?.trim() || undefined,
  };
};

/** 取得與指定卡片共用同一張銀行帳單的所有卡片。未設群組時只回傳自己。 */
export const getStatementGroupCards = (
  map: CreditCardSettingsMap,
  accountName: string,
  knownCards: string[] = []
): string[] => {
  const group = getSettingsForCard(map, accountName).statementGroup;
  if (!group) return [accountName];

  const candidates = Array.from(new Set([...Object.keys(map), ...knownCards, accountName]));
  const members = candidates.filter(
    name => getSettingsForCard(map, name).statementGroup === group
  );
  return Array.from(new Set(members.length ? members : [accountName]));
};

export const getCardsInGroup = (
  map: CreditCardSettingsMap,
  groupName: string,
  knownCards: string[] = []
): string[] => {
  const group = groupName.trim();
  if (!group) return [];
  const candidates = Array.from(new Set([...Object.keys(map), ...knownCards]));
  return candidates
    .filter(name => getSettingsForCard(map, name).statementGroup === group)
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
};

export const getStatementGroupNames = (map: CreditCardSettingsMap): string[] =>
  Array.from(
    new Set(
      Object.values(map)
        .map(settings => settings.statementGroup?.trim())
        .filter((group): group is string => !!group)
    )
  ).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

/** 群組應共用同一結帳日；若成員不一致，回傳代表日 + inconsistent */
export const getGroupStatementDay = (
  map: CreditCardSettingsMap,
  cardNames: string[]
): { statementDay: number; inconsistent: boolean; days: number[] } => {
  const days = cardNames.map(name => getSettingsForCard(map, name).statementDay);
  if (!days.length) {
    return { statementDay: DEFAULT_STATEMENT_DAY, inconsistent: false, days: [] };
  }
  const unique = Array.from(new Set(days));
  return {
    statementDay: days[0],
    inconsistent: unique.length > 1,
    days: unique,
  };
};

/** 將多張卡設為同一群組與同一結帳日 */
export const applyStatementGroup = (
  map: CreditCardSettingsMap,
  members: string[],
  groupName: string,
  statementDay: number,
  previousGroup?: string
): CreditCardSettingsMap => {
  const next = { ...map };
  const trimmedGroup = groupName.trim();
  const day = clampStatementDay(statementDay);
  const memberSet = new Set(members);

  const allKnown = Array.from(new Set([
    ...Object.keys(map),
    ...members,
  ]));

  allKnown.forEach(card => {
    const settings = getSettingsForCard(next, card);
    if (memberSet.has(card)) {
      next[card] = {
        statementDay: day,
        statementGroup: trimmedGroup || undefined,
      };
    } else if (previousGroup && settings.statementGroup === previousGroup) {
      next[card] = {
        ...settings,
        statementGroup: undefined,
      };
    }
  });

  return next;
};

export const clearStatementGroup = (
  map: CreditCardSettingsMap,
  groupName: string,
  knownCards: string[] = []
): CreditCardSettingsMap => {
  const next = { ...map };
  getCardsInGroup(map, groupName, knownCards).forEach(card => {
    next[card] = {
      ...getSettingsForCard(next, card),
      statementGroup: undefined,
    };
  });
  return next;
};

export const loadCreditCardSettings = async (): Promise<CreditCardSettingsMap> => {
  try {
    const info = await FileSystem.getInfoAsync(FILE_URI);
    if (!info.exists) return {};
    const content = await FileSystem.readAsStringAsync(FILE_URI);
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.error('Failed to load credit card settings', e);
    return {};
  }
};

export const saveCreditCardSettings = async (settings: CreditCardSettingsMap): Promise<void> => {
  try {
    await FileSystem.writeAsStringAsync(FILE_URI, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save credit card settings', e);
  }
};
