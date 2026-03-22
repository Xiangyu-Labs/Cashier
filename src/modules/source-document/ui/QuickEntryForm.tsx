"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { DateFilter } from "@/components/ui/date-filter";
import { useQuickEntryFormController } from "@/modules/source-document/hooks/useQuickEntryFormController";

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
  const tCommon = useTranslations("Common");
  const t = useTranslations("QuickEntryForm");
  const {
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    amount,
    setAmount,
    itemName,
    setItemName,
    entryDate,
    setEntryDate,
    mutation,
    handleSubmit,
  } = useQuickEntryFormController({
    ledgerId,
    categories,
    mainCurrency,
    onSuccess,
  });

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
