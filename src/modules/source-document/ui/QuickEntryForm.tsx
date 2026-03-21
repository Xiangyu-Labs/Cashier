"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import { createQuickEntryAction } from "@/modules/source-document/actions";
import { cn } from "@/lib/utils";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { Send } from "lucide-react";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { DateFilter } from "@/components/ui/date-filter";
import { invalidateCalendar, invalidateLedgerEntries, invalidateLedgerStats, invalidateSourceDocuments, queryKeys, } from "@/lib/query-keys";
import type { InfiniteData } from "@tanstack/react-query";
import type { SourceDocumentCollectionDto, SourceDocumentListItemDto as SourceDocumentListItemWithEntries, } from "@/modules/source-document/contracts";
import type { LedgerEntry } from "@/modules/ledger/contracts";

interface QuickEntryFormProps {
  ledgerId: string;
  categories: EntryCategory[];
  mainCurrency?: string;
  onSuccess?: () => void;
}

export function QuickEntryForm({
  ledgerId,
  categories,
  mainCurrency = "CNY",
  onSuccess,
}: QuickEntryFormProps) {
  const t = useTranslations("QuickEntryForm");
  const tCommon = useTranslations("Common");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [itemName, setItemName] = useState("");
  const [entryDate, setEntryDate] = useState<Date>(new Date());

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  // Form validation state (used in handleSubmit)

  const mutation = useLedgerMutation(ledgerId, {
    mutationFn: (data: {
      categoryId: string;
      amount: number;
      itemName?: string;
      entryDate: string;
    }) => createQuickEntryAction(ledgerId, data),
    successMessage: t("quickEntrySuccess"),
    errorMessage: t("quickEntryError"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: () => {
      setSelectedCategoryId(null);
      setAmount(0);
      setItemName("");
      setEntryDate(new Date());
      onSuccess?.();
    },
    onOptimisticUpdate: (queryClient, variables) => {
      const tempDocId = `temp-doc-${Date.now()}`;
      const tempEntryId = `temp-entry-${Date.now()}`;
      const now = new Date().toISOString();
      const entryDateStr = variables.entryDate;

      // Build temporary ledger entry
      const tempEntry: LedgerEntry = {
        id: tempEntryId,
        ledgerId,
        sourceDocumentId: tempDocId,
        categoryId: variables.categoryId,
        amount: variables.amount.toFixed(2),
        currency: mainCurrency,
        itemName: variables.itemName ?? selectedCategory?.name ?? "",
        description: null,
        convertedAmount: variables.amount.toFixed(2),
        exchangeRate: "1",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        category: selectedCategory || null,
        sourceDocument: null,
      };

      // Build temporary source document
      const tempDoc: SourceDocumentListItemWithEntries = {
        id: tempDocId,
        ledgerId,
        type: "manual",
        status: "completed",
        title: selectedCategory?.name ?? null,
        text: null,
        entryDate: entryDateStr,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        metadata: {},
        imageUrls: [],
        hasImages: false,
        anomalyReason: null,
        ledgerEntries: [
          {
            id: tempEntryId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ledgerId,
            description: null,
            categoryId: variables.categoryId,
            sourceDocumentId: tempDocId,
            amount: variables.amount.toFixed(2),
            currency: mainCurrency,
            itemName: variables.itemName ?? selectedCategory?.name ?? "",
            convertedAmount: variables.amount.toFixed(2),
            exchangeRate: "1",
            category:
              selectedCategory !== undefined
                ? {
                    id: selectedCategory.id,
                    name: selectedCategory.name,
                    createdAt: selectedCategory.createdAt,
                    updatedAt: selectedCategory.updatedAt,
                    deletedAt: selectedCategory.deletedAt,
                    ledgerId: selectedCategory.ledgerId,
                    description: selectedCategory.description,
                    icon: selectedCategory.icon,
                    sortOrder: selectedCategory.sortOrder,
                    isEditable: selectedCategory.isEditable,
                  }
                : null,
          },
        ],
      };

      // 1. Snapshot and update source documents list (paginated response)
      const docSnapshots = createListSnapshots<SourceDocumentCollectionDto>(
        queryClient,
        queryKeys.sourceDocuments(ledgerId, "all")
      );
      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { queryKey: queryKeys.sourceDocuments(ledgerId, "all") },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: [tempDoc, ...old.items],
            total: old.total + 1,
          };
        }
      );

      // 2. Snapshot and update ledger entries list (infinite query)
      interface EntryPage {
        items: LedgerEntry[];
      }
      const entrySnapshots = createListSnapshots<InfiniteData<EntryPage>>(
        queryClient,
        queryKeys.ledgerEntries(ledgerId)
      );
      queryClient.setQueriesData<InfiniteData<EntryPage>>(
        { queryKey: queryKeys.ledgerEntries(ledgerId) },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page, idx) =>
              idx === 0 ? { ...page, items: [tempEntry, ...page.items] } : page
            ),
          };
        }
      );

      // Merge snapshots for rollback
      return { snapshots: [...docSnapshots, ...entrySnapshots] };
    },
  });

  const handleSubmit = () => {
    if (selectedCategoryId === null || amount <= 0) return;
    const nextItemName = itemName !== "" ? itemName : undefined;
    mutation.mutate({
      categoryId: selectedCategoryId,
      amount,
      entryDate: formatDateTimeForApi(entryDate),
      ...(nextItemName !== undefined ? { itemName: nextItemName } : {}),
    });
  };

  return (
    <div className="space-y-4">
      {/* Item Name (optional) */}
      <Input
        value={itemName}
        onChange={(e) => setItemName(e.target.value)}
        placeholder={
          selectedCategory != null
            ? `${t("itemNamePlaceholder")}${selectedCategory.name}`
            : t("itemName")
        }
        className="text-sm"
      />

      {/* Category Grid */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">{t("selectCategory")}</p>
        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(cat.id)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors",
                selectedCategoryId === cat.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent/10 text-text"
              )}
            >
              <CategoryIcon iconName={cat.icon} className="h-5 w-5" />
              <span className="text-xs truncate w-full text-center">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Date Selector */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">{t("selectDate")}</p>
        <DateFilter
          value={entryDate}
          onChange={(date) => setEntryDate(date ?? new Date())}
          placeholder={t("selectDate")}
          size="sm"
          className="w-full"
        />
      </div>

      {/* Amount */}
      <div className="flex items-center justify-center py-2">
        <CalculatorInput
          value={amount}
          onChange={setAmount}
          displayClassName="text-3xl font-bold font-mono text-center"
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={selectedCategoryId === null || amount <= 0 || mutation.isPending}
        className="w-full"
      >
        {mutation.isPending ? (
          tCommon("sending_status")
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            {t("record")}
          </>
        )}
      </Button>
    </div>
  );
}
