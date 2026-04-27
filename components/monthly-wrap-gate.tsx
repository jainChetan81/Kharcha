import { format, subMonths } from "date-fns";
import { useEffect, useState } from "react";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { MonthlyWrapCard } from "@/components/monthly-wrap-card";
import { CONFIG_KEYS, MONTH_FORMAT } from "@/lib/constants";
import { getTransactionCount } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import {
  ERROR_TYPE,
  FIREBASE_EVENTS,
  logEvent,
  logFirebaseError,
} from "@/lib/firebase";

// Auto-shows the Monthly Wrap modal at most once per calendar month, on the
// first launch after a new month has begun. If the previous month has zero
// activity, the wrap is skipped but the config is still written so we don't
// re-check on every cold start.
export function MonthlyWrapGate() {
  const [yearMonth, setYearMonth] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const currentMonth = format(new Date(), MONTH_FORMAT);
        const lastShown = await getConfig(CONFIG_KEYS.LAST_WRAP_SHOWN_MONTH);
        if (lastShown === currentMonth) return;

        const prevMonth = format(subMonths(new Date(), 1), MONTH_FORMAT);
        const count = await getTransactionCount(prevMonth);
        if (count <= 0) {
          await updateConfig(CONFIG_KEYS.LAST_WRAP_SHOWN_MONTH, currentMonth);
          return;
        }
        if (cancelled) return;
        setYearMonth(prevMonth);
        logEvent(FIREBASE_EVENTS.MONTHLY_WRAP_SHOWN, { month: prevMonth });
      } catch (error) {
        logFirebaseError(error, {
          error_type: ERROR_TYPE.DB,
          operation: "monthly_wrap_gate",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDismiss() {
    const currentMonth = format(new Date(), MONTH_FORMAT);
    setYearMonth(null);
    logEvent(FIREBASE_EVENTS.MONTHLY_WRAP_DISMISSED);
    try {
      await updateConfig(CONFIG_KEYS.LAST_WRAP_SHOWN_MONTH, currentMonth);
    } catch (error) {
      logFirebaseError(error, {
        error_type: ERROR_TYPE.DB,
        operation: "monthly_wrap_persist",
      });
    }
  }

  if (!yearMonth) return null;
  return (
    <ComponentErrorBoundary name="monthly-wrap">
      <MonthlyWrapCard
        yearMonth={yearMonth}
        visible
        onDismiss={handleDismiss}
      />
    </ComponentErrorBoundary>
  );
}
