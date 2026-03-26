# 💰 Finance App Native

個人財務管理 App，基於 **React Native (Expo)** 開發，支援 Android APK 側載安裝。  
匯入 AndroMoney CSV 記帳資料，提供多維度的視覺化分析儀表板。

---

## ✨ 功能總覽

| 頁面 | 說明 |
|------|------|
| **📊 Dashboard** | 餘額 / 收入 / 支出 / 儲蓄率摘要卡片、趨勢折線圖、月收支長條圖、帳戶資產表、支出類別分佈、月曆熱力圖、資產負債圓餅圖 |
| **📋 Records** | 全記錄瀏覽，支援關鍵字搜尋、日期排序、分頁、匯出篩選結果 |
| **💳 Budget** | 月預算設定（按類別），進度條、日均安全消費額、超支警告 |
| **🏪 Merchant** | 商家消費排行、金額 / 次數 / 均消排序、Top 10 長條圖 |
| **📁 Project** | 專案支出總覽、長條圖比較 |
| **✈️ Travel** | 旅遊專案（YYMMDD-名稱）自動聚合，含日均消費、類別拆解、幣種統計 |
| **📤 Upload** | 匯入 AndroMoney CSV 檔案 |

### 共用元件

| 元件 | 說明 |
|------|------|
| `DateRangeSelector` | 日期區間快捷選擇器（7/30/90/180/365天 + 自訂） |
| `DetailModal` | 交易明細彈窗，支援列表 / 統計雙模式（類別分佈、商家 Top 5） |
| `MonthlyCalendar` | 月曆格，每日支出金額 + 綠黃紅色點 |
| `CategoryPieChart` | 資產 / 負債分類圓餅圖 |
| `UploadSection` | CSV 檔案選擇與解析 |

---

## 🏗️ 技術架構

```
finance-app-native/
├── app/
│   ├── (tabs)/              # Expo Router tab 頁面
│   │   ├── _layout.tsx      # Tab 導航配置
│   │   ├── index.tsx        # Dashboard
│   │   ├── records.tsx      # 記錄瀏覽
│   │   ├── budget.tsx       # 預算管理
│   │   ├── merchant.tsx     # 商家分析
│   │   ├── project.tsx      # 專案分析
│   │   ├── travel.tsx       # 旅遊分析
│   │   └── upload.tsx       # 資料匯入
│   └── _layout.tsx          # Root layout
├── components/              # 共用 UI 元件
├── services/
│   ├── financeService.ts    # 核心資料處理 (篩選/排序/聚合/轉換)
│   ├── budgetService.ts     # 預算計算邏輯
│   └── shared.ts            # 共用函式 (旅遊專案聚合)
├── context/
│   └── FinanceContext.tsx    # 全域狀態 (records)
├── constants.ts             # 帳號分類/個人帳號/共用帳號
├── theme.ts                 # 設計 tokens (顏色/陰影/類別色)
├── types.ts                 # TypeScript 型別定義
└── app.json                 # Expo 設定
```

### Tech Stack

| 類別 | 技術 |
|------|------|
| **Framework** | React Native 0.81 + Expo 54 (New Architecture) |
| **Routing** | Expo Router 6 (file-based) |
| **Charts** | react-native-gifted-charts |
| **Animation** | react-native-reanimated |
| **Storage** | AsyncStorage (預算/設定) |
| **Styling** | NativeWind (TailwindCSS) + StyleSheet |
| **CSV Parse** | iconv-lite + custom parser |

---

## 🚀 開發環境設定

### 前置需求

- **Node.js** 18+
- **npm** 9+
- Expo Go app（手機測試用）

### 安裝與啟動

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npx expo start --clear

# 手機掃描 QR Code (Expo Go) 即可預覽
```

---

## 📦 建置 APK（Android 側載安裝）

### 前置需求

```bash
# 1. 安裝 JDK 17
brew install --cask zulu@17

# 2. 安裝 Android Studio
brew install --cask android-studio

# 3. 安裝 Android SDK (命令列)
mkdir -p ~/Library/Android/sdk
curl -L -o /tmp/cmdline-tools.zip \
  "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
unzip -o /tmp/cmdline-tools.zip -d /tmp/cmdline-unzip
mv /tmp/cmdline-unzip/cmdline-tools ~/Library/Android/sdk/cmdline-tools/latest

# 4. 接受授權 & 安裝 SDK 元件
export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" "platforms;android-35" "build-tools;35.0.0" "ndk;27.1.12297006"

# 5. 設定環境變數 (加到 ~/.zshrc)
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

### 建置 APK

```bash
# 產生 Android 原生專案
npx expo prebuild --platform android --clean

# 建置 Release APK
cd android && ./gradlew assembleRelease

# APK 輸出位置
# android/app/build/outputs/apk/release/app-release.apk
```

### 安裝到手機

1. 將 `app-release.apk` 傳送到 Android 手機（Google Drive / Telegram / USB）
2. 點擊 APK → 允許「安裝不明來源的應用程式」→ 安裝

---

## 📂 資料格式

本 App 使用 **AndroMoney CSV** 匯出格式，需包含以下欄位：

| 欄位 | 說明 |
|------|------|
| `日期` | YYYYMMDD 格式 |
| `收款(轉入)` | 收入帳戶名稱 |
| `付款(轉出)` | 支出帳戶名稱 |
| `分類` | 主分類 |
| `子分類` | 子分類 |
| `金額` | 交易金額 |
| `幣別` | 幣種 (TWD, USD, etc.) |
| `專案` | 專案名稱 |
| `商家` | 商家名稱 |
| `描述` | 備註 |

---

## 📄 License

Private project. All rights reserved.
