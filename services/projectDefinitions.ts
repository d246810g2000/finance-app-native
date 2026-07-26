/**
 * 專案定義（記帳歸屬準則）
 *
 * 用於人工覆核與 __tests__/projectAttribution.fixture.test.ts 自動掃描。
 * 分帳：共同開銷預設 50%（與 App splitProjects 一致）。
 *
 * 判斷原則：
 * - 「誰受益／誰一起」優先於「分類名稱」
 * - 兩人一起或家庭共用 → 共同開銷（即使是遊戲、演唱會、他人禮金）
 * - 水電瓦斯網路稅管理費 → 住家支出（不要放共同／正常）
 */

export type ProjectDefinition = {
  name: string;
  owner: 'personal' | 'shared' | 'household' | 'capital' | 'event';
  summary: string;
  includes: string[];
  excludes: string[];
  /** 預期常見「分類/子分類」 */
  expectedCategories: string[];
  /** 明顯不該出現的分類關鍵字 */
  suspiciousCategoryHints: RegExp[];
  /** 備註／商家若命中，偏向應改掛他專案 */
  reassignHints: Array<{
    pattern: RegExp;
    suggestProject: string;
    reason: string;
  }>;
};

export const PROJECT_DEFINITIONS: ProjectDefinition[] = [
  {
    name: '正常開銷',
    owner: 'personal',
    summary: '「我」的日常支出（個人生活、個人娛樂、個人人情）。',
    includes: [
      '個人餐飲（非與謦伊共同採買／外食分攤）',
      '純個人交通、純個人娛樂／購物（只有自己受益）',
      '孝親、純個人名義的人情（非兩人一起包的禮）',
      '個人訂閱、純個人的花費',
      '個人車輛相關稅費（如個人燃料稅、牌照稅）',
    ],
    excludes: [
      '與謦伊共同的日常／休閒／禮金 → 共同開銷',
      '家庭共用娛樂設備（如家用 Switch）→ 共同開銷',
      '住家水電瓦斯網路管理費／房屋稅 → 住家支出（個人燃料稅除外）',
      '裝潢／家具家電購置 → 裝潢家具',
      '頭期款／房貸 → 房屋購置',
      '結婚籌備花費 → 婚禮寶典',
    ],
    expectedCategories: [
      '餐飲食品/*',
      '運輸交通/*',
      '休閒娛樂/*（個人）',
      '人情交際/孝養父母',
      '居家生活/日常用品（個人）',
      '居家生活/房租（租屋期間）',
      '居家生活/繳稅（個人燃料稅等）',
    ],
    // 繳稅本身不一定錯（可能是個人燃料稅）；用備註判斷
    suspiciousCategoryHints: [/房屋支出/, /管理費/, /網路費/, /電費/, /水費/, /瓦斯/],
    reassignHints: [
      { pattern: /房貸|頭期/, suggestProject: '房屋購置', reason: '購屋資本支出' },
      { pattern: /裝修|裝潢|家具|沙發|床墊|冷氣|洗碗機/, suggestProject: '裝潢家具', reason: '裝潢／家具' },
      {
        pattern: /管理費|電費|水費|瓦斯|網路費|房屋稅|地價稅/,
        suggestProject: '住家支出',
        reason: '住家固定費',
      },
      { pattern: /婚紗|喜餅|喜宴|婚戒|拍拍印/, suggestProject: '婚禮寶典', reason: '結婚花費' },
    ],
  },
  {
    name: '共同開銷',
    owner: 'shared',
    summary: '「我與謦伊（老婆）」的共同支出，預設五五分帳（含共同日常、共同休閒、共同人情）。',
    includes: [
      '共同外食、超市／賣場採買、共同日用品',
      '兩人一起的休閒（演唱會、共同出遊相關等）',
      '家庭共用娛樂（家用 Switch、遊戲片、相關配件）',
      '兩人一起參加而包的禮金（他人婚禮等）',
      '其他約定為共同負擔的日常花費',
    ],
    excludes: [
      '純個人花費 → 正常開銷',
      '住家固定費（水電瓦斯網路稅管理費）→ 住家支出',
      '裝潢／家具／大型家電購置 → 裝潢家具',
      '房貸／頭期 → 房屋購置',
      '我們自己的結婚籌備 → 婚禮寶典',
    ],
    expectedCategories: [
      '餐飲食品/*',
      '居家生活/日常用品',
      '休閒娛樂/*（共同／家庭）',
      '人情交際/婚喪喜慶（共同禮金）',
      '運輸交通（共同出行）',
    ],
    // 水電稅等仍標可疑；遊戲／演唱會／婚喪喜慶在「共同」下可視為合理
    suspiciousCategoryHints: [/房屋支出/, /管理費/, /繳稅/, /網路費/, /電費/, /水費/, /瓦斯/, /孝養父母/, /房租/],
    reassignHints: [
      { pattern: /婚紗|喜餅|喜宴|拍拍印|婚戒/, suggestProject: '婚禮寶典', reason: '我們自己的結婚花費' },
      { pattern: /房貸|頭期/, suggestProject: '房屋購置', reason: '購屋資本支出' },
      { pattern: /裝修|裝潢|家具|沙發|床墊/, suggestProject: '裝潢家具', reason: '裝潢／家具' },
      { pattern: /管理費|電費|水費|瓦斯|網路費|房屋稅/, suggestProject: '住家支出', reason: '住家固定費' },
    ],
  },
  {
    name: '住家支出',
    owner: 'household',
    summary: '住家運作的固定／半固定費用：電費、網路、瓦斯、水費、稅、管理費等。',
    includes: [
      '電費、水費、瓦斯、網路／電信',
      '管理費、清潔費',
      '房屋稅、地價稅等住家相關稅（不含個人燃料稅／牌照稅）',
      '車位管理／保養費（若視為住家固定支出）',
    ],
    excludes: [
      '日常超市採買 → 共同開銷或正常開銷',
      '裝潢工程款、家具家電購置 → 裝潢家具',
      '房貸本息、頭期款 → 房屋購置',
      '家庭娛樂設備（Switch 等）→ 共同開銷',
      '個人燃料稅、牌照稅 → 正常開銷',
    ],
    expectedCategories: [
      '居家生活/電費',
      '居家生活/水費',
      '居家生活/瓦斯',
      '居家生活/網路費',
      '居家生活/管理費',
      '居家生活/繳稅',
      '汽機車/汽車車位保養費',
    ],
    suspiciousCategoryHints: [/餐飲食品/, /休閒娛樂/, /婚喪/, /房屋支出/, /孝養/],
    reassignHints: [
      { pattern: /裝修|裝潢|家具|沙發|床墊|冷氣安裝/, suggestProject: '裝潢家具', reason: '非月結公用事業' },
      { pattern: /房貸|頭期/, suggestProject: '房屋購置', reason: '購屋資本支出' },
      { pattern: /晚餐|午餐|全聯|家樂福|賣場/, suggestProject: '共同開銷', reason: '日常採買' },
    ],
  },
  {
    name: '裝潢家具',
    owner: 'capital',
    summary: '裝潢工程費、家具與為新家購置的大型家電／設備（非娛樂用 3C）。',
    includes: [
      '裝修期款／尾款、工程相關',
      '家具（沙發、床墊、櫃、桌椅等）',
      '為新家購置的大型家電（冷氣、洗碗機等）',
      '裝潢相關耗材、安裝費',
    ],
    excludes: [
      '家庭／個人娛樂 3C（Switch、遊戲片、配件）→ 共同開銷（家庭）或正常開銷（個人）',
      '日常超市耗材（非裝潢用途）→ 共同開銷',
      '房貸／頭期 → 房屋購置',
      '水電瓦斯月費 → 住家支出',
    ],
    expectedCategories: ['居家生活/房屋支出', '居家生活/日常用品（家具家電）'],
    suspiciousCategoryHints: [/遊戲/, /餐飲食品/, /孝養/, /婚喪/, /繳稅/, /管理費/, /網路費/, /電費/],
    reassignHints: [
      {
        pattern: /遊戲|Switch|任天堂|Joy-Con|演唱會/,
        suggestProject: '共同開銷',
        reason: '家庭／共同娛樂，非裝潢家具',
      },
      { pattern: /房貸|頭期/, suggestProject: '房屋購置', reason: '購屋資本支出' },
      { pattern: /管理費|電費|水費|瓦斯|網路費|房屋稅/, suggestProject: '住家支出', reason: '住家固定費' },
      { pattern: /婚紗|喜餅|喜宴/, suggestProject: '婚禮寶典', reason: '結婚花費' },
    ],
  },
  {
    name: '房屋購置',
    owner: 'capital',
    summary: '購屋資本支出：頭期款與房貸（本息／固定月繳）。',
    includes: ['頭期款', '房貸月繳／本息', '與購屋直接相關的大額資本支出（非裝潢）'],
    excludes: [
      '裝潢工程、家具家電 → 裝潢家具',
      '入住後水電稅管理費 → 住家支出',
      '日常開銷 → 正常／共同開銷',
    ],
    expectedCategories: ['居家生活/房屋支出'],
    suspiciousCategoryHints: [/餐飲/, /休閒/, /遊戲/, /婚喪/, /日常用品/, /管理費/, /網路費/, /電費/],
    reassignHints: [
      { pattern: /裝修|裝潢|家具|沙發|床墊|冷氣|洗碗機/, suggestProject: '裝潢家具', reason: '裝潢／家具而非購屋款' },
      { pattern: /管理費|電費|水費|瓦斯|網路費|房屋稅/, suggestProject: '住家支出', reason: '住家固定費' },
    ],
  },
  {
    name: '婚禮寶典',
    owner: 'event',
    summary: '我們結婚相關的籌備與儀式花費。',
    includes: [
      '婚紗、攝影、喜餅、喜宴、金飾、婚禮小物／遊戲',
      '與婚禮直接相關的交通、訂金／尾款',
    ],
    excludes: [
      '參加別人婚禮的禮金（兩人一起）→ 共同開銷',
      '參加別人婚禮的禮金（僅個人）→ 正常開銷',
      '婚後日常開銷 → 正常／共同開銷',
      '裝潢家具、房貸 → 對應資本專案',
    ],
    expectedCategories: ['人情交際/婚喪喜慶', '人情交際/送禮請客', '運輸交通（婚禮相關）'],
    suspiciousCategoryHints: [/房屋支出/, /管理費/, /繳稅/, /孝養父母/],
    reassignHints: [
      {
        pattern: /小羊結婚|朋友結婚|同事結婚|同學結婚/,
        suggestProject: '共同開銷',
        reason: '他人婚禮禮金；兩人一起參加則共同開銷',
      },
      { pattern: /裝修|裝潢|家具/, suggestProject: '裝潢家具', reason: '非婚禮' },
      { pattern: /房貸|頭期/, suggestProject: '房屋購置', reason: '購屋' },
    ],
  },
];

export const PROJECT_DEFINITION_BY_NAME: Record<string, ProjectDefinition> = Object.fromEntries(
  PROJECT_DEFINITIONS.map((d) => [d.name, d])
);

/** 主要覆核專案清單（分析腳本共用） */
export const FOCUS_PROJECTS = PROJECT_DEFINITIONS.map((d) => d.name);

/**
 * 嚴格歸屬規範起點（含當日）。
 * 2024-06 前記帳較鬆，分析預設只挑此日之後的問題。
 */
export const STRICT_ATTRIBUTION_FROM_YMD = '20240601';
