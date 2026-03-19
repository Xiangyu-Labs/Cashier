"use client";

import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { submitAutoCategorizeAction } from "@/modules/ledger/actions";
import { CurrencySection } from "./CurrencySection";
import { CategorySection } from "./CategorySection";
import { ServiceCredentialSection } from "./ServiceCredentialSection";
import { CollapsibleSection } from "./CollapsibleSection";
import { ExportSection } from "./ExportSection";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { invalidateLedgerSettings, queryKeys } from "@/lib/query-keys";
import { useCategoryMutations } from "@/modules/ledger/hooks/useCategoryMutations";
import { useCredentialMutations } from "@/modules/ledger/hooks/useCredentialMutations";
import { useLedgerSettings } from "@/modules/ledger/hooks/useLedgerSettings";

import { type Ledger, type EntryCategoryWithCount } from "@/types/api";
import { Switch } from "@/components/ui/switch";
import { Monitor, Sun, Moon, LogOut } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { UI_LANGUAGES, AI_LANGUAGES } from "@/config/languages";
import { signOut } from "next-auth/react";

interface SettingsTabProps {
  ledger: Ledger;
  initialCategories: EntryCategoryWithCount[];
  ledgerId: string;
  allLedgers?: Ledger[];
}

const SECTION_TITLES = {
  general: "general",
  ledger: "ledger",
  aiAssistant: "aiAssistant",
  account: "account",
} as const;

export function SettingsTab({
  ledger,
  initialCategories,
  ledgerId,
  allLedgers: _allLedgers = [],
}: SettingsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Settings");
  const { theme, setTheme } = useTheme();
  const searchParams = useSearchParams();

  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ predicate: invalidateLedgerSettings(ledgerId) });
  };

  // Use extracted hooks - ledger is reactive and will update with optimistic updates
  const {
    ledger: reactiveLedger,
    categories,
    uncategorizedCount,
    credentials,
    updateLedgerMutation,
    isPending,
  } = useLedgerSettings({ ledgerId, ledger, initialCategories });

  // Use reactive ledger for settings that need optimistic updates
  const settingsLedger = reactiveLedger || ledger;

  // AI Prompt input is managed directly without local state to avoid dual-source-of-truth issues
  // The input uses the reactive ledger value directly and submits on blur

  const {
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    categoryCreatedTrigger,
  } = useCategoryMutations(ledgerId, categories);

  const { createCredential, deleteCredential } = useCredentialMutations(ledgerId);

  // Theme key mapping for translations
  const themeKeyMap = { system: "themeAuto", light: "themeLight", dark: "themeDark" } as const;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6 sm:space-y-8">
        {/* 1. General Settings - Theme, Language, Display preferences */}
        <CollapsibleSection title={t(SECTION_TITLES.general)} defaultOpen={false}>
          <div className="space-y-6 pt-4">
            {/* Theme Setting - Most fundamental visual preference */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-medium">{t("theme")}</h3>
                <p className="text-sm text-[var(--muted)]">{t("themeDescription")}</p>
              </div>
              <div className="flex w-full sm:w-auto bg-[var(--background)] border border-[var(--border)] rounded-lg p-1">
                {(["system", "light", "dark"] as const).map((tName) => (
                  <button
                    key={tName}
                    onClick={() => setTheme(tName)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 p-1.5 rounded-md transition-all ${theme === tName ? "bg-[var(--surface)] shadow-sm text-primary" : "text-[var(--muted)] hover:text-text"}`}
                    title={t(themeKeyMap[tName])}
                    disabled={isPending}
                  >
                    {tName === "system" && <Monitor className="h-4 w-4" />}
                    {tName === "light" && <Sun className="h-4 w-4" />}
                    {tName === "dark" && <Moon className="h-4 w-4" />}
                    <span className="sm:hidden text-xs">{t(themeKeyMap[tName])}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-[var(--border)]" />

            {/* UI Language Setting */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-medium">{t("uiLanguage")}</h3>
                <p className="text-sm text-[var(--muted)]">{t("uiLanguageDesc")}</p>
              </div>
              <select
                value={locale}
                onChange={(e) => {
                  const newLocale = e.target.value;
                  if (newLocale === "auto") {
                    document.cookie = `NEXT_LOCALE=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
                    window.location.reload();
                    return;
                  }
                  if (newLocale !== locale) {
                    const queryString = searchParams.toString();
                    const query = queryString !== "" ? `?${queryString}` : "";
                    router.push(`${pathname}${query}`, { locale: newLocale as "en-US" | "zh-CN" });
                  }
                }}
                disabled={isPending}
                className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
              >
                {UI_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.value === "auto" ? t("uiLanguageAuto") : lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="h-px bg-[var(--border)]" />

            {/* Collapse Entries Setting - Display preference for ledger */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-medium">{t("collapseEntries")}</h3>
                <p className="text-sm text-[var(--muted)]">{t("collapseEntriesDesc")}</p>
              </div>
              <Switch
                checked={settingsLedger.metadata?.settings?.collapseEntriesDefault ?? false}
                onCheckedChange={(checked: boolean) => {
                  updateLedgerMutation.mutate({ collapseEntriesDefault: checked });
                }}
                disabled={isPending}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* 2. Ledger Settings - Core ledger configuration */}
        <CollapsibleSection title={t(SECTION_TITLES.ledger)} defaultOpen={false}>
          <div className="space-y-8 pt-4">
            {/* Currency Settings - Core financial setting */}
            <CurrencySection
              settings={{
                ...settingsLedger.metadata?.settings,
                currencies: settingsLedger.metadata?.settings?.currencies || [],
              }}
              onUpdateSettings={(data) => updateLedgerMutation.mutate(data)}
            />

            <div className="h-px bg-[var(--border)]" />

            {/* Category Settings - Organization structure */}
            {categories.length > 0 && (
              <CategorySection
                categories={categories}
                uncategorizedCount={uncategorizedCount}
                onCreateCategory={(name) => createCategory.mutate({ name })}
                onUpdateCategory={(id, data) => updateCategory.mutate({ id, data })}
                onDeleteCategory={(id) => deleteCategory.mutate(id)}
                onReorderCategories={(ids) => reorderCategories.mutate(ids)}
                onCategoryCreated={categoryCreatedTrigger}
                onAutoCategorize={async () => {
                  const result = await submitAutoCategorizeAction(ledgerId);
                  await queryClient.invalidateQueries({
                    queryKey: queryKeys.uncategorizedCount(ledgerId),
                  });
                  await queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
                  return {
                    submittedCount: result.submittedCount,
                    skippedCount: result.skippedCount,
                  };
                }}
              />
            )}
          </div>
        </CollapsibleSection>

        {/* 3. AI Assistant Settings - AI-related configurations */}
        <CollapsibleSection title={t(SECTION_TITLES.aiAssistant)} defaultOpen={false}>
          <div className="space-y-6 pt-4">
            {/* AI Language Setting - Basic AI preference */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-medium">{t("aiLanguage")}</h3>
                <p className="text-sm text-[var(--muted)]">{t("aiLanguageDesc")}</p>
              </div>
              <select
                value={settingsLedger.metadata?.settings?.aiLanguage ?? "zh-CN"}
                onChange={(e) => updateLedgerMutation.mutate({ aiLanguage: e.target.value })}
                disabled={isPending}
                className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all max-w-[150px] disabled:opacity-50"
              >
                {AI_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="h-px bg-[var(--border)]" />

            {/* AI Prompt - Advanced AI customization */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-medium">{t("aiPrompt")}</h3>
                <p className="text-sm text-[var(--muted)]">{t("aiPromptDesc")}</p>
              </div>
              <textarea
                defaultValue={settingsLedger.metadata?.settings?.aiCustomPrompt ?? ""}
                onBlur={(e) => {
                  const newValue = e.target.value;
                  const currentValue = settingsLedger.metadata?.settings?.aiCustomPrompt ?? "";
                  if (newValue !== currentValue && newValue.trim() !== "") {
                    updateLedgerMutation.mutate({ aiCustomPrompt: newValue });
                  }
                }}
                disabled={isPending}
                placeholder={t("aiPromptPlaceholder")}
                className="w-full min-h-[100px] bg-[var(--background)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none disabled:opacity-50"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* 4. Account Settings - Security and data management */}
        <CollapsibleSection title={t(SECTION_TITLES.account)} defaultOpen={false}>
          <div className="space-y-6 pt-4">
            {/* Service Credentials - API access management */}
            <ServiceCredentialSection
              credentials={credentials ?? []}
              onCreateCredential={(name) => createCredential.mutateAsync(name)}
              onDeleteCredential={(id) => deleteCredential.mutate(id)}
            />

            <div className="h-px bg-[var(--border)]" />

            {/* Export Data Section - Data portability */}
            <ExportSection ledgerId={ledgerId} />

            <div className="h-px bg-[var(--border)]" />

            {/* Sign Out - Account action */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-medium">{t("signOut")}</h3>
                <p className="text-sm text-[var(--muted)]">{t("signOutDesc")}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--surface2)] transition-colors disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                <span>{t("signOut")}</span>
              </button>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </PullToRefresh>
  );
}
