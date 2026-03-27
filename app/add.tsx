import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { router } from "expo-router";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import db, { type Category, insertTransaction, type Source } from "@/lib/db";

function FieldError({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return <Text className="mt-1 text-xs text-red-500">{errors[0]}</Text>;
}

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
      contentContainerStyle={{ gap: 8 }}
    >
      {items.map((item) => {
        const selected = selectedId === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item.id)}
            className={`rounded-full px-4 py-2.5 ${selected ? "bg-indigo-500" : "border border-slate-200 bg-white"}`}
          >
            <Text
              className={`text-sm font-medium capitalize ${selected ? "text-white" : "text-slate-600"}`}
            >
              {item.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function AddTransaction() {
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => db.getAllAsync<Category>("SELECT * FROM categories"),
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["sources"],
    queryFn: () => db.getAllAsync<Source>("SELECT * FROM sources"),
  });

  const form = useForm({
    defaultValues: {
      type: "expense" as "income" | "expense",
      amount: "",
      merchant: "",
      categoryId: null as number | null,
      sourceId: null as number | null,
      date: format(new Date(), "yyyy-MM-dd"),
      note: "",
    },
    onSubmit: async ({ value }) => {
      await insertTransaction({
        type: value.type,
        amount: Number(value.amount),
        merchant: value.merchant || null,
        categoryId: value.categoryId,
        sourceId: value.sourceId,
        date: value.date,
        note: value.note || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
      router.back();
    },
  });

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between bg-slate-900 px-6 pb-5"
        style={{ paddingTop: Platform.OS === "ios" ? 60 : 48 }}
      >
        <Pressable onPress={() => router.back()}>
          <Text className="text-base font-medium text-indigo-400">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-bold text-white">Add Transaction</Text>
        <View className="w-14" />
      </View>

      <ScrollView
        className="flex-1 px-5 pt-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type Toggle */}
        <form.Field name="type">
          {(field) => (
            <View className="mb-5 flex-row gap-3">
              <Pressable
                onPress={() => field.handleChange("expense")}
                className={`flex-1 items-center rounded-xl py-3 ${field.state.value === "expense" ? "bg-red-500" : "border border-slate-200 bg-white"}`}
              >
                <Text
                  className={`text-sm font-semibold ${field.state.value === "expense" ? "text-white" : "text-slate-500"}`}
                >
                  Expense
                </Text>
              </Pressable>
              <Pressable
                onPress={() => field.handleChange("income")}
                className={`flex-1 items-center rounded-xl py-3 ${field.state.value === "income" ? "bg-green-600" : "border border-slate-200 bg-white"}`}
              >
                <Text
                  className={`text-sm font-semibold ${field.state.value === "income" ? "text-white" : "text-slate-500"}`}
                >
                  Income
                </Text>
              </Pressable>
            </View>
          )}
        </form.Field>

        {/* Amount */}
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
              <Text className="mb-1.5 text-sm font-medium text-slate-700">
                Amount
              </Text>
              <Input
                placeholder="0"
                keyboardType="numeric"
                value={field.state.value}
                onChangeText={(v) => field.handleChange(v)}
                className="h-14 text-2xl font-bold"
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          )}
        </form.Field>

        {/* Merchant */}
        <form.Field name="merchant">
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-slate-700">
                Merchant
              </Text>
              <Input
                placeholder="e.g. Swiggy, Amazon"
                value={field.state.value}
                onChangeText={(v) => field.handleChange(v)}
              />
            </View>
          )}
        </form.Field>

        {/* Category */}
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
              <Text className="mb-1.5 text-sm font-medium text-slate-700">
                Category
              </Text>
              <ChipPicker
                items={categories}
                selectedId={field.state.value}
                onSelect={(id) => field.handleChange(id)}
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          )}
        </form.Field>

        {/* Source */}
        <form.Field
          name="sourceId"
          validators={{
            onSubmit: ({ value }) => {
              if (!value) return "Source is required";
              return undefined;
            },
          }}
        >
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-slate-700">
                Source
              </Text>
              <ChipPicker
                items={sources}
                selectedId={field.state.value}
                onSelect={(id) => field.handleChange(id)}
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          )}
        </form.Field>

        {/* Date */}
        <form.Field
          name="date"
          validators={{
            onSubmit: ({ value }) => {
              if (!value) return "Date is required";
              if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
                return "Use YYYY-MM-DD format";
              return undefined;
            },
          }}
        >
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-slate-700">
                Date
              </Text>
              <Input
                placeholder="YYYY-MM-DD"
                value={field.state.value}
                onChangeText={(v) => field.handleChange(v)}
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          )}
        </form.Field>

        {/* Note */}
        <form.Field name="note">
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-slate-700">
                Note
              </Text>
              <Input
                placeholder="Optional note"
                multiline
                numberOfLines={3}
                value={field.state.value}
                onChangeText={(v) => field.handleChange(v)}
                className="h-20 py-2"
                textAlignVertical="top"
              />
            </View>
          )}
        </form.Field>

        {/* Submit */}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              className="mb-10 h-12 rounded-xl bg-indigo-500"
              disabled={isSubmitting}
              onPress={() => form.handleSubmit()}
            >
              <Text className="text-base font-semibold text-white">
                {isSubmitting ? "Saving..." : "Add Transaction"}
              </Text>
            </Button>
          )}
        </form.Subscribe>
      </ScrollView>
    </View>
  );
}
