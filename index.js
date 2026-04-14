const { Platform } = require("react-native");

if (Platform.OS === "android") {
	const { registerWidgetTaskHandler } = require("react-native-android-widget");
	const { widgetTaskHandler } = require("./lib/android-widget-handler");
	registerWidgetTaskHandler(widgetTaskHandler);
}

require("expo-router/entry-classic");
