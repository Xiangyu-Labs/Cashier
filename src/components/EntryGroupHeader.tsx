import { AmountText } from "@/modules/currency/ui/amount-text";
import { textRoleClassName } from "@/components/typography";

interface EntryGroupHeaderProps {
  title: string;
  totalLabel?: string;
}

/**
 * The date that opens a group, with its total and the rule under it. A group
 * reads at 24px above the label and 16px below the rule: the list's own group
 * gap supplies the rest of the 24, and the bottom margin is the same gap the
 * rows inside the group keep.
 */
export function EntryGroupHeader({ title, totalLabel }: EntryGroupHeaderProps) {
  return (
    <div className="mx-2 mb-4 flex items-center justify-between border-b border-border/80 pb-2 pt-2">
      <h3 className={textRoleClassName("meta", "min-w-0 font-medium")}>{title}</h3>
      {totalLabel != null && totalLabel !== "" && (
        <AmountText variant="group">{totalLabel}</AmountText>
      )}
    </div>
  );
}
