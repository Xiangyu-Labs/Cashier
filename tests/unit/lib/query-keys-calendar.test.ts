import { describe, it, expect } from "vitest";
import {
  invalidateCalendar,
  invalidateLedger,
  invalidateLedgerEntries,
  invalidateLedgerSettings,
  invalidateSourceDocuments,
  queryKeys,
} from "@/lib/query-keys";

describe("calendar and module invalidation helpers", () => {
  const ledgerId = "ledger-123";
  const predicate = invalidateCalendar(ledgerId);

  it("应该匹配calendarHeatmap查询", () => {
    const key = queryKeys.calendarHeatmap(ledgerId, "month", "2024-03-01", undefined);
    expect(predicate({ queryKey: key })).toBe(true);
  });

  it("应该匹配calendarHeatmapForRange查询", () => {
    const key = queryKeys.calendarHeatmapForRange(ledgerId, "2024-01-01", "2024-12-31", undefined);
    expect(predicate({ queryKey: key })).toBe(true);
  });

  it("应该匹配calendarDayDetail查询", () => {
    const key = queryKeys.calendarDayDetail(ledgerId, "2024-03-15", undefined);
    expect(predicate({ queryKey: key })).toBe(true);
  });

  it("不应该匹配其他ledger的calendar查询", () => {
    const key = queryKeys.calendarHeatmap("other-ledger", "month", "2024-03-01", undefined);
    expect(predicate({ queryKey: key })).toBe(false);
  });

  it("应该继续匹配标准ledger查询", () => {
    expect(invalidateLedger(ledgerId)({ queryKey: queryKeys.ledger(ledgerId) })).toBe(true);
    expect(
      invalidateLedgerEntries(ledgerId)({ queryKey: queryKeys.ledgerEntries(ledgerId, "all") })
    ).toBe(true);
    expect(
      invalidateSourceDocuments(ledgerId)({
        queryKey: queryKeys.sourceDocumentStream(ledgerId, { startDate: "2026-03-01" }),
      })
    ).toBe(true);
    expect(
      invalidateLedgerSettings(ledgerId)({ queryKey: queryKeys.entryCategories(ledgerId) })
    ).toBe(true);
  });
});
