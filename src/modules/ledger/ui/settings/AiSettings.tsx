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
import { SettingsSectionActions } from "./SettingsSectionActions";
import { useEffect, useMemo, useState } from "react";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";

interface AiSettingsProps {
  settings: Settings;
  onUpdateSettings: (data: Partial<Settings>) => void | Promise<unknown>;
}

export function AiSettings({ settings, onUpdateSettings }: AiSettingsProps) {
  const t = useTranslations("Settings");
  const incoming = useMemo(() => normalizeAiSettings(settings), [settings]);
  const [server, setServer] = useState(incoming);
  const [draft, setDraft] = useState(incoming);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [serverChanged, setServerChanged] = useState(false);
  const dirty = !aiSettingsEqual(server, draft);

  if (!aiSettingsEqual(server, incoming)) {
    setServer(incoming);
    if (dirty) {
      setServerChanged(true);
    } else {
      setDraft(incoming);
      setServerChanged(false);
    }
  }

  useEffect(() => {
    const key = "settings:ai";
    useUnsavedChangesStore.getState().setDirty(key, dirty);
    return () => useUnsavedChangesStore.getState().setDirty(key, false);
  }, [dirty]);

  const updateDraft = (patch: Partial<Settings>) => {
    setDraft((current) => normalizeAiSettings({ ...current, ...patch }));
    setError(null);
  };

  const handleSave = async () => {
    const patch = buildAiPatch(server, draft);
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
    <SettingsSection title={t("aiParsing")}>
      <SettingsField title={t("aiLanguage")} description={t("aiLanguageDesc")}>
        <Select
          value={draft.aiLanguage}
          onValueChange={(value) => updateDraft({ aiLanguage: value })}
          disabled={status === "saving"}
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
          checked={draft.duplicateDetectionEnabled}
          onCheckedChange={(checked) => updateDraft({ duplicateDetectionEnabled: checked })}
          disabled={status === "saving"}
        />
      </SettingsField>
      <SettingsField title={t("aiPrompt")} description={t("aiPromptDesc")} stacked>
        <Textarea
          value={draft.aiCustomPrompt}
          onChange={(event) => updateDraft({ aiCustomPrompt: event.target.value })}
          disabled={status === "saving"}
          aria-label={t("aiPrompt")}
          placeholder={t("aiPromptPlaceholder")}
          maxLength={4000}
          className="min-h-[100px] w-full resize-y"
        />
      </SettingsField>
      <SettingsSectionActions
        dirty={dirty}
        pending={status === "saving"}
        error={error}
        serverChanged={serverChanged}
        onSave={() => void handleSave()}
        onCancel={handleCancel}
      />
    </SettingsSection>
  );
}

export type { AiSettingsProps };

interface AiDraft {
  aiLanguage: string;
  duplicateDetectionEnabled: boolean;
  aiCustomPrompt: string;
}

function normalizeAiSettings(settings: Partial<Settings>): AiDraft {
  return {
    aiLanguage: settings.aiLanguage ?? "zh-CN",
    duplicateDetectionEnabled: settings.duplicateDetectionEnabled ?? true,
    aiCustomPrompt: settings.aiCustomPrompt ?? "",
  };
}

function aiSettingsEqual(left: AiDraft, right: AiDraft): boolean {
  return (
    left.aiLanguage === right.aiLanguage &&
    left.duplicateDetectionEnabled === right.duplicateDetectionEnabled &&
    left.aiCustomPrompt === right.aiCustomPrompt
  );
}

function buildAiPatch(server: AiDraft, draft: AiDraft): Partial<Settings> {
  const patch: Partial<Settings> = {};
  if (server.aiLanguage !== draft.aiLanguage) patch.aiLanguage = draft.aiLanguage;
  if (server.duplicateDetectionEnabled !== draft.duplicateDetectionEnabled) {
    patch.duplicateDetectionEnabled = draft.duplicateDetectionEnabled;
  }
  if (server.aiCustomPrompt !== draft.aiCustomPrompt) {
    patch.aiCustomPrompt = draft.aiCustomPrompt;
  }
  return patch;
}
