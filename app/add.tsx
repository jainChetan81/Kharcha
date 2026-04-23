import { router } from "expo-router";
import { Sparkles, X } from "lucide-react-native";
import { lazy, Suspense } from "react";
import { KeyboardAvoidingView, Pressable, Switch, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { SubscriptionForm } from "@/components/subscription-form";
import { TransactionForm } from "@/components/transaction-form";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAddTransaction } from "@/hooks/use-add-transaction";
import { COLORS } from "@/lib/constants";
import { cn, isIOS } from "@/lib/utils";

const DuplicateTransactionSheet = lazy(() =>
  import("@/components/duplicate-transaction-sheet").then((m) => ({
    default: m.DuplicateTransactionSheet,
  })),
);

const ParseMessageSheet = lazy(() =>
  import("@/components/parse-message-sheet").then((m) => ({
    default: m.ParseMessageSheet,
  })),
);

export default function AddTransaction() {
  const {
    isSubscription,
    toggleSubscription,
    formKey,
    upiSourceId,
    transactionDefaults,
    subscriptionDefaults,
    hintDismissed,
    dismissHint,
    openParseSheet,
    onTransactionSubmit,
    onSubscriptionSubmit,
    dupSheetVisible,
    dupSheetAmountFormatted,
    dupSheetMerchant,
    dupSheetDate,
    onDupCancel,
    onDupConfirm,
    parseSheetVisible,
    closeParseSheet,
    onParsed,
    categoryNames,
  } = useAddTransaction();

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-3",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="py-1 pr-4">
          <Text className="text-base font-semibold text-primary">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-bold text-foreground">
          {isSubscription ? "Add Subscription" : "Add Transaction"}
        </Text>
        <Pressable
          onPress={openParseSheet}
          className="flex-row items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5"
          hitSlop={8}
        >
          <Icon as={Sparkles} className="size-4 text-primary" />
          <Text className="text-xs font-semibold text-primary">AI Parse</Text>
        </Pressable>
      </View>

      {!hintDismissed && (
        <Pressable
          onPress={openParseSheet}
          className="mx-5 mb-3 flex-row items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3"
        >
          <Icon as={Sparkles} className="size-4 text-primary" />
          <Text className="flex-1 text-xs font-medium text-foreground">
            Got a bank SMS or email? Tap{" "}
            <Text className="font-bold text-primary">AI Parse</Text> to
            auto-fill this form.
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              dismissHint();
            }}
            hitSlop={10}
          >
            <Icon as={X} className="size-4 text-muted-foreground" />
          </Pressable>
        </Pressable>
      )}

      <View className="mx-5 mb-3 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
        <Text className="text-sm font-medium text-foreground">
          Subscription
        </Text>
        <Switch
          value={isSubscription}
          onValueChange={toggleSubscription}
          trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
          thumbColor={COLORS.FOREGROUND}
        />
      </View>

      {isSubscription ? (
        <SubscriptionForm
          key={`sub-${formKey}`}
          defaultValues={subscriptionDefaults}
          onSubmit={onSubscriptionSubmit}
        />
      ) : (
        <TransactionForm
          key={`tx-${formKey}-${upiSourceId}`}
          defaultValues={transactionDefaults}
          submitLabel="Add Transaction"
          onSubmit={onTransactionSubmit}
        />
      )}

      <Suspense fallback={null}>
        <DuplicateTransactionSheet
          visible={dupSheetVisible}
          amount={dupSheetAmountFormatted}
          merchant={dupSheetMerchant}
          date={dupSheetDate}
          onCancel={onDupCancel}
          onConfirm={onDupConfirm}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ParseMessageSheet
          visible={parseSheetVisible}
          onClose={closeParseSheet}
          onParsed={onParsed}
          categoryNames={categoryNames}
        />
      </Suspense>
    </KeyboardAvoidingView>
  );
}

export const ErrorBoundary = ScreenError;
