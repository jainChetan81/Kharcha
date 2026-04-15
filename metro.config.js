const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Allow drizzle-kit migration SQL files to be imported as strings by
// `drizzle-orm/expo-sqlite/migrator`.
config.resolver.sourceExts.push("sql");

module.exports = withNativeWind(config, { input: "./global.css" });
