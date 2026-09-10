const { withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

/** Keep financial records out of Android backup and avoid legacy broad permissions. */
function withAndroidSecurity(config) {
  config = withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    const permissions = manifest['uses-permission'] || [];
    manifest['uses-permission'] = permissions.filter(permission => {
      const name = permission.$?.['android:name'];
      return ![
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ].includes(name);
    });
    const application = manifest.application?.[0];
    if (application?.$) application.$['android:allowBackup'] = 'false';
    return config;
  });

  return withAppBuildGradle(config, config => {
    let contents = config.modResults.contents;
    if (!contents.includes("storeFile file(findProperty('RELEASE_STORE_FILE')")) {
      contents = contents.replace(
        /signingConfigs \{\n        debug \{([\s\S]*?)\n        \}\n    \}/,
        `signingConfigs {\n        debug {$1\n        }\n        release {\n            storeFile file(findProperty('RELEASE_STORE_FILE') ?: System.getenv('RELEASE_STORE_FILE') ?: 'release.keystore')\n            storePassword findProperty('RELEASE_STORE_PASSWORD') ?: System.getenv('RELEASE_STORE_PASSWORD') ?: ''\n            keyAlias findProperty('RELEASE_KEY_ALIAS') ?: System.getenv('RELEASE_KEY_ALIAS') ?: ''\n            keyPassword findProperty('RELEASE_KEY_PASSWORD') ?: System.getenv('RELEASE_KEY_PASSWORD') ?: ''\n        }\n    }`,
      );
    }
    contents = contents.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release',
    );
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidSecurity;
