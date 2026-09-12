import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { textRoleClassName } from "@/components/typography";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface/70 px-4 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-bg text-muted-foreground">
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className={textRoleClassName("cardTitle")}>{title}</h3>
      {description != null && description !== "" && (
        <p className={textRoleClassName("bodyMuted", "mt-1 max-w-sm")}>{description}</p>
      )}
      {actionLabel != null && onAction != null && (
        <Button type="button" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
