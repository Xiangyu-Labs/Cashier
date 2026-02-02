"use client";

import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const switchLocale = (newLocale: string) => {
        // Construct the new URL preserving query parameters
        const params = new URLSearchParams(searchParams.toString());
        const query = params.toString() ? `?${params.toString()}` : "";

        router.replace(`${pathname}${query}`, { locale: newLocale });
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
