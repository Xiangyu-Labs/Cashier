"use client";
import { useTranslations } from "next-intl";
import { compare } from "@/lib/money/decimal";

export function ExpenseDeductionBadge({ amount }: { amount: string | number }) {
  const t = useTranslations("Currency");
  if (compare(String(amount), "0") >= 0) return null;
  return <span className="text-xs font-normal text-muted-foreground">{t("expenseDeduction")}</span>;
}
