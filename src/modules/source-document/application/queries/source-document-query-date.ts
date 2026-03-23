import { format } from "date-fns";
import { gte, lte, type SQL } from "drizzle-orm";
import { parseDateRangeEnd, parseDateRangeStart } from "@/lib/date-utils";
import { sourceDocuments } from "@/persistence";

export function buildSourceDocumentDateConditions(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (startDate != null && startDate !== "") {
    const parsedStart = parseDateRangeStart(startDate);
    if (parsedStart != null) {
      conditions.push(gte(sourceDocuments.entryDate, format(parsedStart, "yyyy-MM-dd")));
    }
  }

  if (endDate != null && endDate !== "") {
    const parsedEnd = parseDateRangeEnd(endDate);
    if (parsedEnd != null) {
      conditions.push(lte(sourceDocuments.entryDate, format(parsedEnd, "yyyy-MM-dd")));
    }
  }

  return conditions;
}
