import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { COLORS, GEMINI_ERROR } from "@/lib/constants";
import {
  type GeminiParsedTransaction,
  parseWithGemini,
} from "@/lib/gemini/client";
import { parseMessage } from "@/lib/parsers";
import { showErrorToast } from "@/lib/toast";

const PLACEHOLDER_EXAMPLE =
  "Amount Debited: INR 250.00 From A/c: XX0532 Date & Time: 15-04-26, 14:30:00 Transaction Info: UPI/P2M/Swiggy";

export function ParseMessageSheet({
  visible,
  onClose,
  onParsed,
  categoryNames,
  defaultText,
}: {
  visible: boolean;
  onClose: () => void;
  onParsed: (parsed: GeminiParsedTransaction, originalText: string) => void;
  categoryNames: string[];
  /** Pre-fills the textarea on open — used by iOS Share Sheet handoff. */
  defaultText?: string;
}) {
  const [messageText, setMessageText] = useState(defaultText ?? "");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setMessageText(defaultText ?? "");
      setParseError(null);
    } else {
      setMessageText("");
      setParseError(null);
    }
  }, [visible, defaultText]);

  async function handleParse() {
    if (!messageText.trim() || parsing) return;
    setParsing(true);
    setParseError(null);
    try {
      // Try local regex parsers first (instant, no network)
      const local = parseMessage(messageText);
      if (local) {
        onParsed(
          {
            amount: local.amount,
            type: local.type,
            date: local.date,
            merchant: local.merchant,
            category: "Other",
            is_subscription: false,
            billing_day: null,
            confidence: "high",
          },
          messageText,
        );
        return;
      }

      // Fall back to Gemini AI parsing
      const result = await parseWithGemini(messageText, categoryNames);
      if (result.error === GEMINI_ERROR.SERVICE_UNAVAILABLE) {
        showErrorToast("AI is busy right now, try again in a moment");
        return;
      }
      if (result.error === GEMINI_ERROR.RATE_LIMITED) {
        showErrorToast(
          "AI quota exhausted",
          "rate limit hit, try again in a minute",
        );
        return;
      }
      if (result.error === GEMINI_ERROR.TIMEOUT) {
        showErrorToast("Gemini timed out, try again");
        return;
      }
      if (result.error === GEMINI_ERROR.TRUNCATED) {
        showErrorToast("Message too long, try a shorter snippet");
        return;
      }
      if (result.error === GEMINI_ERROR.UNKNOWN) {
        showErrorToast(
          "Gemini error",
          result.errorMessage ?? "unknown failure",
        );
        return;
      }
      if (!result.parsed) {
        setParseError(result.errorMessage ?? "could not parse this message");
        return;
      }
      onParsed(result.parsed, messageText);
    } catch (err) {
      setParseError(
        (err as { message?: string } | null)?.message ?? String(err),
      );
      showErrorToast("Parse failed", err);
    } finally {
      setParsing(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-base font-bold text-foreground">
          Parse Message
        </Text>
        <Pressable onPress={onClose} className="p-1" hitSlop={8}>
          <Icon as={X} className="size-5 text-muted-foreground" />
        </Pressable>
      </View>
      <Text className="mb-3 text-xs text-muted-foreground">
        Paste a bank SMS or notification below and we'll auto-fill the amount,
        merchant, and date for you.
      </Text>
      <Input
        multiline
        placeholder={PLACEHOLDER_EXAMPLE}
        value={messageText}
        onChangeText={(v) => {
          setMessageText(v);
          if (parseError) setParseError(null);
        }}
        className="h-[120px] py-3"
        textAlignVertical="top"
        placeholderTextColor={COLORS.MUTED}
      />
      {parseError && (
        <Text className="mt-2 text-sm text-destructive">{parseError}</Text>
      )}
      <Button
        className="mt-4 h-12 w-full rounded-xl bg-primary"
        onPress={handleParse}
        disabled={parsing || !messageText.trim()}
      >
        {parsing ? (
          <ActivityIndicator color={COLORS.WHITE} />
        ) : (
          <Text className="text-base font-semibold text-primary-foreground">
            Parse
          </Text>
        )}
      </Button>
    </BottomSheet>
  );
}
