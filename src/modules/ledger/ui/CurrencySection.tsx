"use client";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import type { Settings } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CurrencySectionProps {
  settings: Settings;
  onUpdateSettings: (data: Partial<Settings>) => void;
  disabled?: boolean;
}

function PreferredCurrenciesMenu({
  initialCurrencies,
  onUpdateSettings,
  disabled = false,
}: {
  initialCurrencies: string[];
  onUpdateSettings: CurrencySectionProps["onUpdateSettings"];
  disabled?: boolean;
}) {
  const t = useTranslations("Settings");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredCurrencies = SUPPORTED_CURRENCIES.filter((currency) =>
    currency.toLowerCase().includes(search.trim().toLowerCase())
  );

  const toggleCurrency = (currency: string) => {
    const newCurrencies = initialCurrencies.includes(currency)
      ? initialCurrencies.filter((current) => current !== currency)
      : [...initialCurrencies, currency];
    onUpdateSettings({ currencies: newCurrencies });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal sm:w-64"
          aria-label={t("preferredCurrencies")}
          disabled={disabled}
        >
          <span className="truncate">
            {initialCurrencies.length === 0
              ? t("preferredCurrenciesNone")
              : t("preferredCurrenciesSummary", {
                  currencies: initialCurrencies.slice(0, 3).join(", "),
                  count: initialCurrencies.length,
                })}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("preferredCurrenciesSearch")}
            aria-label={t("preferredCurrenciesSearch")}
            className="h-10 pl-9"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filteredCurrencies.map((currency) => {
            const isSelected = initialCurrencies.includes(currency);
            return (
              <label
                key={currency}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-surface2"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleCurrency(currency)}
                  disabled={disabled}
                />
                <span>{currency}</span>
              </label>
            );
          })}
          {filteredCurrencies.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("preferredCurrenciesNoResults")}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CurrencySection({
  settings,
  onUpdateSettings,
  disabled = false,
}: CurrencySectionProps) {
  const t = useTranslations("Settings");
  const settingsCurrencies = settings.currencies ?? [];
  const mainCurrency = settings.mainCurrency ?? "CNY";
  const [pendingMainCurrency, setPendingMainCurrency] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-text">{t("mainCurrency")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("mainCurrencyDesc")}</p>
        </div>
        <Select value={mainCurrency} onValueChange={setPendingMainCurrency} disabled={disabled}>
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
          onUpdateSettings({ mainCurrency: pendingMainCurrency });
        }}
      />

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-text">{t("preferredCurrencies")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("preferredCurrenciesDesc")}</p>
        </div>
        <PreferredCurrenciesMenu
          initialCurrencies={settingsCurrencies}
          onUpdateSettings={onUpdateSettings}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
