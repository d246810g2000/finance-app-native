# 財務管家（Finance App Native）

個人財務管理 App，以 **React Native + Expo** 開發，匯入 AndroMoney CSV 後提供資產總覽、預算追蹤、記錄瀏覽、專案／旅遊分析，並支援 Android 桌面 Widget 與常駐預算通知。

| | |
|---|---|
| **顯示名稱** | 財務管家 |
| **版本** | 1.0.0 |
| **平台** | iOS · Android（主打原生；Web 非主要目標） |
| **架構** | Expo 54 · React Native 0.81 · New Architecture |

---

## 功能總覽

### 主要頁面（底部 Tab）

| 頁面 | 說明 |
|------|------|
| **資產** | 資產／收入／支出／儲蓄率／日均消費摘要；帳戶範圍（全部／個人／共用）；帳戶明細與資產分配；過去 12 期趨勢與儲蓄率圖表；點擊開明細 |
| **預算** | 月份導航；固定支出與日常預算分區；類別進度卡與排序；異常消費健康檢查；變更後同步 Widget／通知 |
| **記錄** | 日／週／月／年檢視、統一日期導航、月曆熱力；FlashList 列表；依日期／類別／金額排序；刪除、下拉刷新、明細彈窗 |
| **專案** | 專案支出聚合與排序；可依設定排除旅遊專案（`YYMMDD-`）；點擊開明細 |
| **旅遊** | 自動聚合 `YYMMDD-名稱` 專案；天數、日均、筆數、類別拆解；點擊進入全頁明細 |

### 隱藏／附屬流程

| 入口 | 說明 |
|------|------|
| **資料匯入** | 漢堡選單 → 匯入（tab 隱藏）。選擇 AndroMoney CSV（UTF-8／Big5），解析後寫入本機 |
| **全域搜尋** | 漢堡選單 → 搜尋記錄，套用條件後導向「記錄」頁 |
| **商家分析** | 漢堡選單 → 商家／發票品項排行（隱藏 tab） |
| **系統設定** | 帳戶分類對照、帳戶顯示隱私、預算專案設定、批次編輯預算額、排除旅遊專案、預算常駐通知（Android）、外觀主題 |
| **旅遊明細** | 路由 `app/travel/[name]`：總覽／依日／全部明細；日期膠囊篩選；分類圓餅、高峰日／最大筆、花費排名 |
| **Stories 分享** | 旅遊總覽「儲存圖片」→ 選風格 → 產出 9:16（1080×1920）PNG 並呼叫系統分享 |

### 分享風格（旅遊 Stories）

| 風格 | 調性 |
|------|------|
| 柔光回顧 | 溫柔杏粉紫 |
| 午夜極簡 | 深色高級感 |
| 暖陽旅途 | 日落橘粉 |
| 清澈海風 | 藍綠清爽 |

各風格含獨立漸層、玻璃卡與圓餅圖色盤。

### Android 專屬

| 功能 | 說明 |
|------|------|
| **預算 Widget** | 桌面小工具顯示日常預算／已花／剩餘／建議日額／固定支出等；可切換前後月份 |
| **常駐通知** | 本月花費％、建議日額、結餘（需開發建置或 APK，**Expo Go 不可用**） |

---

## 技術架構

```
finance-app-native/
├── app/
│   ├── (tabs)/                 # Tab：資產／預算／記錄／專案／旅遊（+ 隱藏匯入）
│   │   └── _layout.tsx
│   ├── travel/[name].tsx       # 旅遊全頁明細
│   └── _layout.tsx             # Theme → Finance → Stack
├── components/
│   ├── layout/                 # PageChrome、UnifiedDateNavigator、漢堡選單…
│   ├── travel/                 # TravelDetailScreen、TravelStoryCard…
│   ├── budget/ · settings/ · ui/
│   └── …
├── services/
│   ├── financeService.ts       # CSV 讀寫、聚合、趨勢、異常支出
│   ├── budgetService.ts        # 預算規則／狀態
│   ├── accountConfigService.ts # 帳戶對照／排除
│   ├── shared.ts               # 旅遊／專案聚合
│   ├── WidgetService.ts        # Android Widget 同步
│   └── NotificationService.ts  # Android 常駐通知
├── context/
│   ├── FinanceContext.tsx      # 紀錄與預算等全域狀態
│   └── ThemeContext.tsx        # light／dark／system
├── plugins/
│   └── withBudgetWidget.js     # Android Widget + SharedPreferences
├── scripts/
│   └── build-apk.sh            # 一鍵 Release APK
├── theme.ts · types.ts · constants.ts
└── app.json
```

### Tech Stack

| 類別 | 技術 |
|------|------|
| Framework | React 19 · React Native 0.81 · Expo ~54（New Architecture） |
| Routing | Expo Router 6（file-based） |
| Lists | @shopify/flash-list |
| Charts | react-native-gifted-charts |
| Animation | react-native-reanimated |
| Capture / Share | react-native-view-shot · expo-sharing |
| Notifications | @notifee/react-native（Android） |
| Styling | StyleSheet + 設計 tokens（`theme.ts`）；NativeWind 可用 |
| CSV | iconv-lite（UTF-8／Big5）+ 自訂解析 |

### 本機資料存放

| 資料 | 機制 |
|------|------|
| 交易紀錄 | FileSystem → `finance_records.json` |
| 預算規則／設定 | FileSystem → `budget_rules.json`、`budget_config.json` |
| 帳戶對照／排除 | FileSystem → `custom_account_mappings.json`、`account_config.json` |
| 主題模式 | AsyncStorage → `@app_theme_mode` |
| 通知開關 | AsyncStorage → `@budget_notification_enabled` |
| Widget 資料 | Android SharedPreferences（native module） |

---

## 開發環境

### 前置需求

- Node.js 18+
- npm 9+
- 手機預覽：Expo Go（**不含** Widget／常駐通知）
- 完整原生功能：需 `expo run:android`／`expo run:ios` 或安裝 APK

### 安裝與啟動

```bash
npm install

# 開發伺服器
npx expo start --clear
# 或
npm start

# 原生開發建置（通知／Widget 等）
npm run android
npm run ios
```

---

## 建置 Android APK（側載）

### 環境（首次）

```bash
# JDK 17
brew install --cask zulu@17

# Android Studio（或至少 Android SDK）
brew install --cask android-studio

# Command-line tools（範例）
mkdir -p ~/Library/Android/sdk
curl -L -o /tmp/cmdline-tools.zip \
  "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
unzip -o /tmp/cmdline-tools.zip -d /tmp/cmdline-unzip
mkdir -p ~/Library/Android/sdk/cmdline-tools
mv /tmp/cmdline-unzip/cmdline-tools ~/Library/Android/sdk/cmdline-tools/latest

export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" "platforms;android-35" "build-tools;35.0.0" "ndk;27.1.12297006"

# 建議寫入 ~/.zshrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

### 一鍵建置

```bash
npm run build:apk
# 等同 bash scripts/build-apk.sh
```

腳本會：`expo prebuild` → 僅編譯 `arm64-v8a`、啟用 R8／資源縮減 → `assembleRelease` → 複製到 `~/Desktop/finance-app.apk`。

### 手動建置（可選）

```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# 輸出：android/app/build/outputs/apk/release/app-release.apk
```

傳至手機後允許「安裝不明來源」即可側載。

---

## 資料格式（AndroMoney CSV）

匯出檔需包含下列欄位（中文表頭）：

| 欄位 | 說明 |
|------|------|
| `Id` / `uid` | 穩定識別（增量合併用） |
| `日期` | YYYYMMDD |
| `時間` | HHMM（可選） |
| `收款(轉入)` | 收入帳戶 |
| `付款(轉出)` | 支出帳戶 |
| `分類` | 主分類 |
| `子分類` | 子分類 |
| `金額` | 交易金額 |
| `幣別` | 如 TWD、USD（會以程式內靜態匯率換算） |
| `專案` | 專案名稱；旅遊請用 `YYMMDD-名稱` |
| `商家(公司)` | 商家名稱（可空；常從備註抽取） |
| `備註` | 備註／電子發票內容（`商家:` 與品項） |
| `Periodic` | 週期設定（匯入保留，預算建議可後續使用） |

### 匯入

- 預設 **合併更新**（依 `uid`／`Id`）；可選 **完全取代**
- 合併可開「同步刪除 CSV 沒有的紀錄」
- 匯入後顯示報告：略過 SYSTEM、商家抽取來源、未對應帳戶、合併增刪統計
- 本機驗證：將匯出檔放在 **本機** `data/AndroMoney.csv`（已 gitignore，勿提交），執行 `npm run test:csv`

### 分帳規則

支出最多套用一次 50%：優先「自動分帳專案」（如共同開銷），否則在設定開啟時對共享付款帳戶分帳。預算頁可看「個人全額 vs 共同份額」。

### 大額專案

專案頁提供長期專案時間軸、月花費與可選預算上限進度。

### 旅遊專案命名

符合 `^(\d{6})-` 的專案名稱會出現在「旅遊」頁，例如 `250611-東京自由行`。

---

## License

Private project. All rights reserved.
