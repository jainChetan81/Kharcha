import { File, Paths } from "expo-file-system";
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

const CACHE_FILENAME = "widget-data.json";

function getCacheFile(): File {
  return new File(Paths.document, CACHE_FILENAME);
}

async function readCachedWidgetData(): Promise<AndroidWidgetData | null> {
  try {
    const file = getCacheFile();
    if (!file.exists) return null;
    const json = await file.text();
    return JSON.parse(json) as AndroidWidgetData;
  } catch {
    return null;
  }
}

async function writeCachedWidgetData(data: AndroidWidgetData): Promise<void> {
  try {
    getCacheFile().write(JSON.stringify(data));
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

/**
 * Loaded via dynamic `require` from lib/widget.ts to avoid bundling
 * Android widget code on iOS — knip can't see the call site, so the
 * `@public` tag suppresses the false positive.
 * @public
 */
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
