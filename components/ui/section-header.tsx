import { Text } from "@/components/ui/text";

export function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <>
      <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </Text>
      {description ? (
        <Text className="-mt-1 mb-2 px-5 text-xs text-muted-foreground">
          {description}
        </Text>
      ) : null}
    </>
  );
}
