#!/bin/bash
set -euo pipefail

# 置於專案根目錄執行: bash scripts/build-apk.sh
# 體積相關設定已寫在 app.json → expo-build-properties（prebuild 時套用），
# 不再用 sed 改 android/，避免 --clean 後設定遺失或 fragile patch。
#
# Release 簽名：使用 credentials/（不被 prebuild --clean 清掉，且已 gitignore）。
# 首次執行會自動產生 keystore；請自行備份 credentials/。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

CREDS_DIR="$ROOT_DIR/credentials"
KEYSTORE="$CREDS_DIR/android-release.keystore"
PROPS="$CREDS_DIR/android-release.properties"
KEY_ALIAS="finance-release"

ensure_release_keystore() {
  mkdir -p "$CREDS_DIR"

  if [ -f "$KEYSTORE" ] && [ -f "$PROPS" ]; then
    # shellcheck disable=SC1090
    set -a
    # Read KEY=VALUE lines (ignore comments / blanks)
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        ''|\#*) continue ;;
        RELEASE_*=*)
          key="${line%%=*}"
          value="${line#*=}"
          export "$key=$value"
          ;;
      esac
    done < "$PROPS"
    set +a
    return
  fi

  echo "🔐 建立本機 release keystore（僅首次）…"
  PASS="$(openssl rand -base64 32 | tr -d '/+=' | head -c 28)"
  keytool -genkeypair -v \
    -storetype PKCS12 \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" \
    -keypass "$PASS" \
    -dname "CN=Finance App, OU=Personal, O=Local, L=Taipei, ST=TW, C=TW" \
    >/dev/null

  cat > "$PROPS" <<EOF
RELEASE_STORE_FILE=$KEYSTORE
RELEASE_STORE_PASSWORD=$PASS
RELEASE_KEY_ALIAS=$KEY_ALIAS
RELEASE_KEY_PASSWORD=$PASS
EOF

  export RELEASE_STORE_FILE="$KEYSTORE"
  export RELEASE_STORE_PASSWORD="$PASS"
  export RELEASE_KEY_ALIAS="$KEY_ALIAS"
  export RELEASE_KEY_PASSWORD="$PASS"

  echo "✅ 已寫入 $KEYSTORE"
  echo "   請備份整个 credentials/；遺失後無法用同一金鑰覆蓋安裝舊 APK。"
}

echo "🚀 開始自動化 APK 組建流程（arm64-v8a + R8 + 壓縮 native libs）..."

ensure_release_keystore

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
