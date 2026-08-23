"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface SettingsSectionActionsProps {
  dirty: boolean;
  pending: boolean;
  error: string | null;
  serverChanged?: boolean;
  saveDisabled?: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function SettingsSectionActions({
  dirty,
  pending,
  error,
  serverChanged = false,
  saveDisabled = false,
  onSave,
  onCancel,
}: SettingsSectionActionsProps) {
  const t = useTranslations("Settings");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-h-5 text-sm" aria-live="polite">
        {error === null ? null : <p className="text-destructive">{error}</p>}
        {error === null && serverChanged ? (
          <p className="text-warning">{t("serverChangedWhileEditing")}</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={!dirty || pending}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={onSave} disabled={!dirty || pending || saveDisabled}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
