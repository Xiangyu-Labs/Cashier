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
  const [touchedFields, setTouchedFields] = useState<Set<AiField>>(new Set());
  const dirty = !aiSettingsEqual(server, draft);

  if (!aiSettingsEqual(server, incoming)) {
    const touchedServerFieldsChanged = aiFields.some(
      (field) => touchedFields.has(field) && server[field] !== incoming[field]
    );
    setServer(incoming);
    setDraft((current) => rebaseAiDraft(current, incoming, touchedFields));
    setServerChanged((current) => current || touchedServerFieldsChanged);
  }

  useEffect(() => {
    const key = "settings:ai";
    useUnsavedChangesStore.getState().setDirty(key, dirty);
    return () => useUnsavedChangesStore.getState().setDirty(key, false);
  }, [dirty]);

  const updateDraft = (patch: Partial<Settings>) => {
    setDraft((current) => normalizeAiSettings({ ...current, ...patch }));
    setTouchedFields((current) => {
      const next = new Set(current);
      for (const field of aiFields) {
        if (field in patch) next.add(field);
      }
      return next;
    });
    setError(null);
  };

  const handleSave = async () => {
    if (serverChanged) return;
    const patch = buildAiPatch(server, draft, touchedFields);
    if (Object.keys(patch).length === 0) {
      setTouchedFields(new Set());
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const result = await onUpdateSettings(patch);
      const savedSettings = extractSettings(result, patch);
      const nextServer = normalizeAiSettings({ ...draft, ...savedSettings });
      setServer(nextServer);
      setDraft(nextServer);
      setTouchedFields(new Set());
      setStatus("idle");
      setServerChanged(false);
    } catch {
      setStatus("error");
      setError(t("updateFailed"));
    }
  };

  const handleCancel = () => {
    setDraft(server);
    setTouchedFields(new Set());
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
        saveDisabled={serverChanged}
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

type AiField = keyof AiDraft;
const aiFields: readonly AiField[] = ["aiLanguage", "duplicateDetectionEnabled", "aiCustomPrompt"];

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

function buildAiPatch(
  server: AiDraft,
  draft: AiDraft,
  touchedFields: ReadonlySet<AiField>
): Partial<Settings> {
  const patch: Partial<Settings> = {};
  if (touchedFields.has("aiLanguage") && server.aiLanguage !== draft.aiLanguage) {
    patch.aiLanguage = draft.aiLanguage;
  }
  if (
    touchedFields.has("duplicateDetectionEnabled") &&
    server.duplicateDetectionEnabled !== draft.duplicateDetectionEnabled
  ) {
    patch.duplicateDetectionEnabled = draft.duplicateDetectionEnabled;
  }
  if (touchedFields.has("aiCustomPrompt") && server.aiCustomPrompt !== draft.aiCustomPrompt) {
    patch.aiCustomPrompt = draft.aiCustomPrompt;
  }
  return patch;
}

function rebaseAiDraft(
  draft: AiDraft,
  incoming: AiDraft,
  touchedFields: ReadonlySet<AiField>
): AiDraft {
  return {
    aiLanguage: touchedFields.has("aiLanguage") ? draft.aiLanguage : incoming.aiLanguage,
    duplicateDetectionEnabled: touchedFields.has("duplicateDetectionEnabled")
      ? draft.duplicateDetectionEnabled
      : incoming.duplicateDetectionEnabled,
    aiCustomPrompt: touchedFields.has("aiCustomPrompt")
      ? draft.aiCustomPrompt
      : incoming.aiCustomPrompt,
  };
}

function extractSettings(result: unknown, fallback: Partial<Settings>): Partial<Settings> {
  if (typeof result === "object" && result != null && "settings" in result) {
    const settings = (result as { settings?: unknown }).settings;
    if (typeof settings === "object" && settings != null) return settings as Partial<Settings>;
  }
  return fallback;
}
