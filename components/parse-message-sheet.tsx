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
}: {
  visible: boolean;
  onClose: () => void;
  onParsed: (parsed: GeminiParsedMessage, originalText: string) => void;
}) {
  const [messageText, setMessageText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMessageText("");
      setParseError(false);
    }
  }, [visible]);

  async function handleParse() {
    if (!messageText.trim() || parsing) return;
    setParsing(true);
    setParseError(false);
    try {
      const result = await parseMessageWithGemini(messageText);
      if (result.error === GEMINI_ERROR.SERVICE_UNAVAILABLE) {
        setParsing(false);
        showErrorToast("AI is busy right now, try again in a moment");
        return;
      }
      if (result.error === GEMINI_ERROR.RATE_LIMITED) {
        setParsing(false);
        showErrorToast(
          "AI quota exhausted",
          "rate limit hit, try again in a minute",
        );
        return;
      }
      if (result.error === GEMINI_ERROR.TIMEOUT) {
        setParsing(false);
        showErrorToast("Gemini timed out, try again");
        return;
      }
      if (result.error === GEMINI_ERROR.TRUNCATED) {
        setParsing(false);
        showErrorToast("Message too long, try a shorter snippet");
        return;
      }
      if (!result.parsed) {
        setParseError(true);
        setParsing(false);
        return;
      }
      setParsing(false);
      onParsed(result.parsed, messageText);
    } catch (err) {
      setParsing(false);
      setParseError(true);
      showErrorToast("Parse failed", err);
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
          if (parseError) setParseError(false);
        }}
        className="h-[120px] py-3"
        textAlignVertical="top"
        placeholderTextColor={COLORS.MUTED}
      />
      {parseError && (
        <Text className="mt-2 text-sm text-[#ef4444]">
          could not parse this message
        </Text>
      )}
      <Button
        className="mt-4 h-12 w-full rounded-xl bg-[#7c3aed]"
        onPress={handleParse}
        disabled={parsing || !messageText.trim()}
      >
        {parsing ? (
          <ActivityIndicator color={COLORS.WHITE} />
        ) : (
          <Text className="text-base font-semibold text-white">Parse</Text>
        )}
      </Button>
    </BottomSheet>
  );
}
