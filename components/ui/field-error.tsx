import { Text } from "@/components/ui/text";

export function FieldError({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return <Text className="mt-1 text-xs text-negative-text">{errors[0]}</Text>;
}
