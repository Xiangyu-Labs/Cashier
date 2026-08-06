"use client";

import type { EntryCategory, Settings } from "@/modules/ledger/contracts";
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

interface BookkeepingSettingsProps {
  settings: Settings;
  categories: EntryCategory[];
  uncategorizedCount: number;
  deviceTimeZone: string | null;
  isPending: boolean;
  onUpdateSettings: (data: Partial<Settings>) => void | Promise<unknown>;
  onCreateCategory: (name: string) => Promise<EntryCategory>;
  onUpdateCategory: (id: string, data: Partial<EntryCategory>) => void | Promise<unknown>;
  onDeleteCategory: (id: string) => void | Promise<unknown>;
  onReorderCategories: (ids: string[]) => void | Promise<unknown>;
  generatingCategoryIds: Set<string>;
  failedCategoryIds: Set<string>;
  onRetryMetadata: (id: string) => void;
  isReordering: boolean;
  isCreating: boolean;
}

export function BookkeepingSettings({
  settings,
  categories,
  uncategorizedCount,
  deviceTimeZone,
  isPending,
  onUpdateSettings,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
  generatingCategoryIds,
  failedCategoryIds,
  onRetryMetadata,
  isReordering,
  isCreating,
}: BookkeepingSettingsProps) {
  const t = useTranslations("Settings");

  return (
    <SettingsSection title={t("bookkeepingRules")}>
      <SettingsField title={t("collapseEntries")} description={t("collapseEntriesDesc")}>
        <Switch
          aria-label={t("collapseEntries")}
          checked={settings.collapseEntriesDefault ?? false}
          onCheckedChange={(checked) => {
            onUpdateSettings({ collapseEntriesDefault: checked });
          }}
          disabled={isPending}
        />
      </SettingsField>
      <SettingsField title={t("timeZone")} description={t("timeZoneDesc")}>
        <Select
          value={settings.timeZone ?? "auto"}
          onValueChange={(value) => {
            onUpdateSettings({ timeZone: value === "auto" ? null : value });
          }}
          disabled={isPending}
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
      <CurrencySection settings={settings} onUpdateSettings={onUpdateSettings} />
      {categories.length > 0 ? (
        <CategorySection
          categories={categories}
          uncategorizedCount={uncategorizedCount}
          onCreateCategory={onCreateCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          onReorderCategories={onReorderCategories}
          generatingCategoryIds={generatingCategoryIds}
          failedCategoryIds={failedCategoryIds}
          onRetryMetadata={onRetryMetadata}
          isReordering={isReordering}
          isCreating={isCreating}
        />
      ) : null}
    </SettingsSection>
  );
}

export type { BookkeepingSettingsProps };
