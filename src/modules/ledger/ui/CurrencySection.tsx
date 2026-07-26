"use client";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { cn } from "@/lib/utils";
import type { Settings } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";

interface CurrencySectionProps {
  settings: Settings;
  onUpdateSettings: (data: Partial<Settings>) => void;
  mainCurrencyMutable?: boolean;
}

export function CurrencySection({
  settings,
  onUpdateSettings,
  mainCurrencyMutable = true,
}: CurrencySectionProps) {
  const t = useTranslations("Settings");
  const selectedCurrencies = settings.currencies ?? [];
  const mainCurrency = settings.mainCurrency ?? "CNY";

  const toggleCurrency = (currency: string) => {
    const isSelected = selectedCurrencies.includes(currency);
    const newCurrencies = isSelected
      ? selectedCurrencies.filter((current) => current !== currency)
      : [...selectedCurrencies, currency];

    onUpdateSettings({ currencies: newCurrencies });
  };

  const setMainCurrency = (currency: string) => {
    onUpdateSettings({ mainCurrency: currency });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 justify-between sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base font-medium">{t("mainCurrency")}</h3>
          <p className="text-sm text-muted">{t("mainCurrencyDesc")}</p>
          {!mainCurrencyMutable && (
            <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
              {t("mainCurrencyLocked")}
            </p>
          )}
        </div>
        {mainCurrencyMutable ? (
          <select
            aria-label={t("mainCurrency")}
            value={mainCurrency}
            onChange={(event) => setMainCurrency(event.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 sm:w-auto"
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        ) : (
          <span className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm sm:w-auto cursor-not-allowed opacity-60">
            {mainCurrency}
          </span>
        )}
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium">{t("preferredCurrencies")}</h3>
          <p className="text-sm text-muted">{t("preferredCurrenciesDesc")}</p>
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
