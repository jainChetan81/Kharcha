import { format, parseISO } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useAllCategories, useCategoriesByType } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { useDebounce } from "@/hooks/use-debounce";
import { useAllSources } from "@/hooks/use-sources";
import { useAllTags } from "@/hooks/use-tags";
import {
  useFilteredInsights,
  useTransactionsPaginated,
} from "@/hooks/use-transactions";
import {
  CATEGORY_SLUG,
  PERIOD_PRESET,
  type PeriodPresetType,
  REIMBURSEMENT_FILTER,
  type ReimbursementFilterType,
  SOURCE_TYPE,
  type SourceFilterType,
  TRANSACTION_TYPE,
  type TransactionFilterType,
} from "@/lib/constants";
import { getPresetRange } from "@/lib/date";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";

export type AppliedFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateRange(from: string | null, to: string | null): string {
  const fmtIso = (iso: string) => format(parseISO(iso), "d MMM");
  if (from && to) return `${fmtIso(from)} – ${fmtIso(to)}`;
  if (from) return `from ${fmtIso(from)}`;
  if (to) return `to ${fmtIso(to)}`;
  return "Date";
}

export function useHistoryFilters() {
  const params = useLocalSearchParams<{
    filter?: string;
    category_id?: string;
    source_type?: string;
    preset?: string;
    amount_min?: string;
    amount_max?: string;
    reimbursement?: string;
    tag_id?: string;
    merchant?: string;
    month?: string;
  }>();

  // Applied filters
  const [typeFilter, setTypeFilter] = useState<TransactionFilterType>(
    TRANSACTION_TYPE.ALL,
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceFilterType>(
    SOURCE_TYPE.ALL,
  );
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetType | null>(
    null,
  );
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [amountMin, setAmountMin] = useState<number | null>(null);
  const [amountMax, setAmountMax] = useState<number | null>(null);
  const [reimbursementFilter, setReimbursementFilter] =
    useState<ReimbursementFilterType>(REIMBURSEMENT_FILTER.ALL);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [merchant, setMerchant] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);

  const { data: allCategories = [] } = useAllCategories();
  const { data: allSources = [] } = useAllSources();
  const { data: allTags = [] } = useAllTags();
  const { format: fmt } = useCurrency();

  // Draft filters (inside modal)
  const [showFilters, setShowFilters] = useState(false);
  const [draftType, setDraftType] = useState<TransactionFilterType>(
    TRANSACTION_TYPE.ALL,
  );
  const [draftCategoryId, setDraftCategoryId] = useState<number | null>(null);
  const [draftSourceId, setDraftSourceId] = useState<number | null>(null);
  const [draftSourceType, setDraftSourceType] = useState<SourceFilterType>(
    SOURCE_TYPE.ALL,
  );
  const [draftPreset, setDraftPreset] = useState<PeriodPresetType | null>(null);
  const [draftDateFrom, setDraftDateFrom] = useState<string | null>(null);
  const [draftDateTo, setDraftDateTo] = useState<string | null>(null);
  const [draftAmountMin, setDraftAmountMin] = useState("");
  const [draftAmountMax, setDraftAmountMax] = useState("");
  const [draftReimbursement, setDraftReimbursement] =
    useState<ReimbursementFilterType>(REIMBURSEMENT_FILTER.ALL);
  const [draftTagIds, setDraftTagIds] = useState<number[]>([]);

  useEffect(() => {
    if (
      params.filter === TRANSACTION_TYPE.INCOME ||
      params.filter === TRANSACTION_TYPE.EXPENSE ||
      params.filter === TRANSACTION_TYPE.TRANSFER
    ) {
      setTypeFilter(params.filter);
    }
    if (params.category_id && params.category_id !== CATEGORY_SLUG.OTHER) {
      const parsed = Number(params.category_id);
      if (!Number.isNaN(parsed)) setCategoryId(parsed);
    }
    if (
      params.source_type === SOURCE_TYPE.MANUAL ||
      params.source_type === SOURCE_TYPE.SYNCED ||
      params.source_type === SOURCE_TYPE.MINI_SYNCED ||
      params.source_type === SOURCE_TYPE.RECURRING ||
      params.source_type === SOURCE_TYPE.TRANSFER
    ) {
      setSourceTypeFilter(params.source_type);
    }
    if (params.preset) {
      const p = params.preset as PeriodPresetType;
      if (Object.values(PERIOD_PRESET).includes(p)) {
        setPeriodPreset(p);
        if (p !== PERIOD_PRESET.CUSTOM) {
          const range = getPresetRange(p);
          setDateFrom(range.from);
          setDateTo(range.to);
        }
      }
    }
    if (params.amount_min) {
      const parsed = Number(params.amount_min);
      if (!Number.isNaN(parsed)) setAmountMin(parsed);
    }
    if (params.amount_max) {
      const parsed = Number(params.amount_max);
      if (!Number.isNaN(parsed)) setAmountMax(parsed);
    }
    if (
      params.reimbursement === REIMBURSEMENT_FILTER.PENDING ||
      params.reimbursement === REIMBURSEMENT_FILTER.REIMBURSED
    ) {
      setReimbursementFilter(params.reimbursement);
    }
    if (params.tag_id) {
      const parsed = Number(params.tag_id);
      if (!Number.isNaN(parsed)) setTagIds([parsed]);
    }
    if (params.merchant) {
      setMerchant(params.merchant);
    }
    if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
      const [y, m] = params.month.split("-").map(Number);
      const from = `${params.month}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const to = `${params.month}-${String(lastDay).padStart(2, "0")}`;
      setDateFrom(from);
      setDateTo(to);
      setPeriodPreset(PERIOD_PRESET.CUSTOM);
    }
  }, [
    params.filter,
    params.category_id,
    params.source_type,
    params.preset,
    params.amount_min,
    params.amount_max,
    params.reimbursement,
    params.tag_id,
    params.merchant,
    params.month,
  ]);

  const { data: otherLookupCategories = [] } = useCategoriesByType(
    "expense",
    params.category_id === CATEGORY_SLUG.OTHER,
  );

  useEffect(() => {
    if (
      params.category_id === CATEGORY_SLUG.OTHER &&
      otherLookupCategories.length > 0
    ) {
      const other = otherLookupCategories.find(
        (c) => c.name.toLowerCase() === CATEGORY_SLUG.OTHER,
      );
      if (other) setCategoryId(other.id);
    }
  }, [params.category_id, otherLookupCategories]);

  const appliedChips = useMemo<AppliedFilterChip[]>(() => {
    const chips: AppliedFilterChip[] = [];
    const withLog =
      (filterId: string, fn: () => void): (() => void) =>
      () => {
        logEvent(FIREBASE_EVENTS.FILTER_CHIP_REMOVED, { filter: filterId });
        fn();
      };

    if (typeFilter !== TRANSACTION_TYPE.ALL) {
      chips.push({
        id: "type",
        label: capitalize(typeFilter),
        onRemove: withLog("type", () => setTypeFilter(TRANSACTION_TYPE.ALL)),
      });
    }

    if (categoryId !== null) {
      const name =
        allCategories.find((c) => c.id === categoryId)?.name ?? "Category";
      chips.push({
        id: "category",
        label: name,
        onRemove: withLog("category", () => setCategoryId(null)),
      });
    }

    if (sourceId !== null) {
      const name = allSources.find((s) => s.id === sourceId)?.name ?? "Source";
      chips.push({
        id: "source",
        label: name,
        onRemove: withLog("source", () => setSourceId(null)),
      });
    }

    if (sourceTypeFilter !== SOURCE_TYPE.ALL) {
      chips.push({
        id: "source-type",
        label: capitalize(sourceTypeFilter),
        onRemove: withLog("source-type", () =>
          setSourceTypeFilter(SOURCE_TYPE.ALL),
        ),
      });
    }

    if (dateFrom || dateTo) {
      chips.push({
        id: "date",
        label: formatDateRange(dateFrom, dateTo),
        onRemove: withLog("date", () => {
          setDateFrom(null);
          setDateTo(null);
          setPeriodPreset(null);
        }),
      });
    }

    if (amountMin != null || amountMax != null) {
      const label =
        amountMin != null && amountMax != null
          ? `${fmt(amountMin)} – ${fmt(amountMax)}`
          : amountMin != null
            ? `≥ ${fmt(amountMin)}`
            : `≤ ${fmt(amountMax ?? 0)}`;
      chips.push({
        id: "amount",
        label,
        onRemove: withLog("amount", () => {
          setAmountMin(null);
          setAmountMax(null);
        }),
      });
    }

    if (reimbursementFilter !== REIMBURSEMENT_FILTER.ALL) {
      chips.push({
        id: "reimbursement",
        label: capitalize(reimbursementFilter),
        onRemove: withLog("reimbursement", () =>
          setReimbursementFilter(REIMBURSEMENT_FILTER.ALL),
        ),
      });
    }

    for (const tid of tagIds) {
      const name = allTags.find((t) => t.id === tid)?.name ?? "Tag";
      chips.push({
        id: `tag-${tid}`,
        label: `#${name}`,
        onRemove: withLog("tag", () =>
          setTagIds((prev) => prev.filter((x) => x !== tid)),
        ),
      });
    }

    if (merchant) {
      chips.push({
        id: "merchant",
        label: merchant,
        onRemove: withLog("merchant", () => setMerchant(null)),
      });
    }

    return chips;
  }, [
    typeFilter,
    categoryId,
    sourceId,
    sourceTypeFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    reimbursementFilter,
    tagIds,
    merchant,
    allCategories,
    allSources,
    allTags,
    fmt,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== TRANSACTION_TYPE.ALL) count++;
    if (categoryId !== null) count++;
    if (sourceId !== null) count++;
    if (sourceTypeFilter !== SOURCE_TYPE.ALL) count++;
    if (dateFrom || dateTo) count++;
    if (amountMin != null) count++;
    if (amountMax != null) count++;
    if (reimbursementFilter !== REIMBURSEMENT_FILTER.ALL) count++;
    if (tagIds.length > 0) count++;
    if (merchant) count++;
    return count;
  }, [
    typeFilter,
    categoryId,
    sourceId,
    sourceTypeFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    reimbursementFilter,
    tagIds,
    merchant,
  ]);

  const hasActiveFilters = activeFilterCount > 0;

  const filters = {
    type: typeFilter,
    categoryId,
    sourceId: typeFilter === TRANSACTION_TYPE.INCOME ? null : sourceId,
    sourceType: sourceTypeFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    search: debouncedSearch || undefined,
    reimbursement: reimbursementFilter,
    tagIds: tagIds.length > 0 ? tagIds : null,
    merchant,
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useTransactionsPaginated(filters);
  const { data: insights } = useFilteredInsights(filters);

  function handleDraftTypeChange(next: TransactionFilterType) {
    if (next === draftType) return;
    setDraftType(next);
    setDraftCategoryId(null);
    setDraftSourceId(null);
  }

  function openFilters() {
    setDraftType(typeFilter);
    setDraftCategoryId(categoryId);
    setDraftSourceId(sourceId);
    setDraftSourceType(sourceTypeFilter);
    setDraftPreset(periodPreset);
    if (periodPreset && periodPreset !== PERIOD_PRESET.CUSTOM) {
      const range = getPresetRange(periodPreset);
      setDraftDateFrom(range.from);
      setDraftDateTo(range.to);
    } else {
      setDraftDateFrom(dateFrom);
      setDraftDateTo(dateTo);
    }
    setDraftAmountMin(amountMin != null ? String(amountMin) : "");
    setDraftAmountMax(amountMax != null ? String(amountMax) : "");
    setDraftReimbursement(reimbursementFilter);
    setDraftTagIds(tagIds);
    setShowFilters(true);
  }

  function parseAmountInput(raw: string): number | null {
    if (!raw.trim()) return null;
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  }

  function applyFilters() {
    const effectivePreset =
      draftPreset === PERIOD_PRESET.CUSTOM && !draftDateFrom && !draftDateTo
        ? null
        : draftPreset;
    startTransition(() => {
      setTypeFilter(draftType);
      setCategoryId(draftCategoryId);
      setSourceId(draftSourceId);
      setSourceTypeFilter(draftSourceType);
      setPeriodPreset(effectivePreset);
      setDateFrom(effectivePreset ? draftDateFrom : null);
      setDateTo(effectivePreset ? draftDateTo : null);
      setAmountMin(parseAmountInput(draftAmountMin));
      setAmountMax(parseAmountInput(draftAmountMax));
      setReimbursementFilter(draftReimbursement);
      setTagIds(draftTagIds);
    });
    setShowFilters(false);
  }

  function clearAllFilters() {
    setDraftType(TRANSACTION_TYPE.ALL);
    setDraftCategoryId(null);
    setDraftSourceId(null);
    setDraftSourceType(SOURCE_TYPE.ALL);
    setDraftPreset(null);
    setDraftDateFrom(null);
    setDraftDateTo(null);
    setDraftAmountMin("");
    setDraftAmountMax("");
    setDraftReimbursement(REIMBURSEMENT_FILTER.ALL);
    setDraftTagIds([]);
  }

  function resetAllFilters() {
    logEvent(FIREBASE_EVENTS.FILTERS_CLEARED_ALL);
    setTypeFilter(TRANSACTION_TYPE.ALL);
    setCategoryId(null);
    setSourceId(null);
    setSourceTypeFilter(SOURCE_TYPE.ALL);
    setPeriodPreset(null);
    setDateFrom(null);
    setDateTo(null);
    setAmountMin(null);
    setAmountMax(null);
    setReimbursementFilter(REIMBURSEMENT_FILTER.ALL);
    setTagIds([]);
    setMerchant(null);
  }

  const draftHasFilters =
    draftType !== TRANSACTION_TYPE.ALL ||
    draftCategoryId !== null ||
    draftSourceId !== null ||
    draftSourceType !== SOURCE_TYPE.ALL ||
    draftPreset !== null ||
    draftAmountMin !== "" ||
    draftAmountMax !== "" ||
    draftReimbursement !== REIMBURSEMENT_FILTER.ALL ||
    draftTagIds.length > 0;

  return {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    insights,
    searchText,
    setSearchText,
    debouncedSearch,
    showFilters,
    setShowFilters,
    activeFilterCount,
    hasActiveFilters,
    appliedChips,
    allTags,
    openFilters,
    applyFilters,
    clearAllFilters,
    resetAllFilters,
    draftType,
    handleDraftTypeChange,
    draftCategoryId,
    setDraftCategoryId,
    draftSourceId,
    setDraftSourceId,
    draftSourceType,
    setDraftSourceType,
    draftPreset,
    setDraftPreset,
    draftDateFrom,
    setDraftDateFrom,
    draftDateTo,
    setDraftDateTo,
    draftAmountMin,
    setDraftAmountMin,
    draftAmountMax,
    setDraftAmountMax,
    draftReimbursement,
    setDraftReimbursement,
    draftTagIds,
    setDraftTagIds,
    draftHasFilters,
  };
}
