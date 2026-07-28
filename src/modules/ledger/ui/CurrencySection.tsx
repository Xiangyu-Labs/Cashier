"use client";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { cn } from "@/lib/utils";
import type { Settings } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CurrencySectionProps {
  settings: Settings;
  onUpdateSettings: (data: Partial<Settings>) => void | Promise<unknown>;
}

export function CurrencySection({ settings, onUpdateSettings }: CurrencySectionProps) {
  const t = useTranslations("Settings");
  const selectedCurrencies = settings.currencies ?? [];
  const mainCurrency = settings.mainCurrency ?? "CNY";
  const [pendingMainCurrency, setPendingMainCurrency] = useState<string | null>(null);

  const toggleCurrency = (currency: string) => {
    const isSelected = selectedCurrencies.includes(currency);
    const newCurrencies = isSelected
      ? selectedCurrencies.filter((current) => current !== currency)
      : [...selectedCurrencies, currency];

    onUpdateSettings({ currencies: newCurrencies });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 justify-between sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-medium text-text">{t("mainCurrency")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("mainCurrencyDesc")}</p>
        </div>
        <Select value={mainCurrency} onValueChange={setPendingMainCurrency}>
          <SelectTrigger aria-label={t("mainCurrency")} className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {SUPPORTED_CURRENCIES.map((currency) => (
              <SelectItem key={currency} value={currency}>
                {currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ConfirmDialog
        open={pendingMainCurrency != null}
        onOpenChange={(open) => !open && setPendingMainCurrency(null)}
        title={t("mainCurrencyChangeTitle")}
        description={t("mainCurrencyChangeDescription", {
          currency: pendingMainCurrency ?? mainCurrency,
        })}
        confirmLabel={t("mainCurrencyChangeConfirm")}
        onConfirm={async () => {
          if (pendingMainCurrency == null || pendingMainCurrency === mainCurrency) return;
          await onUpdateSettings({ mainCurrency: pendingMainCurrency });
        }}
      />

      <div className="h-px bg-border" />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-text">{t("preferredCurrencies")}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_CURRENCIES.map((currency) => {
            const isSelected = selectedCurrencies.includes(currency);

            return (
              <button
                key={`preferred-${currency}`}
                type="button"
                onClick={() => toggleCurrency(currency)}
                className={cn(
                  "min-h-11 rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                  isSelected
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/50"
                )}
                aria-pressed={isSelected}
              >
                {currency}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
