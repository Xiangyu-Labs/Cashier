import { EntryGroupHeader } from "@/components/EntryGroupHeader";
import { formatRelativeDateLabel } from "@/lib/date-utils";
import { formatCurrencyAmount } from "@/lib/format/currency";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import { useLocale, useTranslations } from "next-intl";

export function UnifiedGroupHeader({
  group,
  mainCurrency,
  timeZone,
}: {
  group: UnifiedStreamGroup;
  mainCurrency: string;
  timeZone?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");
  const dateLabel =
    group.dateProvenance === "unknown"
      ? t("dateUnknown")
      : formatRelativeDateLabel(
          group.date,
          locale,
          { today: tCommon("today"), yesterday: tCommon("yesterday") },
          timeZone
        );

  return (
    <EntryGroupHeader
      title={dateLabel}
      totalLabel={formatCurrencyAmount(group.total, mainCurrency, locale)}
    />
  );
}
