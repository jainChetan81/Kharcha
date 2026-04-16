import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function FormLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={cn(
        "mb-1.5 text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </Text>
  );
}
