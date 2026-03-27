import { type ClassValue, clsx } from "clsx";
import { Platform } from "react-native";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isIOS = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";
export const isWeb = Platform.OS === "web";

export const DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm";
export const DATE_DISPLAY_FORMAT = "dd MMM yyyy, hh:mm a";
