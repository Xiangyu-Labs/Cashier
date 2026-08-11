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
import { useEffect, useState } from "react";
import { updateUserPreferencesAction } from "@/modules/auth/server-actions/user-preferences";
import type { InterfaceLanguage } from "@/modules/auth/contracts";
import { clearUserCacheDataSafely } from "@/lib/client-cache";
import { RefreshButton } from "@/components/ui/refresh-button";
import type { TabQueryStateReport } from "@/modules/workspace/ui/tab-query-state";
import { SettingsSectionActions } from "./settings/SettingsSectionActions";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";

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
  const [deviceTimeZone, setDeviceTimeZone] = useState<string | null>(null);
  const [appearanceServer, setAppearanceServer] = useState({
    theme: theme ?? "system",
    language: interfaceLanguage,
  });
  const [appearanceDraft, setAppearanceDraft] = useState(appearanceServer);
  const [appearanceStatus, setAppearanceStatus] = useState<"idle" | "saving" | "error">("idle");
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const appearanceDirty =
    appearanceServer.theme !== appearanceDraft.theme ||
    appearanceServer.language !== appearanceDraft.language;

  const nextAppearanceServer = { theme: theme ?? "system", language: interfaceLanguage };
  if (
    nextAppearanceServer.theme !== appearanceServer.theme ||
    nextAppearanceServer.language !== appearanceServer.language
  ) {
    const nextServer = nextAppearanceServer;
    setAppearanceServer(nextServer);
    if (!appearanceDirty) setAppearanceDraft(nextServer);
  }

  useEffect(() => {
    const key = "settings:appearance";
    useUnsavedChangesStore.getState().setDirty(key, appearanceDirty);
    return () => useUnsavedChangesStore.getState().setDirty(key, false);
  }, [appearanceDirty]);

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

  const { saveCategories, generatingCategoryIds, failedCategoryIds, retryCategoryMetadata } =
    useCategoryMutations(ledgerId, categories);

  const { createCredential, deleteCredential } = useCredentialMutations(ledgerId);

  // Theme key mapping for translations
  const themeKeyMap = { system: "themeAuto", light: "themeLight", dark: "themeDark" } as const;
  const handleSignOut = async () => {
    await clearUserCacheDataSafely(
      ledger.userId,
      { userId: ledger.userId, ledgerId },
      "Failed to clear startup cache before sign-out"
    );
    await signOut({ callbackUrl: "/login" });
  };

  const handleSaveAppearance = async () => {
    if (!appearanceDirty || appearanceStatus === "saving") return;
    setAppearanceStatus("saving");
    setAppearanceError(null);
    try {
      let savedLanguage = appearanceDraft.language;
      if (appearanceDraft.language !== appearanceServer.language) {
        const saved = await updateUserPreferencesAction({
          interfaceLanguage: appearanceDraft.language,
        });
        savedLanguage = saved.interfaceLanguage;
      }

      if (appearanceDraft.theme !== appearanceServer.theme) {
        setTheme(appearanceDraft.theme);
      }

      const savedAppearance = {
        theme: appearanceDraft.theme,
        language: savedLanguage,
      };
      setAppearanceServer(savedAppearance);
      setAppearanceDraft(savedAppearance);
      setAppearanceStatus("idle");

      if (savedLanguage !== appearanceServer.language) {
        const queryString = searchParams.toString();
        const query = queryString !== "" ? `?${queryString}` : "";
        if (savedLanguage === "auto") {
          document.cookie =
            "NEXT_LOCALE=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax";
          router.refresh();
        } else {
          document.cookie = `NEXT_LOCALE=${savedLanguage}; path=/; max-age=31536000; samesite=lax`;
          if (savedLanguage === locale) router.refresh();
          else router.push(`${pathname}${query}`, { locale: savedLanguage });
        }
      }
    } catch {
      setAppearanceStatus("error");
      setAppearanceError(t("uiLanguageSaveFailed"));
    }
  };

  const handleCancelAppearance = () => {
    setAppearanceDraft(appearanceServer);
    setAppearanceStatus("idle");
    setAppearanceError(null);
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 overflow-x-clip">
      <div className="flex justify-end">
        <RefreshButton onRefresh={handleRefresh} />
      </div>
      <SettingsSection title={t("appearanceAndLanguage")}>
        <SettingsField title={t("theme")}>
          <Select
            value={appearanceDraft.theme}
            onValueChange={(nextTheme) => {
              setAppearanceDraft((current) => ({ ...current, theme: nextTheme }));
              setAppearanceError(null);
            }}
            disabled={appearanceStatus === "saving"}
          >
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
            value={appearanceDraft.language}
            onValueChange={(value) => {
              setAppearanceDraft((current) => ({
                ...current,
                language: value as InterfaceLanguage,
              }));
              setAppearanceError(null);
            }}
            disabled={appearanceStatus === "saving"}
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
        <SettingsSectionActions
          dirty={appearanceDirty}
          pending={appearanceStatus === "saving"}
          error={appearanceError}
          onSave={() => void handleSaveAppearance()}
          onCancel={handleCancelAppearance}
        />
      </SettingsSection>

      <BookkeepingSettings
        settings={settingsLedger.settings}
        categories={categories}
        uncategorizedCount={uncategorizedCount}
        deviceTimeZone={deviceTimeZone}
        onUpdateSettings={(data) => updateLedgerMutation.mutateAsync(data)}
        onSaveCategories={(input) => saveCategories.mutateAsync(input)}
        generatingCategoryIds={generatingCategoryIds}
        failedCategoryIds={failedCategoryIds}
        onRetryMetadata={retryCategoryMetadata}
        isSavingCategories={saveCategories.isPending}
      />

      <AiSettings
        settings={settingsLedger.settings}
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
        onDeleteCredential={(id) => deleteCredential.mutateAsync(id)}
        onCredentialDialogClose={createCredential.reset}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
