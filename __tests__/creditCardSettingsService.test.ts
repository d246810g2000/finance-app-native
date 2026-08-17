import {
  getSettingsForCard,
  getStatementGroupCards,
  getStatementGroupNames,
  getGroupStatementDay,
  applyStatementGroup,
  clearStatementGroup,
} from '../services/creditCardSettingsService';
import { CreditCardSettingsMap } from '../types';

describe('creditCardSettingsService statement groups', () => {
  const settings: CreditCardSettingsMap = {
    '玉山 Unicard': { statementDay: 15, statementGroup: '玉山銀行帳單' },
    '共享玉山 Unicard': { statementDay: 15, statementGroup: '玉山銀行帳單' },
    '玉山 UBear': { statementDay: 15, statementGroup: '玉山銀行帳單' },
    '台新卡': { statementDay: 8, statementGroup: '台新銀行帳單' },
  };

  it('returns all cards in the same statement group', () => {
    expect(getStatementGroupCards(settings, '玉山 Unicard')).toEqual([
      '玉山 Unicard',
      '共享玉山 Unicard',
      '玉山 UBear',
    ]);
  });

  it('keeps an ungrouped card isolated', () => {
    expect(getStatementGroupCards(settings, '未設定卡')).toEqual(['未設定卡']);
    expect(getSettingsForCard(settings, '未設定卡').statementDay).toBe(15);
  });

  it('lists reusable group names', () => {
    expect(getStatementGroupNames(settings)).toEqual([
      '台新銀行帳單',
      '玉山銀行帳單',
    ]);
  });

  it('detects inconsistent group statement days', () => {
    const messy: CreditCardSettingsMap = {
      A: { statementDay: 15, statementGroup: 'G' },
      B: { statementDay: 20, statementGroup: 'G' },
    };
    expect(getGroupStatementDay(messy, ['A', 'B'])).toEqual({
      statementDay: 15,
      inconsistent: true,
      days: [15, 20],
    });
  });

  it('applies shared group day to all members', () => {
    const next = applyStatementGroup(
      {},
      ['玉山 Unicard', '玉山 UBear'],
      '玉山銀行帳單',
      18
    );
    expect(next['玉山 Unicard']).toEqual({
      statementDay: 18,
      statementGroup: '玉山銀行帳單',
    });
    expect(next['玉山 UBear']).toEqual({
      statementDay: 18,
      statementGroup: '玉山銀行帳單',
    });
  });

  it('clears a statement group without deleting cards', () => {
    const next = clearStatementGroup(settings, '玉山銀行帳單');
    expect(next['玉山 Unicard'].statementGroup).toBeUndefined();
    expect(next['玉山 Unicard'].statementDay).toBe(15);
  });
});
