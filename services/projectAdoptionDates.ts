/**
 * 各專案在 AndroMoney.csv 中首次出現日期（YYYYMMDD）。
 * 稽核建議「改掛某專案」時，交易日期須 >= 該專案採用日，避免 retroactive 誤報。
 *
 * 資料來源：Desktop AndroMoney.csv（2026-08-29 掃描）
 * 詳細說明：.cursor/skills/andro-money-projects/SKILL.md
 */
export const PROJECT_ADOPTION_FROM_YMD: Readonly<Record<string, string>> = {
  // 日常生活
  正常開銷: '20230223',
  共同開銷: '20240826',

  // 住家與資本
  房屋購置: '20240415',
  婚禮寶典: '20240601',
  住家支出: '20240621',
  裝潢家具: '20241127',

  // 投資
  投資股票: '20230310',

  // 旅遊（YYMMDD-目的地）
  '230401-馬祖': '20230302',
  '230914-綠島': '20230619',
  '231008-馬來西亞': '20230925',
  '240330-宿霧': '20231025',
  '240608-河內': '20231107',
  '241009-港澳': '20240128',
  '241130-沙巴': '20240220',
  '240904-上海': '20240316',
  '250327-埃及': '20240716',
  '241214-沖繩': '20241107',
  '251003-奧匈': '20250414',
  '250821-富國島': '20250415',
  '250620-曼谷': '20250620',
  '260115-港澳': '20250719',
  '251231-名古屋': '20250724',
  '260402-東京': '20260120',
  '260611-瑞法': '20260310',
  '260801-釜山': '20260414',
  '261009-宜蘭': '20260627',
};

/** @deprecated 使用 PROJECT_ADOPTION_FROM_YMD.住家支出 */
export const PROJECT_ZHUJIA_FROM_YMD = PROJECT_ADOPTION_FROM_YMD['住家支出'];
/** @deprecated 使用 PROJECT_ADOPTION_FROM_YMD.共同開銷 */
export const PROJECT_GONGTONG_FROM_YMD = PROJECT_ADOPTION_FROM_YMD['共同開銷'];

export function projectAdoptedFromYmd(projectName: string): string | undefined {
  return PROJECT_ADOPTION_FROM_YMD[projectName];
}

/** 該日期是否已開始使用此專案標籤（含當日） */
export function isProjectAdoptedBy(projectName: string, dateYmd: string): boolean {
  const from = PROJECT_ADOPTION_FROM_YMD[projectName];
  if (!from) return true;
  return dateYmd.length >= 8 && dateYmd >= from;
}

/** 可否建議改掛 suggestProject（須在採用日之後） */
export function canSuggestProject(dateYmd: string, suggestProject: string): boolean {
  return isProjectAdoptedBy(suggestProject, dateYmd);
}
