import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function ScreenDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={cn("px-5 pb-3 pt-2 text-xs text-muted-foreground", className)}
    >
      {children}
    </Text>
  );
}
