import type { ReactNode } from "react";
import { AmountText } from "@/modules/currency/ui";

interface EntriesToolbarShellProps {
  children: ReactNode;
  totalLabel?: string | undefined;
  batchActions?: ReactNode | undefined;
  className?: string;
}

export function EntriesToolbarShell({
  children,
  totalLabel,
  batchActions,
  className = "",
}: EntriesToolbarShellProps) {
  return (
    <div
      data-testid="entries-toolbar"
      className={`mx-2 mb-2 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 sm:mb-4 ${className}`}
    >
      {children}
      {totalLabel != null && totalLabel !== "" ? (
        <AmountText variant="summary" className="ml-auto whitespace-nowrap">
          {totalLabel}
        </AmountText>
      ) : null}
      {batchActions != null ? <div className="min-w-0 basis-full">{batchActions}</div> : null}
    </div>
  );
}
