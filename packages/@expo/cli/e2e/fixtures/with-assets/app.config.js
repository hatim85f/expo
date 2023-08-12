/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  assetBundlePatterns: ['assets/*.ttf'],
  assetPrefix: process.env._EXPO_ASSET_PREFIX || undefined,
  android: {
    package: 'com.example.minimal',
  },
  ios: {
    bundleIdentifier: 'com.example.minimal',
  },
  web: {
    bundler: 'metro',
  },
  experiments: {
    tsconfigPaths: process.env._EXPO_E2E_USE_PATH_ALIASES ? true : undefined,
  },
};
