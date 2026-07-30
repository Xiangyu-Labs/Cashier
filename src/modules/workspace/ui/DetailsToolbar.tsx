import type { ReactNode } from "react";
import { AmountText } from "@/modules/currency/ui";

interface DetailsToolbarProps {
  totalLabel?: string;
  children?: ReactNode;
}

export function DetailsToolbar({ totalLabel, children }: DetailsToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
        {children}
        {totalLabel != null && (
          <AmountText variant="summary" className="ml-auto">
            {totalLabel}
          </AmountText>
        )}
      </div>
    </div>
  );
}
