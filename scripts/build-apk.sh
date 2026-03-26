#!/bin/bash

# 置於專案根目錄執行: bash scripts/build-apk.sh

echo "🚀 開始自動化 APK 組建流程 (arm64-v8a 最佳化版)..."

# 1. 清除並重新導出原生專案
echo "📦 執行 Expo Prebuild..."
EXPO_NO_INTERACTIVE=1 npx expo prebuild --platform android --clean

# 2. 修改 Gradle 設定以進行最佳化
echo "🔧 優化組建設定 (Architecture: arm64-v8a, R8: Enabled)..."

# 設定僅編譯 arm64-v8a 減少體積
sed -i '' 's/reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64/reactNativeArchitectures=arm64-v8a/' android/gradle.properties

# 啟用 R8 Minify
sed -i '' "s/def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()/def enableMinifyInReleaseBuilds = true/" android/app/build.gradle

# 啟用 Resource Shrinking
sed -i '' "s/shrinkResources enableShrinkResources.toBoolean()/shrinkResources true/" android/app/build.gradle
sed -i '' "/def enableShrinkResources = findProperty/d" android/app/build.gradle

# 3. 執行 Gradle 編譯
echo "🏗️ 開始編譯 Release APK (這可能需要幾分鐘)..."
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd android && ./gradlew assembleRelease

# 4. 複製結果到桌面
if [ -f "app/build/outputs/apk/release/app-release.apk" ]; then
    echo "✅ 編譯成功！正在將檔案複製到桌面..."
    cp app/build/outputs/apk/release/app-release.apk ~/Desktop/finance-app.apk
    echo "🎉 完成！檔案位於：~/Desktop/finance-app.apk"
else
    echo "❌ 錯誤：找不到生成的 APK 檔案。"
    exit 1
fi
