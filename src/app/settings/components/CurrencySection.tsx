"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Settings } from "@/types/api";

interface CurrencySectionProps {
    settings: Settings;
    onUpdateSettings: (data: Partial<Settings>) => void;
}

import { useTranslations } from "next-intl";

export function CurrencySection({ settings, onUpdateSettings }: CurrencySectionProps) {
    const t = useTranslations("Settings");
    const [newCurrency, setNewCurrency] = useState("");

    const handleAddCurrency = () => {
        if (!newCurrency) return;
        const current = settings.currencies || [];
        if (!current.includes(newCurrency.toUpperCase())) {
            onUpdateSettings({ currencies: [...current, newCurrency.toUpperCase()] });
        }
        setNewCurrency("");
    };

    const handleRemoveCurrency = (currency: string) => {
        const current = settings.currencies || [];
        onUpdateSettings({ currencies: current.filter(c => c !== currency) });
    };

    return (
        <div>
            <h3 className="text-sm font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">{t("preferredCurrencies")}</h3>
            <div className="flex flex-wrap gap-2 mb-3">
                {settings.currencies?.map(currency => (
                    <div key={currency} className="flex items-center gap-1 bg-[var(--surface2)] px-3 py-1 rounded-[var(--radius-sm)] text-sm">
                        <span>{currency}</span>
                        <button
                            onClick={() => handleRemoveCurrency(currency)}
                            className="text-[var(--muted)] hover:text-[var(--danger)]"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex gap-2 max-w-xs">
                <input
                    type="text"
                    placeholder={t("currencyPlaceholder")}
                    value={newCurrency}
                    onChange={e => setNewCurrency(e.target.value)}
                    className="flex-1 p-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] uppercase"
                    maxLength={3}
                />
                <button
                    onClick={handleAddCurrency}
                    className="p-2 bg-[var(--surface2)] hover:bg-[var(--border)] rounded-[var(--radius)] transition-colors"
                >
                    <Plus size={18} />
                </button>
            </div>
        </div>
    );
}
