"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const common = useTranslations("Common");
  const [discardOpen, setDiscardOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-h-5 text-sm" aria-live="polite">
        {error === null ? null : <p className="text-destructive">{error}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setDiscardOpen(true)}
          disabled={!dirty || pending}
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (serverChanged || saveDisabled) toast.error(t("updateConflict"));
            else onSave();
          }}
          disabled={!dirty || pending}
        >
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={common("unsavedChangesTitle")}
        description={common("unsavedChangesDescription")}
        cancelLabel={common("continueEditing")}
        confirmLabel={common("discard")}
        variant="destructive"
        onConfirm={onCancel}
      />
    </div>
  );
}
