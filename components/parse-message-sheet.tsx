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
  type GeminiParsedMessage,
  parseMessageWithGemini,
} from "@/lib/gemini/parser";
import { showErrorToast } from "@/lib/toast";

export function ParseMessageSheet({
  visible,
  onClose,
  onParsed,
  categoryNames,
}: {
  visible: boolean;
  onClose: () => void;
  onParsed: (parsed: GeminiParsedMessage, originalText: string) => void;
  categoryNames: string[];
}) {
  const [messageText, setMessageText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setMessageText("");
      setParseError(null);
    }
  }, [visible]);

  async function handleParse() {
    if (!messageText.trim() || parsing) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseMessageWithGemini(messageText, categoryNames);
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
      <Input
        multiline
        placeholder="paste your bank SMS, notification, or email text..."
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
