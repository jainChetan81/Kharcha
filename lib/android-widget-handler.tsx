import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { requestWidgetUpdate } from "react-native-android-widget";
import {
  type AndroidWidgetData,
  MediumSpendWidget,
  SmallSpendWidget,
} from "@/components/android-widget";

const WIDGET_SMALL = "KharchaSmallWidget";
const WIDGET_MEDIUM = "KharchaMediumWidget";

// Coalesce rapid cache-read + re-render bursts triggered by the OS during
// widget resize gestures and rotation (each gesture can fire several
// WIDGET_RESIZED events in quick succession).
const HANDLER_DEBOUNCE_MS = 400;
const lastRenderedAt = new Map<string, number>();

function getCachePath(): string | null {
  try {
    const FileSystem = require("expo-file-system") as {
      documentDirectory: string | null;
    };
    if (!FileSystem.documentDirectory) {
      console.warn("[widget] expo-file-system documentDirectory is null");
      return null;
    }
    return `${FileSystem.documentDirectory}widget-data.json`;
  } catch (err) {
    console.warn("[widget] expo-file-system unavailable", err);
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
  } catch (err) {
    console.warn("[widget] failed to read cached data", err);
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
  } catch (err) {
    console.warn("[widget] failed to write cached data", err);
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
      const key = props.widgetInfo.widgetName;
      const now = Date.now();
      const last = lastRenderedAt.get(key) ?? 0;
      // WIDGET_ADDED should always render (first paint), but rapid
      // UPDATE/RESIZED events within the debounce window are skipped.
      if (
        props.widgetAction !== "WIDGET_ADDED" &&
        now - last < HANDLER_DEBOUNCE_MS
      ) {
        return;
      }
      lastRenderedAt.set(key, now);
      const data = await readCachedWidgetData();
      props.renderWidget(renderWidget(props.widgetInfo.widgetName, data));
      break;
    }
    default:
      break;
  }
}
