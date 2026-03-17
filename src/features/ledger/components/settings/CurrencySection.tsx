"use client";

import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { cn } from "@/lib/utils";
import { type Settings } from "@/types/api";
import { useTranslations } from "next-intl";

interface CurrencySectionProps {
    settings: Settings;
    onUpdateSettings: (data: Partial<Settings>) => void;
}

export function CurrencySection({ settings, onUpdateSettings }: CurrencySectionProps) {
    const t = useTranslations('Settings');
    const selectedCurrencies = settings.currencies || [];
    const mainCurrency = settings.mainCurrency || "CNY";

    const toggleCurrency = (currency: string) => {
        const isSelected = selectedCurrencies.includes(currency);
        let newCurrencies: string[];

        if (isSelected) {
            newCurrencies = selectedCurrencies.filter((c: string) => c !== currency);
        } else {
            newCurrencies = [...selectedCurrencies, currency];
        }

        onUpdateSettings({ currencies: newCurrencies });
    };

    const setMainCurrency = (currency: string) => {
        onUpdateSettings({ mainCurrency: currency });
    };

    return (
        <div className="space-y-6">
            {/* Main Currency Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-base font-medium">{t('mainCurrency')}</h3>
                    <p className="text-sm text-muted">{t('mainCurrencyDesc')}</p>
                </div>
                <select
                    value={mainCurrency}
                    onChange={(e) => setMainCurrency(e.target.value)}
                    className="w-full sm:w-auto bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                >
                    {SUPPORTED_CURRENCIES.map(currency => (
                        <option key={currency} value={currency}>
                            {currency}
                        </option>
                    ))}
                </select>
            </div>

            <div className="h-px bg-border" />

            {/* Preferred Currencies Section */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-base font-medium">{t('preferredCurrencies')}</h3>
                    <p className="text-sm text-muted">{t('preferredCurrenciesDesc')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {SUPPORTED_CURRENCIES.map(currency => {
                        const isSelected = selectedCurrencies.includes(currency);
                        return (
                            <button
                                key={`preferred-${currency}`}
                                type="button"
                                onClick={() => toggleCurrency(currency)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                                    isSelected
                                        ? "bg-primary text-white border-primary shadow-sm"
                                        : "bg-surface text-muted-foreground border-border hover:border-primary/50"
                                )}
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
