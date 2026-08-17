import { Button } from "@/components/ui/button";
import { Trash2, FileText, Save, X, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

interface EntryActionsProps {
  hasPendingChanges: boolean;
  isEditMode: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onViewSourceDocument?: () => void;
  onDelete: () => void;
  onSave: () => void;
  disabled?: boolean;
}

export function EntryActions({
  hasPendingChanges,
  isEditMode,
  onEdit,
  onCancelEdit,
  onViewSourceDocument,
  onDelete,
  onSave,
  disabled = false,
}: EntryActionsProps) {
  const t = useTranslations("LedgerEntryDetail");
  const tCommon = useTranslations("Common");

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 bg-surface/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm sm:rounded-b-lg sm:p-4">
      <div className="flex gap-2">
        {onViewSourceDocument && (
          <Button
            variant="outline"
            disabled={disabled}
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
          disabled={disabled}
          onClick={onDelete}
          size="sm"
          className="h-9 px-3 gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{tCommon("delete")}</span>
        </Button>
      </div>

      {isEditMode ? (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="h-9"
            disabled={disabled}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            {t("cancelEdit")}
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={disabled || !hasPendingChanges}
            className="h-9 gap-1.5 shadow-lg shadow-primary/20"
          >
            <Save className="h-3.5 w-3.5" />
            {tCommon("save")}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="h-9 gap-1.5"
          disabled={disabled}
        >
          <Pencil className="h-3.5 w-3.5" />
          {tCommon("edit")}
        </Button>
      )}
    </div>
  );
}
