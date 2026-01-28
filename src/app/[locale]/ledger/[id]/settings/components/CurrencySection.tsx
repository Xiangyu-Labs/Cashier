"use client";

import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { cn } from "@/lib/utils";
import { Settings } from "@/types/api";

interface CurrencySectionProps {
    settings: Settings;
    onUpdateSettings: (data: Partial<Settings>) => void;
}

export function CurrencySection({ settings, onUpdateSettings }: CurrencySectionProps) {
    const selectedCurrencies = settings.currencies || [];

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

    return (
        <div>
            <h3 className="text-sm font-medium text-[var(--muted)] mb-4 uppercase tracking-wider">常用货币</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {SUPPORTED_CURRENCIES.map(currency => {
                    const isSelected = selectedCurrencies.includes(currency);
                    return (
                        <button
                            key={currency}
                            onClick={() => toggleCurrency(currency)}
                            className={cn(
                                "flex items-center justify-center px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all border",
                                isSelected
                                    ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm"
                                    : "bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--surface2)]"
                            )}
                        >
                            {currency}
                        </button>
                    );
                })}
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
                点击选择该账本需要支持的货币。默认选中将用于快速记账和识别预览。
            </p>
        </div>
    );
}
