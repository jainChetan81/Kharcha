import { Text as RNText, type TextProps } from "react-native";

export function Text({
  className,
  ...props
}: TextProps & { className?: string }) {
  return <RNText className={className} {...props} />;
}
