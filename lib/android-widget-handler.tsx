import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { requestWidgetUpdate } from "react-native-android-widget";
import {
  type AndroidWidgetData,
  MediumSpendWidget,
  SmallSpendWidget,
} from "@/components/android-widget";

const WIDGET_SMALL = "KharchaSmallWidget";
const WIDGET_MEDIUM = "KharchaMediumWidget";

function getCachePath(): string | null {
  try {
    const FileSystem = require("expo-file-system") as {
      documentDirectory: string | null;
    };
    if (!FileSystem.documentDirectory) return null;
    return `${FileSystem.documentDirectory}widget-data.json`;
  } catch {
    return null;
  }
}

async function readCachedWidgetData(): Promise<AndroidWidgetData | null> {
  try {
    const path = getCachePath();
    if (!path) return null;
    const FileSystem = require("expo-file-system") as {
      readAsStringAsync: (path: string) => Promise<string>;
    };
    const json = await FileSystem.readAsStringAsync(path);
    return JSON.parse(json) as AndroidWidgetData;
  } catch {
    return null;
  }
}

async function writeCachedWidgetData(data: AndroidWidgetData): Promise<void> {
  try {
    const path = getCachePath();
    if (!path) return;
    const FileSystem = require("expo-file-system") as {
      writeAsStringAsync: (path: string, data: string) => Promise<void>;
    };
    await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
  } catch {
    // non-critical
  }
}

function renderWidget(widgetName: string, data: AndroidWidgetData | null) {
  if (widgetName === WIDGET_SMALL) {
    return <SmallSpendWidget data={data} />;
  }
  return <MediumSpendWidget data={data} />;
}

async function updateAllWidgets(data: AndroidWidgetData): Promise<void> {
  await Promise.all([
    requestWidgetUpdate({
      widgetName: WIDGET_SMALL,
      renderWidget: () => renderWidget(WIDGET_SMALL, data),
      widgetNotFound: () => {},
    }),
    requestWidgetUpdate({
      widgetName: WIDGET_MEDIUM,
      renderWidget: () => renderWidget(WIDGET_MEDIUM, data),
      widgetNotFound: () => {},
    }),
  ]);
}

export async function updateAndroidWidgets(
  data: AndroidWidgetData,
): Promise<void> {
  await writeCachedWidgetData(data);
  await updateAllWidgets(data);
}

export async function widgetTaskHandler(
  props: WidgetTaskHandlerProps,
): Promise<void> {
  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const data = await readCachedWidgetData();
      props.renderWidget(renderWidget(props.widgetInfo.widgetName, data));
      break;
    }
    default:
      break;
  }
}
