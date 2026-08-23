import { cn } from "@/lib/utils";

export type AmountVariant = "hero" | "summary" | "group" | "item" | "secondary";

const amountVariantClasses: Record<AmountVariant, string> = {
  hero: "text-3xl font-semibold text-text sm:text-4xl",
  summary: "text-base font-semibold text-text",
  group: "text-xs font-medium text-muted-foreground",
  item: "text-base font-semibold text-text",
  secondary: "text-xs font-normal text-muted-foreground",
};

export function amountTextClassName(variant: AmountVariant, className?: string) {
  return cn("font-mono tabular-nums", amountVariantClasses[variant], className);
}

export function AmountText({
  children,
  variant,
  className,
}: {
  children: React.ReactNode;
  variant: AmountVariant;
  className?: string;
}) {
  return <span className={amountTextClassName(variant, className)}>{children}</span>;
}
