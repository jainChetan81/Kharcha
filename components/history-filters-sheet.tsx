import { format, parse } from "date-fns";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ChipPicker, MultiChipPicker } from "@/components/ui/chip-picker";
import { DatePickerModal } from "@/components/ui/date-picker-modal";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  COLORS,
  DATE_FORMAT,
  DATE_ISO_FORMAT,
  PERIOD_PRESET,
  type PeriodPresetType,
  REIMBURSEMENT_FILTER,
  type ReimbursementFilterType,
  SHEET_MAX_HEIGHT_FRACTION,
  SOURCE_TYPE,
  type SourceFilterType,
  TRANSACTION_TYPE,
  type TransactionFilterType,
} from "@/lib/constants";
import { getPresetRange } from "@/lib/date";
import type { Category, Source, Tag } from "@/lib/db";
import { cn, isIOS } from "@/lib/utils";

const TYPE_FILTERS = Object.values(TRANSACTION_TYPE);
const SOURCE_TYPE_FILTERS = Object.values(SOURCE_TYPE);
const REIMBURSEMENT_FILTERS = Object.values(REIMBURSEMENT_FILTER);

const REIMBURSEMENT_LABELS: Record<ReimbursementFilterType, string> = {
  [REIMBURSEMENT_FILTER.ALL]: "All",
  [REIMBURSEMENT_FILTER.PENDING]: "Pending",
  [REIMBURSEMENT_FILTER.REIMBURSED]: "Reimbursed",
};

const PRESET_LABELS: Record<PeriodPresetType, string> = {
  [PERIOD_PRESET.TODAY]: "Today",
  [PERIOD_PRESET.THIS_WEEK]: "This Week",
  [PERIOD_PRESET.LAST_7_DAYS]: "Last 7 Days",
  [PERIOD_PRESET.THIS_MONTH]: "This Month",
  [PERIOD_PRESET.LAST_MONTH]: "Last Month",
  [PERIOD_PRESET.THIS_YEAR]: "This Year",
  [PERIOD_PRESET.CUSTOM]: "Custom",
};

interface HistoryFiltersSheetProps {
  visible: boolean;
  onClose: () => void;
  draftType: TransactionFilterType;
  onDraftTypeChange: (type: TransactionFilterType) => void;
  draftCategoryId: number | null;
  onDraftCategoryIdChange: (id: number | null) => void;
  draftSourceId: number | null;
  onDraftSourceIdChange: (id: number | null) => void;
  draftSourceType: SourceFilterType;
  onDraftSourceTypeChange: (type: SourceFilterType) => void;
  draftPreset: PeriodPresetType | null;
  onDraftPresetChange: (preset: PeriodPresetType | null) => void;
  draftDateFrom: string | null;
  onDraftDateFromChange: (date: string | null) => void;
  draftDateTo: string | null;
  onDraftDateToChange: (date: string | null) => void;
  draftAmountMin: string;
  onDraftAmountMinChange: (amount: string) => void;
  draftAmountMax: string;
  onDraftAmountMaxChange: (amount: string) => void;
  draftReimbursement: ReimbursementFilterType;
  onDraftReimbursementChange: (filter: ReimbursementFilterType) => void;
  draftTagIds: number[];
  onDraftTagIdsChange: (ids: number[]) => void;
  categories: Category[];
  sources: Source[];
  allTags: Tag[];
  onApplyFilters: () => void;
  onClearAllFilters: () => void;
  draftHasFilters: boolean;
}

export default function HistoryFiltersSheet({
  visible,
  onClose,
  draftType,
  onDraftTypeChange,
  draftCategoryId,
  onDraftCategoryIdChange,
  draftSourceId,
  onDraftSourceIdChange,
  draftSourceType,
  onDraftSourceTypeChange,
  draftPreset,
  onDraftPresetChange,
  draftDateFrom,
  onDraftDateFromChange,
  draftDateTo,
  onDraftDateToChange,
  draftAmountMin,
  onDraftAmountMinChange,
  draftAmountMax,
  onDraftAmountMaxChange,
  draftReimbursement,
  onDraftReimbursementChange,
  draftTagIds,
  onDraftTagIdsChange,
  categories,
  sources,
  allTags,
  onApplyFilters,
  onClearAllFilters,
  draftHasFilters,
}: HistoryFiltersSheetProps) {
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const { height: windowHeight } = useWindowDimensions();

  function handlePresetSelect(preset: PeriodPresetType) {
    if (preset === draftPreset) {
      onDraftPresetChange(null);
      onDraftDateFromChange(null);
      onDraftDateToChange(null);
      return;
    }
    onDraftPresetChange(preset);
    if (preset !== PERIOD_PRESET.CUSTOM) {
      const range = getPresetRange(preset);
      onDraftDateFromChange(range.from);
      onDraftDateToChange(range.to);
    }
  }

  // Hide BottomSheet while a DatePickerModal is open — RN can't reliably stack two Modals.
  const pickerOpen = showFromPicker || showToPicker;

  return (
    <>
      <BottomSheet
        visible={visible && !pickerOpen}
        onClose={onClose}
        avoidKeyboard
      >
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-base font-bold text-foreground">Filters</Text>
          {draftHasFilters && (
            <Pressable
              accessibilityRole="button"
              onPress={onClearAllFilters}
              className="rounded-xl border border-border px-4 py-2"
            >
              <Text className="text-sm font-medium text-negative-text">
                Clear All
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          style={{ maxHeight: windowHeight * SHEET_MAX_HEIGHT_FRACTION }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Type
          </Text>
          <View className="mb-5 flex-row gap-2">
            {TYPE_FILTERS.map((f) => (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: draftType === f }}
                onPress={() => onDraftTypeChange(f)}
                className={cn(
                  "flex-1 items-center rounded-xl py-2.5",
                  draftType === f ? "bg-primary" : "bg-muted",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium capitalize",
                    draftType === f
                      ? "text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>

          {draftType !== TRANSACTION_TYPE.TRANSFER &&
            draftType !== TRANSACTION_TYPE.INVESTMENT && (
              <>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Category
                </Text>
                <View className="mb-5">
                  <ChipPicker
                    items={categories}
                    selectedId={draftCategoryId}
                    onSelect={onDraftCategoryIdChange}
                    allLabel="All Categories"
                  />
                </View>
              </>
            )}

          {draftType !== TRANSACTION_TYPE.INCOME &&
            draftType !== TRANSACTION_TYPE.TRANSFER && (
              <>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment Source
                </Text>
                <View className="mb-5">
                  <ChipPicker
                    items={sources}
                    selectedId={draftSourceId}
                    onSelect={onDraftSourceIdChange}
                    allLabel="All Sources"
                  />
                </View>
              </>
            )}

          {allTags.length > 0 && (
            <>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tags
              </Text>
              <View className="mb-5">
                <MultiChipPicker
                  items={allTags}
                  selectedIds={draftTagIds}
                  onChange={onDraftTagIdsChange}
                  addLabel="New tag"
                />
              </View>
            </>
          )}

          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Source Type
          </Text>
          <View className="mb-5 flex-row gap-2">
            {SOURCE_TYPE_FILTERS.map((f) => (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: draftSourceType === f }}
                onPress={() => onDraftSourceTypeChange(f)}
                className={cn(
                  "flex-1 items-center rounded-xl py-2.5",
                  draftSourceType === f ? "bg-primary" : "bg-muted",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium capitalize",
                    draftSourceType === f
                      ? "text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Period
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-3"
            contentContainerStyle={{ gap: 8, paddingRight: 24 }}
          >
            {Object.values(PERIOD_PRESET).map((p) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityState={{ selected: draftPreset === p }}
                onPress={() => handlePresetSelect(p)}
                className={cn(
                  "rounded-full px-4 py-2.5",
                  draftPreset === p
                    ? "bg-primary"
                    : "border border-border bg-card",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium",
                    draftPreset === p
                      ? "text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {PRESET_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {draftPreset === PERIOD_PRESET.CUSTOM && (
            <View className="mb-3 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowFromPicker(true)}
                className="flex-1 rounded-xl bg-muted px-4 py-3"
              >
                <Text className="text-xs text-muted-foreground">From</Text>
                <Text className="text-sm font-medium text-foreground">
                  {draftDateFrom
                    ? format(
                        parse(draftDateFrom, DATE_ISO_FORMAT, new Date()),
                        DATE_FORMAT,
                      )
                    : "Select"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowToPicker(true)}
                className="flex-1 rounded-xl bg-muted px-4 py-3"
              >
                <Text className="text-xs text-muted-foreground">To</Text>
                <Text className="text-sm font-medium text-foreground">
                  {draftDateTo
                    ? format(
                        parse(draftDateTo, DATE_ISO_FORMAT, new Date()),
                        DATE_FORMAT,
                      )
                    : "Select"}
                </Text>
              </Pressable>
            </View>
          )}

          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reimbursement
          </Text>
          <View className="mb-5 flex-row gap-2">
            {REIMBURSEMENT_FILTERS.map((f) => (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: draftReimbursement === f }}
                onPress={() => onDraftReimbursementChange(f)}
                className={cn(
                  "flex-1 items-center rounded-xl py-2.5",
                  draftReimbursement === f ? "bg-primary" : "bg-muted",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium",
                    draftReimbursement === f
                      ? "text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {REIMBURSEMENT_LABELS[f]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Amount
          </Text>
          <View className="mb-5 flex-row gap-3">
            <Input
              accessibilityLabel="Minimum amount"
              placeholder="Min ₹"
              placeholderTextColor={COLORS.MUTED}
              keyboardType="decimal-pad"
              value={draftAmountMin}
              onChangeText={onDraftAmountMinChange}
              className="flex-1"
            />
            <Input
              accessibilityLabel="Maximum amount"
              placeholder="Max ₹"
              placeholderTextColor={COLORS.MUTED}
              keyboardType="decimal-pad"
              value={draftAmountMax}
              onChangeText={onDraftAmountMaxChange}
              className="flex-1"
            />
          </View>
        </ScrollView>

        <View className={cn("mt-4 flex-row gap-3", isIOS && "mb-6")}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="h-14 flex-1 items-center justify-center rounded-xl border border-border"
          >
            <Text className="text-sm font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Button
            className="h-14 flex-1 rounded-2xl bg-primary"
            onPress={onApplyFilters}
          >
            <Text className="text-base font-semibold text-primary-foreground">
              Apply
            </Text>
          </Button>
        </View>
      </BottomSheet>

      <DatePickerModal
        visible={showFromPicker}
        value={
          draftDateFrom
            ? parse(draftDateFrom, DATE_ISO_FORMAT, new Date())
            : new Date()
        }
        title="From Date"
        onConfirm={(date) => {
          setShowFromPicker(false);
          onDraftDateFromChange(format(date, DATE_ISO_FORMAT));
        }}
        onCancel={() => setShowFromPicker(false)}
        onClear={() => {
          setShowFromPicker(false);
          onDraftDateFromChange(null);
        }}
      />
      <DatePickerModal
        visible={showToPicker}
        value={
          draftDateTo
            ? parse(draftDateTo, DATE_ISO_FORMAT, new Date())
            : new Date()
        }
        title="To Date"
        onConfirm={(date) => {
          setShowToPicker(false);
          onDraftDateToChange(format(date, DATE_ISO_FORMAT));
        }}
        onCancel={() => setShowToPicker(false)}
        onClear={() => {
          setShowToPicker(false);
          onDraftDateToChange(null);
        }}
      />
    </>
  );
}
