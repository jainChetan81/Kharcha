import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenDescription } from "@/components/ui/screen-description";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { CURRENCIES, type CurrencyCode, useConfig } from "@/hooks/use-config";
import { SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { showErrorToast } from "@/lib/toast";

export default function CurrencyScreen() {
  const { currency, updateCurrency } = useConfig();

  const handleSelect = async (code: CurrencyCode) => {
    if (code === currency) {
      router.back();
      return;
    }
    try {
      await updateCurrency(code);
      router.back();
    } catch (err) {
      showErrorToast("Could not change currency", err);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Currency" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <ScreenDescription>
          The currency used across the app — symbol, formatting, and exports.
          Applies to every transaction, old and new.
        </ScreenDescription>

        {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => {
          const selected = currency === code;
          return (
            <Pressable
              key={code}
              onPress={() => handleSelect(code)}
              className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
            >
              <View className="mr-3 size-9 items-center justify-center rounded-full bg-muted">
                <Text className="text-base font-bold text-foreground">
                  {CURRENCIES[code].symbol}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">
                  {code}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {CURRENCIES[code].name}
                </Text>
              </View>
              {selected && <Icon as={Check} className="size-4 text-primary" />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const ErrorBoundary = ScreenError;
