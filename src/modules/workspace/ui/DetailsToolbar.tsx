import type { ReactNode } from "react";

interface DetailsToolbarProps {
  totalLabel: string;
  children?: ReactNode;
}

export function DetailsToolbar({ totalLabel, children }: DetailsToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
        {children}
        <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
          {totalLabel}
        </span>
      </div>
    </div>
  );
}
