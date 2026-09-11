const { withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

const RELEASE_SIGNING_BLOCK = `release {
            // Use RELEASE_* from env / gradle.properties when the keystore exists;
            // otherwise leave storeFile unset so release can fall back to debug.
            def releaseStorePath = findProperty('RELEASE_STORE_FILE') ?: System.getenv('RELEASE_STORE_FILE')
            if (releaseStorePath) {
                def releaseStoreFile = file(releaseStorePath)
                if (releaseStoreFile.exists()) {
                    storeFile releaseStoreFile
                    storePassword findProperty('RELEASE_STORE_PASSWORD') ?: System.getenv('RELEASE_STORE_PASSWORD') ?: ''
                    keyAlias findProperty('RELEASE_KEY_ALIAS') ?: System.getenv('RELEASE_KEY_ALIAS') ?: ''
                    keyPassword findProperty('RELEASE_KEY_PASSWORD') ?: System.getenv('RELEASE_KEY_PASSWORD') ?: ''
                }
            }
        }`;

const RELEASE_SIGNING_CONFIG_LINE =
  'signingConfig (signingConfigs.release.storeFile != null ? signingConfigs.release : signingConfigs.debug)';

function ensureReleaseSigningConfig(contents) {
  if (contents.includes('def releaseStorePath')) {
    return contents;
  }

  // Expo template: signingConfigs { debug { ... } }  — inject release before the outer close.
  // Use a brace-light match: debug body has no nested blocks.
  const injected = contents.replace(
    /(signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*)\}/m,
    `$1${RELEASE_SIGNING_BLOCK}\n    }`,
  );

  if (injected === contents) {
    throw new Error(
      '[withAndroidSecurity] Failed to inject signingConfigs.release — Expo build.gradle template may have changed.',
    );
  }
  return injected;
}

function ensureReleaseBuildTypeSigning(contents) {
  if (contents.includes(RELEASE_SIGNING_CONFIG_LINE)) {
    return contents;
  }

  // Only rewrite the release buildType's signingConfig (debug comes first in the template).
  const next = contents.replace(
    /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.(?:debug|release)/,
    `$1${RELEASE_SIGNING_CONFIG_LINE}`,
  );

  if (next === contents) {
    throw new Error(
      '[withAndroidSecurity] Failed to set release buildType signingConfig.',
    );
  }
  return next;
}

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
    contents = ensureReleaseSigningConfig(contents);
    contents = ensureReleaseBuildTypeSigning(contents);
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidSecurity;
