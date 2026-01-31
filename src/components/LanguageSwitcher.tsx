"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
    const locale = useLocale();
    const t = useTranslations("Settings");

    const switchLocale = (newLocale: string) => {
        // Set cookie manually
        document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
        // Reload to apply changes server-side
        window.location.reload();
    };

    return (
        <div className="flex items-center space-x-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="flex space-x-1">
                <Button
                    variant={locale === "zh" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => switchLocale("zh")}
                >
                    中文
                </Button>
                <Button
                    variant={locale === "en" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => switchLocale("en")}
                >
                    English
                </Button>
            </div>
        </div>
    );
}
