import { EntryGroupHeader } from "@/components/EntryGroupHeader";
import { getDateInTimezone, parseDateString } from "@/lib/date-utils";
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
  const dateLabel = (() => {
    if (group.dateProvenance === "unknown") return t("dateUnknown");
    const date = new Date(group.date + "T00:00:00");
    if (isNaN(date.getTime())) return group.date;
    return formatLocalizedDate(date, locale, t("today"), t("yesterday"), timeZone);
  })();
  const provenanceNote = group.dateProvenance === "submitted" ? t("submittedGroupSuffix") : "";

  return (
    <EntryGroupHeader
      title={dateLabel}
      {...(provenanceNote !== "" ? { subtitle: provenanceNote } : {})}
      totalLabel={formatCurrencyAmount(group.total, mainCurrency, locale)}
    />
  );
}

function formatLocalizedDate(
  date: Date,
  locale: string,
  todayLabel: string,
  yesterdayLabel: string,
  timeZone?: string
) {
  const toLocalKey = (value: Date) =>
    [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  const value = toLocalKey(date);
  const zonedToday = getDateInTimezone(timeZone);
  const today = zonedToday != null ? parseDateString(zonedToday) : new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (value === toLocalKey(today)) return todayLabel;
  if (value === toLocalKey(yesterday)) return yesterdayLabel;
  return date.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" });
}
