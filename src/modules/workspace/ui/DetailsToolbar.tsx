import type { ReactNode } from "react";
import { EntriesToolbarShell } from "./EntriesToolbarShell";

interface DetailsToolbarProps {
  totalLabel?: string;
  children?: ReactNode;
  batchActions?: ReactNode;
  actions?: ReactNode;
}

export function DetailsToolbar({
  totalLabel,
  children,
  batchActions,
  actions,
}: DetailsToolbarProps) {
  return (
    <EntriesToolbarShell totalLabel={totalLabel} batchActions={batchActions} actions={actions}>
      {children}
    </EntriesToolbarShell>
  );
}
