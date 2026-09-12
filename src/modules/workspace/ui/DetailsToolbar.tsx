import type { ReactNode } from "react";
import { EntriesToolbarShell } from "./EntriesToolbarShell";

interface DetailsToolbarProps {
  totalLabel?: string;
  children?: ReactNode;
  batchActions?: ReactNode;
  actions?: ReactNode;
  onRefresh?: (() => Promise<unknown> | unknown) | undefined;
  isRefreshing?: boolean | undefined;
}

export function DetailsToolbar({
  totalLabel,
  children,
  batchActions,
  actions,
  onRefresh,
  isRefreshing,
}: DetailsToolbarProps) {
  return (
    <EntriesToolbarShell
      totalLabel={totalLabel}
      batchActions={batchActions}
      actions={actions}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
    >
      {children}
    </EntriesToolbarShell>
  );
}
