"use client";
import type { Ledger } from "@/modules/ledger/contracts";
import { useRouter } from "@/i18n/routing";
import type { EntryCategoryWithCount } from "@/modules/ledger/contracts";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { SettingsTab } from "./SettingsTab";

interface SettingsPageClientProps {
  ledger: Ledger;
  initialCategories: EntryCategoryWithCount[];
  ledgerId: string;
}

export function SettingsPageClient({
  ledger,
  initialCategories,
  ledgerId,
}: SettingsPageClientProps) {
  const router = useRouter();
  const t = useTranslations("Settings");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-semibold truncate">{t("title")}</h1>
      </div>

      <SettingsTab ledger={ledger} initialCategories={initialCategories} ledgerId={ledgerId} />
    </div>
  );
}
