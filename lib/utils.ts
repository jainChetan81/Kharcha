import { type ClassValue, clsx } from "clsx";
import { Platform, type RefreshControlProps } from "react-native";
import { twMerge } from "tailwind-merge";
import { COLORS } from "@/lib/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isIOS = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";

export function getRefreshControlProps(
  refreshing: boolean,
  onRefresh: () => void,
): RefreshControlProps {
  return {
    refreshing,
    onRefresh,
    tintColor: COLORS.PRIMARY,
    progressViewOffset: 40,
  };
}
