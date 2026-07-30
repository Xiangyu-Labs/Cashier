import type { ReactNode } from "react";
import { EntriesToolbarShell } from "./EntriesToolbarShell";

interface DetailsToolbarProps {
  totalLabel?: string;
  children?: ReactNode;
  batchActions?: ReactNode;
}

export function DetailsToolbar({ totalLabel, children, batchActions }: DetailsToolbarProps) {
  return (
    <EntriesToolbarShell totalLabel={totalLabel} batchActions={batchActions}>
      {children}
    </EntriesToolbarShell>
  );
}
