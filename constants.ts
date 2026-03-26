export const EXCHANGE_RATES: { [key: string]: number } = {
  'MYR': 6.87285,
  'USD': 32.2755,
  'PHP': 0.565,
  'VND': 0.00128,
  'TWD': 1,
};

export const PERSONAL_ACCOUNT_CATEGORIES: { [key: string]: string[] } = {
  '現金': ['現金', '午餐帳戶'],
  '銀行': ['將來銀行', 'iLEO 數位帳戶', 'New New Bank', '臺灣企銀', '大戶 DAWHO', '富邦銀行', 'Line bank', 'Richart'],
  '信用卡': ['台新 GoGo 卡', '台新玫瑰 Giving 卡', '台新 FlyGo 卡', '一銀 ileo 卡', '玉山 Unicard'],
  '儲值卡': ['悠遊卡 (u-bear)', '悠遊卡 (Samsung)', '悠遊卡 (Eazy Wallet)'],
  '證券戶': ['股票', '錼創信託', '元大股票'],
  '其他': ['15號會錢', '10號會錢', '25號會錢', '投資', '應付會錢', '富邦信貸'],
};

export const SHARED_ACCOUNT_CATEGORIES: { [key: string]: string[] } = {
  '現金': ['共享現金帳戶', '共享國外帳戶'],
  '銀行': ['共享樂天帳戶', '小伊帳戶', '共享定存帳戶'],
  '信用卡': ['玉山 UBear 卡', '星展享樂生活白金卡', '富邦 J 卡', '共享玉山 Unicard'],
  '證券戶': ['共享股票帳戶'],
};

const allCategories: { [key: string]: string[] } = {};
const allCategoryKeys = new Set([...Object.keys(PERSONAL_ACCOUNT_CATEGORIES), ...Object.keys(SHARED_ACCOUNT_CATEGORIES)]);

allCategoryKeys.forEach(key => {
  allCategories[key] = [
    ...(PERSONAL_ACCOUNT_CATEGORIES[key] || []),
    ...(SHARED_ACCOUNT_CATEGORIES[key] || []),
  ];
});

export const ACCOUNT_CATEGORIES = allCategories;
export const PERSONAL_ACCOUNTS = Object.values(PERSONAL_ACCOUNT_CATEGORIES).flat();
export const SHARED_ACCOUNTS = Object.values(SHARED_ACCOUNT_CATEGORIES).flat();

export const ASSET_CLASSES: { [key: string]: string[] } = {
  '流動資金': ['現金', '銀行', '儲值卡'],
  '投資': ['證券戶', '其他'],
  '固定資產': [],
  '負債': ['信用卡'],
  '應收款': [],
};

export const ASSET_CLASS_COLORS: { [key: string]: string } = {
  '流動資金': '#2ECC71', // Green
  '投資': '#8B5CF6',    // Purple
  '固定資產': '#3B82F6',  // Blue
  '負債': '#93C5FD',    // Light Blue
  '應收款': '#BFDBFE',   // Lighter Blue
};

export const getAssetClass = (category: string): string => {
  for (const [assetClass, subCategories] of Object.entries(ASSET_CLASSES)) {
    if (subCategories.includes(category)) {
      return assetClass;
    }
  }
  return '未分類'; // Should not happen if all categories are mapped
};
