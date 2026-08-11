import type { ReactNode } from "react";
import { AmountText } from "@/modules/currency/ui";

interface EntriesToolbarShellProps {
  children: ReactNode;
  totalLabel?: string | undefined;
  batchActions?: ReactNode | undefined;
  syncStatus?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  className?: string;
}

export function EntriesToolbarShell({
  children,
  totalLabel,
  batchActions,
  syncStatus,
  actions,
  className = "",
}: EntriesToolbarShellProps) {
  return (
    <div
      data-testid="entries-toolbar"
      className={`mx-2 mb-2 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 sm:mb-4 ${className}`}
    >
      {children}
      {syncStatus != null ? (
        <div
          className="order-last min-w-0 basis-full text-xs text-muted-foreground sm:order-none sm:basis-auto"
          data-testid="toolbar-sync-status"
        >
          {syncStatus}
        </div>
      ) : null}
      {totalLabel != null && totalLabel !== "" ? (
        <AmountText variant="summary" className="ml-auto whitespace-nowrap">
          {totalLabel}
        </AmountText>
      ) : null}
      {actions != null ? (
        <div className={totalLabel == null ? "ml-auto" : undefined}>{actions}</div>
      ) : null}
      {batchActions != null ? <div className="min-w-0 basis-full">{batchActions}</div> : null}
    </div>
  );
}
