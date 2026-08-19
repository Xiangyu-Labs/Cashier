"use client";

import type { EntryCategory, SaveEntryCategoriesInput, Settings } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { CurrencySection } from "../CurrencySection";
import { CategorySection } from "../CategorySection";
import { SettingsField } from "./SettingsField";
import { SettingsSection } from "./SettingsSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsSectionActions } from "./SettingsSectionActions";
import { useEffect, useMemo, useState } from "react";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";

interface BookkeepingSettingsProps {
  settings: Settings;
  categories: EntryCategory[];
  uncategorizedCount: number;
  deviceTimeZone: string | null;
  onUpdateSettings: (data: Partial<Settings>) => void | Promise<unknown>;
  onSaveCategories: (input: SaveEntryCategoriesInput) => Promise<EntryCategory[]>;
  generatingCategoryIds: Set<string>;
  failedCategoryIds: Set<string>;
  onRetryMetadata: (id: string) => void;
  isSavingCategories: boolean;
}

export function BookkeepingSettings({
  settings,
  categories,
  uncategorizedCount,
  deviceTimeZone,
  onUpdateSettings,
  onSaveCategories,
  generatingCategoryIds,
  failedCategoryIds,
  onRetryMetadata,
  isSavingCategories,
}: BookkeepingSettingsProps) {
  const t = useTranslations("Settings");
  const incoming = useMemo(() => normalizeBookkeepingSettings(settings), [settings]);
  const [server, setServer] = useState(incoming);
  const [draft, setDraft] = useState(incoming);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [serverChanged, setServerChanged] = useState(false);
  const dirty = !bookkeepingSettingsEqual(server, draft);

  if (!bookkeepingSettingsEqual(server, incoming)) {
    setServer(incoming);
    if (dirty) {
      setServerChanged(true);
    } else {
      setDraft(incoming);
      setServerChanged(false);
    }
  }

  useEffect(() => {
    const key = "settings:bookkeeping";
    useUnsavedChangesStore.getState().setDirty(key, dirty);
    return () => useUnsavedChangesStore.getState().setDirty(key, false);
  }, [dirty]);

  const updateDraft = (patch: Partial<Settings>) => {
    setDraft((current) => normalizeBookkeepingSettings({ ...current, ...patch }));
    setError(null);
  };

  const handleSave = async () => {
    if (!draft.currencies.includes(draft.mainCurrency)) {
      setStatus("error");
      setError(t("mainCurrencyMustBeEnabled"));
      return;
    }

    const patch = buildBookkeepingPatch(server, draft);
    if (Object.keys(patch).length === 0) return;
    setStatus("saving");
    setError(null);
    try {
      await onUpdateSettings(patch);
      setServer(draft);
      setStatus("idle");
      setServerChanged(false);
    } catch {
      setStatus("error");
      setError(t("updateFailed"));
    }
  };

  const handleCancel = () => {
    setDraft(server);
    setStatus("idle");
    setError(null);
    setServerChanged(false);
  };

  return (
    <SettingsSection title={t("bookkeepingRules")}>
      <SettingsField title={t("collapseEntries")} description={t("collapseEntriesDesc")}>
        <Switch
          aria-label={t("collapseEntries")}
          checked={draft.collapseEntriesDefault}
          onCheckedChange={(checked) => updateDraft({ collapseEntriesDefault: checked })}
          disabled={status === "saving"}
        />
      </SettingsField>
      <SettingsField title={t("timeZone")} description={t("timeZoneDesc")}>
        <Select
          value={draft.timeZone ?? "auto"}
          onValueChange={(value) => updateDraft({ timeZone: value === "auto" ? null : value })}
          disabled={status === "saving"}
        >
          <SelectTrigger aria-label={t("timeZone")} className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="auto">
              {deviceTimeZone == null
                ? t("timeZoneAuto")
                : t("timeZoneAutoDetected", { timeZone: deviceTimeZone })}
            </SelectItem>
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
              <SelectItem key={timeZone} value={timeZone}>
                {timeZone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>
      <CurrencySection
        settings={draft}
        onUpdateSettings={updateDraft}
        disabled={status === "saving"}
      />
      <SettingsSectionActions
        dirty={dirty}
        pending={status === "saving"}
        error={error}
        serverChanged={serverChanged}
        onSave={() => void handleSave()}
        onCancel={handleCancel}
      />
      <CategorySection
        categories={categories}
        uncategorizedCount={uncategorizedCount}
        onSaveCategories={onSaveCategories}
        generatingCategoryIds={generatingCategoryIds}
        failedCategoryIds={failedCategoryIds}
        onRetryMetadata={onRetryMetadata}
        isSaving={isSavingCategories}
      />
    </SettingsSection>
  );
}

export type { BookkeepingSettingsProps };

interface BookkeepingDraft {
  mainCurrency: string;
  currencies: string[];
  collapseEntriesDefault: boolean;
  timeZone: string | null;
}

function normalizeBookkeepingSettings(settings: Partial<Settings>): BookkeepingDraft {
  return {
    mainCurrency: settings.mainCurrency ?? "CNY",
    currencies: [...(settings.currencies ?? [])],
    collapseEntriesDefault: settings.collapseEntriesDefault ?? false,
    timeZone: settings.timeZone ?? null,
  };
}

function bookkeepingSettingsEqual(left: BookkeepingDraft, right: BookkeepingDraft): boolean {
  return (
    left.mainCurrency === right.mainCurrency &&
    left.collapseEntriesDefault === right.collapseEntriesDefault &&
    left.timeZone === right.timeZone &&
    left.currencies.length === right.currencies.length &&
    left.currencies.every((currency, index) => currency === right.currencies[index])
  );
}

function buildBookkeepingPatch(
  server: BookkeepingDraft,
  draft: BookkeepingDraft
): Partial<Settings> {
  const patch: Partial<Settings> = {};
  if (server.mainCurrency !== draft.mainCurrency) patch.mainCurrency = draft.mainCurrency;
  if (server.collapseEntriesDefault !== draft.collapseEntriesDefault) {
    patch.collapseEntriesDefault = draft.collapseEntriesDefault;
  }
  if (server.timeZone !== draft.timeZone) patch.timeZone = draft.timeZone;
  if (
    server.currencies.length !== draft.currencies.length ||
    server.currencies.some((currency, index) => currency !== draft.currencies[index])
  ) {
    patch.currencies = draft.currencies;
  }
  return patch;
}
