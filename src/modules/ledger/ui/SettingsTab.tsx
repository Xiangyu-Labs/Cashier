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
import { PasswordForm } from "@/modules/auth/ui/PasswordForm";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { invalidateLedger, invalidateLedgerSettings } from "@/lib/query-keys";
import {
  useCategoryMutations,
  useCredentialMutations,
  useLedgerSettings,
} from "@/modules/ledger/hooks";
import type { Ledger } from "@/modules/ledger/contracts";
import { Switch } from "@/components/ui/switch";
import { Monitor, Sun, Moon, LogOut } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { UI_LANGUAGES, AI_LANGUAGES } from "@/config/languages";
import { signOut } from "next-auth/react";
import { EmailChangeForm } from "@/modules/auth/ui/EmailChangeForm";
import { useEffect, useState, useTransition } from "react";
import { updateUserPreferencesAction } from "@/modules/auth/actions";
import type { InterfaceLanguage } from "@/modules/auth/contracts";
import { toast } from "sonner";

interface SettingsTabProps {
  ledger: Ledger;
  initialCategories: EntryCategoryWithCount[];
  ledgerId: string;
  /** Server-derived user email (avoids useSession in a SessionProvider). */
  userEmail?: string;
  hasPassword?: boolean;
  passwordUpdatedAt?: string | null;
  interfaceLanguage?: InterfaceLanguage;
}

export function SettingsTab({
  ledger,
  initialCategories,
  ledgerId,
  userEmail,
  hasPassword = false,
  passwordUpdatedAt = null,
  interfaceLanguage = "auto",
}: SettingsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Settings");
  const ta = useTranslations("Settings.Account");
  const { theme, setTheme } = useTheme();
  const searchParams = useSearchParams();
  const [displayEmail, setDisplayEmail] = useState(userEmail ?? "");
  const [languagePreference, setLanguagePreference] = useState(interfaceLanguage);
  const [deviceTimeZone, setDeviceTimeZone] = useState<string | null>(null);
  const [languagePending, startLanguageTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setDeviceTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
      } catch {
        setDeviceTimeZone(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    generatingCategoryIds,
    failedCategoryIds,
    retryCategoryMetadata,
  } = useCategoryMutations(ledgerId, categories);

  const { createCredential, deleteCredential } = useCredentialMutations(ledgerId);

  // Theme key mapping for translations
  const themeKeyMap = { system: "themeAuto", light: "themeLight", dark: "themeDark" } as const;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 overflow-x-clip">
        <SettingsSection title={t("appearanceAndLanguage")}>
          <SettingsField title={t("theme")}>
            <Select value={theme ?? "system"} onValueChange={setTheme} disabled={isPending}>
              <SelectTrigger aria-label={t("theme")} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["system", "light", "dark"] as const).map((themeName) => (
                  <SelectItem key={themeName} value={themeName}>
                    {themeName === "system" ? <Monitor /> : null}
                    {themeName === "light" ? <Sun /> : null}
                    {themeName === "dark" ? <Moon /> : null}
                    {t(themeKeyMap[themeName])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
          <SettingsField title={t("uiLanguage")}>
            <select
              value={languagePreference}
              onChange={(e) => {
                const preference = e.target.value as InterfaceLanguage;
                startLanguageTransition(async () => {
                  try {
                    const saved = await updateUserPreferencesAction({
                      interfaceLanguage: preference,
                    });
                    setLanguagePreference(saved.interfaceLanguage);
                    const queryString = searchParams.toString();
                    const query = queryString !== "" ? `?${queryString}` : "";
                    if (saved.interfaceLanguage === "auto") {
                      document.cookie =
                        "NEXT_LOCALE=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax";
                      window.location.assign(`${pathname}${query}`);
                      return;
                    }
                    document.cookie = `NEXT_LOCALE=${saved.interfaceLanguage}; path=/; max-age=31536000; samesite=lax`;
                    if (saved.interfaceLanguage === locale) router.refresh();
                    else
                      router.push(`${pathname}${query}`, {
                        locale: saved.interfaceLanguage,
                      });
                  } catch {
                    toast.error(t("uiLanguageSaveFailed"));
                  }
                });
              }}
              disabled={isPending || languagePending}
              aria-label={t("uiLanguage")}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            >
              {UI_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.value === "auto" ? t("uiLanguageAuto") : lang.label}
                </option>
              ))}
            </select>
          </SettingsField>
        </SettingsSection>

        <SettingsSection title={t("bookkeepingRules")}>
          <SettingsField title={t("collapseEntries")} description={t("collapseEntriesDesc")}>
            <Switch
              aria-label={t("collapseEntries")}
              checked={settingsLedger.metadata?.settings?.collapseEntriesDefault ?? false}
              onCheckedChange={(checked: boolean) => {
                updateLedgerMutation.mutate({ collapseEntriesDefault: checked });
              }}
              disabled={isPending}
            />
          </SettingsField>
          <SettingsField title={t("timeZone")} description={t("timeZoneDesc")}>
            <select
              value={settingsLedger.metadata?.settings?.timeZone ?? "auto"}
              onChange={(event) => {
                updateLedgerMutation.mutate({
                  timeZone: event.target.value === "auto" ? null : event.target.value,
                });
              }}
              disabled={isPending}
              aria-label={t("timeZone")}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 sm:w-auto"
            >
              <option value="auto">
                {deviceTimeZone == null
                  ? t("timeZoneAuto")
                  : t("timeZoneAutoDetected", { timeZone: deviceTimeZone })}
              </option>
              {[
                "Asia/Shanghai",
                "Asia/Tokyo",
                "Asia/Singapore",
                "Europe/London",
                "Europe/Paris",
                "America/New_York",
                "America/Chicago",
                "America/Denver",
                "America/Los_Angeles",
                "Australia/Sydney",
                "UTC",
              ].map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          </SettingsField>
          <CurrencySection
            settings={{
              ...settingsLedger.metadata?.settings,
              currencies: settingsLedger.metadata?.settings?.currencies || [],
            }}
            onUpdateSettings={(data) => updateLedgerMutation.mutateAsync(data)}
          />
          {categories.length > 0 && (
            <CategorySection
              categories={categories}
              uncategorizedCount={uncategorizedCount}
              onCreateCategory={(name) => createCategory.mutateAsync({ name })}
              onUpdateCategory={(id, data) => updateCategory.mutateAsync({ id, data })}
              onDeleteCategory={(id) => deleteCategory.mutateAsync(id)}
              onReorderCategories={(ids) => reorderCategories.mutateAsync(ids)}
              generatingCategoryIds={generatingCategoryIds}
              failedCategoryIds={failedCategoryIds}
              onRetryMetadata={retryCategoryMetadata}
              isReordering={reorderCategories.isPending}
              isCreating={createCategory.isPending}
            />
          )}
        </SettingsSection>

        <SettingsSection title={t("aiParsing")}>
          <SettingsField title={t("aiLanguage")}>
            <select
              value={settingsLedger.metadata?.settings?.aiLanguage ?? "zh-CN"}
              onChange={(e) => updateLedgerMutation.mutate({ aiLanguage: e.target.value })}
              disabled={isPending}
              aria-label={t("aiLanguage")}
              className="max-w-[150px] rounded-md border border-border bg-bg px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            >
              {AI_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField title={t("aiPrompt")} description={t("aiPromptDesc")} stacked>
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
              aria-label={t("aiPrompt")}
              placeholder={t("aiPromptPlaceholder")}
              className="min-h-[100px] w-full resize-y rounded-md border border-border bg-bg p-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
          </SettingsField>
        </SettingsSection>

        <SettingsSection title={t("account")}>
          <SettingsField title={ta("emailSection")}>
            <EmailChangeForm currentEmail={displayEmail} onChanged={setDisplayEmail} />
          </SettingsField>
          <SettingsField title={ta("passwordSection")}>
            <PasswordForm hasPassword={hasPassword} passwordUpdatedAt={passwordUpdatedAt} />
          </SettingsField>
          <ServiceCredentialSection
            credentials={credentials ?? []}
            onCreateCredential={(name) => createCredential.mutateAsync(name)}
            onDeleteCredential={(id) => deleteCredential.mutate(id)}
          />
          <SettingsField title={t("signOut")}>
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
