"use client";
import type { EntryCategoryWithCount } from "@/modules/ledger/contracts";
import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CurrencySection } from "./CurrencySection";
import { CategorySection } from "./CategorySection";
import { ServiceCredentialSection } from "./ServiceCredentialSection";
import { SettingsSection } from "./settings/SettingsSection";
import { SettingsField } from "./settings/SettingsField";
import { SettingsDangerActions } from "./settings/SettingsDangerActions";
import { ExportSection } from "./ExportSection";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { invalidateLedger, invalidateLedgerSettings } from "@/lib/query-keys";
import {
  useAutoCategorizeMutation,
  useCategoryMutations,
  useCredentialMutations,
  useLedgerSettings,
} from "@/modules/ledger/hooks";
import type { Ledger } from "@/modules/ledger/contracts";
import { Switch } from "@/components/ui/switch";
import { Monitor, Sun, Moon, LogOut } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { UI_LANGUAGES, AI_LANGUAGES } from "@/config/languages";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { ChangeEmailForm, ClearDataForm, DeleteAccountForm } from "@/modules/auth/ui";

interface SettingsTabProps {
  ledger: Ledger;
  initialCategories: EntryCategoryWithCount[];
  ledgerId: string;
}


export function SettingsTab({
  ledger,
  initialCategories,
  ledgerId,
}: SettingsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Settings");
  const ta = useTranslations("Settings.Account");
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const searchParams = useSearchParams();

  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerSettings(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedger(ledgerId) }),
    ]);
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
  const autoCategorizeMutation = useAutoCategorizeMutation(ledgerId);

  // Theme key mapping for translations
  const themeKeyMap = { system: "themeAuto", light: "themeLight", dark: "themeDark" } as const;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="mx-auto max-w-4xl space-y-4">
        <SettingsSection title={t("appearanceAndLanguage")} description={t("appearanceAndLanguageDesc")}>
          <SettingsField title={t("theme")} description={t("themeDescription")}>
            <div className="flex w-full bg-[var(--background)] border border-[var(--border)] rounded-lg p-1 sm:w-auto">
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
          </SettingsField>
          <SettingsField title={t("uiLanguage")} description={t("uiLanguageDesc")}>
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
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            >
              {UI_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.value === "auto" ? t("uiLanguageAuto") : lang.label}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField title={t("collapseEntries")} description={t("collapseEntriesDesc")}>
            <Switch
              checked={settingsLedger.metadata?.settings?.collapseEntriesDefault ?? false}
              onCheckedChange={(checked: boolean) => {
                updateLedgerMutation.mutate({ collapseEntriesDefault: checked });
              }}
              disabled={isPending}
            />
          </SettingsField>
        </SettingsSection>

        <SettingsSection title={t("bookkeepingRules")} description={t("bookkeepingRulesDesc")}>
          <CurrencySection
            settings={{
              ...settingsLedger.metadata?.settings,
              currencies: settingsLedger.metadata?.settings?.currencies || [],
            }}
            onUpdateSettings={(data) => updateLedgerMutation.mutate(data)}
          />
          {categories.length > 0 && (
            <CategorySection
              categories={categories}
              uncategorizedCount={uncategorizedCount}
              onCreateCategory={(name) => createCategory.mutate({ name })}
              onUpdateCategory={(id, data) => updateCategory.mutate({ id, data })}
              onDeleteCategory={(id) => deleteCategory.mutate(id)}
              onReorderCategories={(ids) => reorderCategories.mutate(ids)}
              onCategoryCreated={categoryCreatedTrigger}
              onAutoCategorize={() => autoCategorizeMutation.mutateAsync()}
            />
          )}
        </SettingsSection>

        <SettingsSection title={t("aiParsing")} description={t("aiParsingDesc")}>
          <SettingsField title={t("aiLanguage")} description={t("aiLanguageDesc")}>
            <select
              value={settingsLedger.metadata?.settings?.aiLanguage ?? "zh-CN"}
              onChange={(e) => updateLedgerMutation.mutate({ aiLanguage: e.target.value })}
              disabled={isPending}
              className="max-w-[150px] rounded-md border border-border bg-bg px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            >
              {AI_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField title={t("aiPrompt")} description={t("aiPromptDesc")}>
            <textarea
              defaultValue={settingsLedger.metadata?.settings?.aiCustomPrompt ?? ""}
              onBlur={(e) => {
                const newValue = e.target.value;
                const currentValue = settingsLedger.metadata?.settings?.aiCustomPrompt ?? "";
                if (newValue !== currentValue) {
                  updateLedgerMutation.mutate({ aiCustomPrompt: newValue });
                }
              }}
              disabled={isPending}
              placeholder={t("aiPromptPlaceholder")}
              className="min-h-[100px] w-full resize-none rounded-md border border-border bg-bg p-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
          </SettingsField>
        </SettingsSection>

        <SettingsSection title={t("automation")} description={t("automationDesc")}>
          <ServiceCredentialSection
            credentials={credentials ?? []}
            onCreateCredential={(name) => createCredential.mutateAsync(name)}
            onDeleteCredential={(id) => deleteCredential.mutate(id)}
          />
        </SettingsSection>

        <SettingsSection title={t("accountAndData")} description={t("accountAndDataDesc")}>
          <SettingsField title={ta("emailSection")} description={session?.user?.email ?? ""}>
            <ChangeEmailForm currentEmail={session?.user?.email ?? ""} />
          </SettingsField>
          <ExportSection ledgerId={ledgerId} />
          <SettingsDangerActions title={ta("dangerZone")} description={ta("dangerZoneDesc")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="font-medium text-danger">{ta("clearDataTitle")}</h4>
                <p className="text-sm text-muted-foreground">{ta("clearDataDesc")}</p>
              </div>
              <ClearDataForm currentEmail={session?.user?.email ?? ""} />
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="font-medium text-danger">{ta("deleteTitle")}</h4>
                <p className="text-sm text-muted-foreground">{ta("deleteDesc")}</p>
              </div>
              <DeleteAccountForm currentEmail={session?.user?.email ?? ""} />
            </div>
          </SettingsDangerActions>
          <SettingsField title={t("signOut")} description={t("signOutDesc")}>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              disabled={isPending}
              className="flex min-h-11 items-center gap-2 rounded-md border border-border px-4 py-2 transition-colors hover:bg-surface2 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              <span>{t("signOut")}</span>
            </button>
          </SettingsField>
        </SettingsSection>
      </div>
    </PullToRefresh>
  );
}
