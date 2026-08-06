"use client";
import type { EntryCategoryWithCount, Ledger } from "@/modules/ledger/contracts";
import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BookkeepingSettings } from "./settings/BookkeepingSettings";
import { AiSettings } from "./settings/AiSettings";
import { AccountSettings } from "./settings/AccountSettings";
import { SettingsSection } from "./settings/SettingsSection";
import { SettingsField } from "./settings/SettingsField";
import { invalidateLedger, invalidateLedgerSettings } from "@/lib/query-keys";
import { useCategoryMutations } from "@/modules/ledger/hooks/useCategoryMutations";
import { useCredentialMutations } from "@/modules/ledger/hooks/useCredentialMutations";
import { useLedgerSettings } from "@/modules/ledger/hooks/useLedgerSettings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { UI_LANGUAGES } from "@/config/languages";
import { signOut } from "next-auth/react";
import { useEffect, useState, useTransition } from "react";
import { updateUserPreferencesAction } from "@/modules/auth/server-actions/user-preferences";
import type { InterfaceLanguage } from "@/modules/auth/contracts";
import { toast } from "sonner";
import { clearUserCacheData } from "@/lib/client-cache";
import { useRegisterPullToRefresh } from "@/modules/workspace/pull-to-refresh-context";
import type { TabQueryStateReport } from "@/modules/workspace/ui/tab-query-state";

interface SettingsTabProps {
  ledger: Ledger;
  initialCategories: EntryCategoryWithCount[];
  ledgerId: string;
  /** Server-derived user email (avoids useSession in a SessionProvider). */
  userEmail?: string;
  hasPassword?: boolean;
  passwordUpdatedAt?: string | null;
  interfaceLanguage?: InterfaceLanguage;
  onQueryStateChange?: (report: TabQueryStateReport) => void;
}

export function SettingsTab({
  ledger,
  initialCategories,
  ledgerId,
  userEmail,
  hasPassword = false,
  passwordUpdatedAt = null,
  interfaceLanguage = "auto",
  onQueryStateChange,
}: SettingsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Settings");
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
    settingsQueryKey,
    settingsQueryStatus,
    settingsQueryIsFetching,
  } = useLedgerSettings({ ledgerId, ledger, initialCategories });

  useEffect(() => {
    onQueryStateChange?.({
      ledgerId,
      tab: "settings",
      queryKey: settingsQueryKey,
      status: settingsQueryStatus,
      isFetching: settingsQueryIsFetching,
    });
  }, [
    ledgerId,
    onQueryStateChange,
    settingsQueryIsFetching,
    settingsQueryKey,
    settingsQueryStatus,
  ]);

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

  useRegisterPullToRefresh(handleRefresh);

  // Theme key mapping for translations
  const themeKeyMap = { system: "themeAuto", light: "themeLight", dark: "themeDark" } as const;
  const handleSignOut = async () => {
    await clearUserCacheData(ledger.userId).catch(() => {});
    await signOut({ callbackUrl: "/login" });
  };

  return (
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
                  {t(themeKeyMap[themeName])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>
        <SettingsField title={t("uiLanguage")}>
          <Select
            value={languagePreference}
            onValueChange={(value) => {
              const preference = value as InterfaceLanguage;
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
          >
            <SelectTrigger aria-label={t("uiLanguage")} className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {UI_LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.value === "auto" ? t("uiLanguageAuto") : lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsSection>

      <BookkeepingSettings
        settings={settingsLedger.settings}
        categories={categories}
        uncategorizedCount={uncategorizedCount}
        deviceTimeZone={deviceTimeZone}
        isPending={isPending}
        onUpdateSettings={(data) => updateLedgerMutation.mutateAsync(data)}
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

      <AiSettings
        settings={settingsLedger.settings}
        isPending={isPending}
        onUpdateSettings={(data) => updateLedgerMutation.mutateAsync(data)}
      />

      <AccountSettings
        displayEmail={displayEmail}
        hasPassword={hasPassword}
        passwordUpdatedAt={passwordUpdatedAt}
        credentials={credentials ?? []}
        isPending={isPending}
        onEmailChanged={setDisplayEmail}
        onCreateCredential={(name) => createCredential.mutateAsync(name)}
        onDeleteCredential={(id) => deleteCredential.mutate(id)}
        onCredentialDialogClose={createCredential.reset}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
