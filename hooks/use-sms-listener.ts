import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import * as SmsListener from "sms-notification-listener";
import {
  PARSED_BY,
  QUERY_KEYS,
  SMS_LISTENER_NOTE,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { findDuplicateTransaction, insertTransaction } from "@/lib/db";
import { ERROR_TYPE, logFirebaseError } from "@/lib/firebase";
import { parseMessage } from "@/lib/parsers";
import { showSuccessToast } from "@/lib/toast";

export function useSmsListenerStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [QUERY_KEYS.SMS_LISTENER_STATUS],
    queryFn: () => ({
      granted: SmsListener.isNotificationAccessGranted(),
      enabled: SmsListener.isListenerEnabled(),
    }),
    staleTime: 0,
  });

  // Returning from system settings doesn't fire window-focus on RN, so refetch
  // when the app comes back to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.SMS_LISTENER_STATUS],
        });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  return query;
}

export function useOpenNotificationAccessSettings() {
  return () => SmsListener.openNotificationAccessSettings();
}

type DrainResult = {
  processed: number;
  inserted: number;
  skipped: number;
};

export async function drainSmsListenerQueue(): Promise<DrainResult> {
  const entries = SmsListener.readQueue();
  if (entries.length === 0) {
    return { processed: 0, inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    const parsed = parseMessage(entry.text);
    if (!parsed) {
      // Surface unparsed bank SMS as a Firebase signal so we can widen the
      // regex parsers when a real sender slips through. Silent skipping
      // made the failure invisible.
      logFirebaseError(new Error("SMS regex parser matched no pattern"), {
        error_type: ERROR_TYPE.SMS_PARSE,
        operation: "sms_listener_parse",
        sender: entry.sender,
        text_preview: entry.text.slice(0, 80),
      });
      skipped++;
      continue;
    }

    const merchant = parsed.merchant.trim();
    const date = `${parsed.date} 12:00`;

    if (merchant) {
      const isDup = await findDuplicateTransaction(
        date,
        parsed.amount,
        merchant,
      );
      if (isDup) {
        skipped++;
        continue;
      }
    }

    try {
      await insertTransaction({
        type:
          parsed.type === "income"
            ? TRANSACTION_TYPE.INCOME
            : TRANSACTION_TYPE.EXPENSE,
        amount: parsed.amount,
        merchant: merchant || null,
        categoryId: null,
        sourceId: null,
        parsedBy: PARSED_BY.REGEX,
        date,
        note: `${SMS_LISTENER_NOTE}\n\n${entry.text}`,
      });
      inserted++;
    } catch (error) {
      logFirebaseError(error, {
        error_type: ERROR_TYPE.DB,
        operation: "sms_listener_insert",
        sender: entry.sender,
      });
      skipped++;
    }
  }

  // Edge case: a notification arriving between readQueue() and clearQueue()
  // will be wiped without being processed. The native module doesn't expose a
  // timestamp-scoped clear yet; retry happens on next notification/launch.
  SmsListener.clearQueue();

  return { processed: entries.length, inserted, skipped };
}

function invalidateIfInserted(queryClient: QueryClient, result: DrainResult) {
  if (result.inserted === 0) return;
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTIONS] });
  queryClient.invalidateQueries({
    queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
  });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MONTHLY_SUMMARY] });
}

// For use outside React components (e.g. AppState listener in _layout).
// Runs drain, invalidates queries, and toasts only if new transactions
// were inserted.
export async function runSmsListenerDrain(queryClient: QueryClient) {
  try {
    const result = await drainSmsListenerQueue();
    invalidateIfInserted(queryClient, result);
    if (result.inserted > 0) {
      showSuccessToast(
        `${result.inserted} transaction${result.inserted > 1 ? "s" : ""} captured`,
        "Auto-synced from SMS notifications",
      );
    }
  } catch (error) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.SYNC,
      operation: "sms_listener_drain",
    });
  }
}
