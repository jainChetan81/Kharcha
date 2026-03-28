import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Toast from "react-native-toast-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { QUERY_KEYS } from "@/lib/constants";
import { getAllSources, getCategoriesByType } from "@/lib/db";
import { cn } from "@/lib/utils";

function ChipPicker({
  items,
  selectedId,
  onSelect,
}: {
  items: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 24 }}
    >
      {items.map((item) => {
        const selected = selectedId === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item.id)}
            className={cn(
              "rounded-full px-4 py-2.5",
              selected ? "bg-primary" : "border border-border bg-card",
            )}
          >
            <Text
              className={cn(
                "text-sm font-medium capitalize",
                selected ? "text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {item.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SubscriptionForm({
  onSubmit,
}: {
  onSubmit: (value: {
    name: string;
    amount: number;
    billingDay: number;
    categoryId: number | null;
    sourceId: number | null;
  }) => Promise<void>;
}) {
  const { data: categories = [] } = useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES, "expense"],
    queryFn: () => getCategoriesByType("expense"),
  });

  const { data: sources = [] } = useQuery({
    queryKey: [QUERY_KEYS.SOURCES],
    queryFn: getAllSources,
  });

  const form = useForm({
    defaultValues: {
      name: "",
      amount: "",
      billingDay: "",
      categoryId: null as number | null,
      sourceId: null as number | null,
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name,
        amount: Number(value.amount),
        billingDay: Number(value.billingDay),
        categoryId: value.categoryId,
        sourceId: value.sourceId,
      });
    },
  });

  return (
    <ScrollView
      className="flex-1 px-5 pt-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <form.Field
        name="name"
        validators={{
          onSubmit: ({ value }) => {
            if (!value.trim()) return "Name is required";
            return undefined;
          },
        }}
      >
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Name
            </Text>
            <Input
              placeholder="e.g. Netflix, Spotify"
              value={field.state.value}
              onChangeText={(v) => field.handleChange(v)}
              placeholderTextColor="#888888"
            />
            {field.state.meta.errors.length > 0 && (
              <Text className="mt-1 text-xs text-negative">
                {field.state.meta.errors[0]}
              </Text>
            )}
          </View>
        )}
      </form.Field>

      <form.Field
        name="amount"
        validators={{
          onSubmit: ({ value }) => {
            const num = Number(value);
            if (!value || Number.isNaN(num) || num <= 0)
              return "Amount must be greater than 0";
            return undefined;
          },
        }}
      >
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Amount
            </Text>
            <Input
              placeholder="0"
              keyboardType="decimal-pad"
              value={field.state.value}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^0-9.]/g, "");
                field.handleChange(cleaned);
              }}
              className="h-14 text-2xl font-bold"
              placeholderTextColor="#888888"
            />
            {field.state.meta.errors.length > 0 && (
              <Text className="mt-1 text-xs text-negative">
                {field.state.meta.errors[0]}
              </Text>
            )}
          </View>
        )}
      </form.Field>

      <form.Field
        name="billingDay"
        validators={{
          onSubmit: ({ value }) => {
            const num = Number(value);
            if (!value || Number.isNaN(num) || num < 1 || num > 31)
              return "Day must be between 1 and 31";
            return undefined;
          },
        }}
      >
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Billing Day
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingRight: 24 }}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const selected = field.state.value === String(day);
                return (
                  <Pressable
                    key={day}
                    onPress={() => field.handleChange(String(day))}
                    className={cn(
                      "h-10 w-10 items-center justify-center rounded-full",
                      selected ? "bg-primary" : "border border-border bg-card",
                    )}
                  >
                    <Text
                      className={cn(
                        "text-sm font-medium",
                        selected
                          ? "text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {field.state.value && Number(field.state.value) >= 1 && (
              <Text className="mt-2 text-xs text-muted-foreground">
                Renews on day {field.state.value} of every month
              </Text>
            )}
            {field.state.meta.errors.length > 0 && (
              <Text className="mt-1 text-xs text-negative">
                {field.state.meta.errors[0]}
              </Text>
            )}
          </View>
        )}
      </form.Field>

      <form.Field
        name="categoryId"
        validators={{
          onSubmit: ({ value }) => {
            if (!value) return "Category is required";
            return undefined;
          },
        }}
      >
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Category
            </Text>
            <ChipPicker
              items={categories}
              selectedId={field.state.value}
              onSelect={(id) => field.handleChange(id)}
            />
            {field.state.meta.errors.length > 0 && (
              <Text className="mt-1 text-xs text-negative">
                {field.state.meta.errors[0]}
              </Text>
            )}
          </View>
        )}
      </form.Field>

      <form.Field name="sourceId">
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Source
            </Text>
            <ChipPicker
              items={sources}
              selectedId={field.state.value}
              onSelect={(id) => field.handleChange(id)}
            />
          </View>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => ({ isSubmitting: state.isSubmitting })}
      >
        {({ isSubmitting }) => (
          <Button
            className="mb-10 h-14 rounded-2xl bg-primary"
            disabled={isSubmitting}
            onPress={async () => {
              await form.handleSubmit();
              if (form.state.canSubmit === false) {
                const allErrors = Object.values(form.state.fieldMeta)
                  .flatMap((m) => (m as { errors: string[] }).errors)
                  .filter(Boolean);
                if (allErrors.length > 0) {
                  Toast.show({
                    type: "error",
                    text1: "Missing fields",
                    text2: allErrors[0] as string,
                  });
                }
              }
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-primary-foreground">
                Add Subscription
              </Text>
            )}
          </Button>
        )}
      </form.Subscribe>
    </ScrollView>
  );
}
