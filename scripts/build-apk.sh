#!/bin/bash
set -euo pipefail

# 置於專案根目錄執行: bash scripts/build-apk.sh
# 體積相關設定已寫在 app.json → expo-build-properties（prebuild 時套用），
# 不再用 sed 改 android/，避免 --clean 後設定遺失或 fragile patch。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "🚀 開始自動化 APK 組建流程（arm64-v8a + R8 + 壓縮 native libs）..."

echo "📦 執行 Expo Prebuild..."
EXPO_NO_INTERACTIVE=1 npx expo prebuild --platform android --clean

echo "🏗️ 開始編譯 Release APK（這可能需要幾分鐘）..."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.gradle}"

cd android
./gradlew clean
./gradlew assembleRelease --no-daemon

APK_PATH="app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
  SIZE="$(du -h "$APK_PATH" | awk '{print $1}')"
  echo "✅ 編譯成功！APK 大小：${SIZE}"
  cp "$APK_PATH" "$HOME/Desktop/finance-app.apk"
  echo "🎉 已複製到：~/Desktop/finance-app.apk"
else
  echo "❌ 錯誤：找不到生成的 APK 檔案。"
  exit 1
fi
