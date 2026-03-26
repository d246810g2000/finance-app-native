const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    string_decoder: require.resolve("string_decoder"),
    buffer: require.resolve("buffer"),
    stream: require.resolve("stream-browserify"),
    events: require.resolve("events"),
    path: require.resolve("path-browserify"),
    process: require.resolve("process/browser"),
};

module.exports = withNativeWind(config, { input: "./global.css" });
