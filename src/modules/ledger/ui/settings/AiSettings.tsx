"use client";

import type { Settings } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { AI_LANGUAGES } from "@/config/languages";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsField } from "./SettingsField";
import { SettingsSection } from "./SettingsSection";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface AiSettingsProps {
  settings: Settings;
  isPending: boolean;
  onUpdateSettings: (data: Partial<Settings>) => void | Promise<unknown>;
}

export function AiSettings({ settings, isPending, onUpdateSettings }: AiSettingsProps) {
  const t = useTranslations("Settings");

  return (
    <SettingsSection title={t("aiParsing")}>
      <SettingsField title={t("aiLanguage")} description={t("aiLanguageDesc")}>
        <Select
          value={settings.aiLanguage ?? "zh-CN"}
          onValueChange={(value) => onUpdateSettings({ aiLanguage: value })}
          disabled={isPending}
        >
          <SelectTrigger aria-label={t("aiLanguage")} className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {AI_LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField title={t("duplicateDetection")} description={t("duplicateDetectionDesc")}>
        <Switch
          aria-label={t("duplicateDetection")}
          checked={settings.duplicateDetectionEnabled ?? true}
          onCheckedChange={(checked) => {
            onUpdateSettings({ duplicateDetectionEnabled: checked });
          }}
          disabled={isPending}
        />
      </SettingsField>
      <SettingsField title={t("aiPrompt")} description={t("aiPromptDesc")} stacked>
        <Textarea
          defaultValue={settings.aiCustomPrompt ?? ""}
          onBlur={(event) => {
            const newValue = event.target.value;
            const currentValue = settings.aiCustomPrompt ?? "";
            if (newValue !== currentValue) {
              onUpdateSettings({ aiCustomPrompt: newValue });
            }
          }}
          disabled={isPending}
          aria-label={t("aiPrompt")}
          placeholder={t("aiPromptPlaceholder")}
          maxLength={4000}
          className="min-h-[100px] w-full resize-y"
        />
      </SettingsField>
    </SettingsSection>
  );
}

export type { AiSettingsProps };
