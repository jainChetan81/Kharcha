import { router } from "expo-router";
import { useShareIntent } from "expo-share-intent";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SCREENS } from "@/lib/constants";

/**
 * Listen for incoming Android share intents (text/* via the system share
 * sheet) and route to the Add Transaction screen with the shared text
 * preloaded into AI Parse.
 *
 * Android-only for now: iOS Share Extensions require a separate Xcode
 * target + entitlements, which needs `expo-share-intent`'s iOS support
 * enabled (`disableIOS: false` in `app.json`) and a verified build. We
 * explicitly bail on iOS so the hook is a no-op there until that's done.
 *
 * @param ready — wait until the DB is ready before handling, otherwise
 *   the Add screen mounts against an uninitialized DB and its category/
 *   source queries race with the first seed.
 */
export function useShareIntentHandler(ready: boolean) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    // Only text is useful right now — the Add screen's AI Parse sheet takes
    // a string. Images/files would need a receipt attachment feature we
    // don't have yet.
    disabled: Platform.OS !== "android",
  });

  useEffect(() => {
    if (!ready || Platform.OS !== "android") return;
    if (!hasShareIntent) return;

    // `text` is the plain shared body; `webUrl` is populated when a URL
    // was shared (Chrome "Share link"). Fall back to the URL so users who
    // share a receipt link still get something to parse.
    const shared = shareIntent.text ?? shareIntent.webUrl ?? null;
    if (shared) {
      router.push({
        pathname: SCREENS.ADD,
        params: { sharedText: shared },
      });
    }
    // Clear so the same share isn't re-processed on next foreground.
    resetShareIntent();
  }, [ready, hasShareIntent, shareIntent, resetShareIntent]);
}
