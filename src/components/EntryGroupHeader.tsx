import { AmountText } from "@/modules/currency/ui/amount-text";
import { textRoleClassName } from "@/components/typography";

interface EntryGroupHeaderProps {
  title: string;
  totalLabel?: string;
}

export function EntryGroupHeader({ title, totalLabel }: EntryGroupHeaderProps) {
  return (
    <div className="mx-2 mb-4 flex items-center justify-between border-b border-border/80 pb-2 pt-3">
      <h3 className={textRoleClassName("meta", "min-w-0 font-medium")}>{title}</h3>
      {totalLabel != null && totalLabel !== "" && (
        <AmountText variant="group">{totalLabel}</AmountText>
      )}
    </div>
  );
}
