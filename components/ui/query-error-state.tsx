import { AlertTriangle } from "lucide-react-native";
import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import { EmptyState } from "@/components/ui/empty-state";

export function QueryErrorState({
  title,
  error,
  inList = false,
}: {
  title: string;
  error: Error;
  inList?: boolean;
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
    />
  );
}
