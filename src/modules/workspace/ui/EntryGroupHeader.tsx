interface EntryGroupHeaderProps {
  title: string;
  totalLabel?: string;
}

export function EntryGroupHeader({ title, totalLabel }: EntryGroupHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/80 px-1 pb-2 pt-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {totalLabel != null && totalLabel !== "" && (
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{totalLabel}</span>
      )}
    </div>
  );
}
