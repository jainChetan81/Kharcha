import { AlertTriangle } from "lucide-react-native";
import { useEffect } from "react";
import { AccessibilityInfo, Pressable } from "react-native";
import { EmptyState } from "@/components/ui/empty-state";
import { Text } from "@/components/ui/text";

export function QueryErrorState({
  title,
  error,
  inList = false,
  onRetry,
}: {
  title: string;
  error: Error;
  inList?: boolean;
  onRetry?: () => void;
}) {
  // VoiceOver won't notice the list silently swap to an error state, so speak
  // the failure when it mounts.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${error.message}`);
  }, [title, error.message]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={error.message}
      inList={inList}
    >
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text className="text-sm font-medium text-primary-text">
            Try again
          </Text>
        </Pressable>
      ) : undefined}
    </EmptyState>
  );
}
