import { Button } from "@/components/ui/button";
import { Trash2, FileText, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface EntryActionsProps {
  hasPendingChanges: boolean;
  onViewSourceDocument?: () => void;
  onDelete: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function EntryActions({
  hasPendingChanges,
  onViewSourceDocument,
  onDelete,
  onSave,
  onDiscard,
}: EntryActionsProps) {
  const t = useTranslations("LedgerEntryDetail");
  const tCommon = useTranslations("Common");

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 bg-surface/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm sm:rounded-b-lg sm:p-4">
      <div className="flex gap-2">
        {onViewSourceDocument && (
          <Button
            variant="outline"
            onClick={onViewSourceDocument}
            size="sm"
            className="h-9 px-3 gap-1.5 text-primary border-primary/20 hover:bg-primary/5"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("viewSource")}</span>
          </Button>
        )}

        <Button
          variant="outline"
          onClick={onDelete}
          size="sm"
          className="h-9 px-3 gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{tCommon("delete")}</span>
        </Button>
      </div>

      {hasPendingChanges ? (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard} className="h-9">
            <X className="h-3.5 w-3.5 mr-1.5" />
            {t("discardChanges")}
          </Button>
          <Button size="sm" onClick={onSave} className="h-9 gap-1.5 shadow-lg shadow-primary/20">
            <Save className="h-3.5 w-3.5" />
            {tCommon("save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
