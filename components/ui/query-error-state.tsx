import { AlertTriangle } from "lucide-react-native";
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
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={error.message}
      inList={inList}
    />
  );
}
