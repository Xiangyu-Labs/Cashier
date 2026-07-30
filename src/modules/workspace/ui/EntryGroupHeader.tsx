interface EntryGroupHeaderProps {
  title: string;
  totalLabel?: string;
  subtitle?: string;
}

export function EntryGroupHeader({ title, totalLabel, subtitle }: EntryGroupHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/80 px-1 pb-2 pt-3">
      <h3 className="min-w-0 text-xs font-medium text-muted-foreground">
        {title}
        {subtitle != null && subtitle !== "" && (
          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60">
            {subtitle}
          </span>
        )}
      </h3>
      {totalLabel != null && totalLabel !== "" && (
        <AmountText variant="group">{totalLabel}</AmountText>
      )}
    </div>
  );
}
import { AmountText } from "@/modules/currency/ui";
