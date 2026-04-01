import { Text } from "@/components/ui/text";

export function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </Text>
  );
}
