import { afterEach, describe, expect, it, vi } from "vitest";
import {
  datesToPeriodParams,
  parsePeriodFromSearchParams,
  periodToDateRange,
} from "@/lib/period-utils";

describe("period-utils", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves unbounded and current calendar periods", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 12));

    expect(periodToDateRange({ period: "all" })).toEqual({ startDate: null, endDate: null });
    expect(periodToDateRange({ period: "thisMonth" })).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect(periodToDateRange({ period: "lastMonth" })).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
  });

  it("clamps rolling periods at short months and leap days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 31, 12));
    expect(periodToDateRange({ period: "month" })).toEqual({
      startDate: "2026-04-30",
      endDate: "2026-05-31",
    });

    vi.setSystemTime(new Date(2024, 1, 29, 12));
    expect(periodToDateRange({ period: "year" })).toEqual({
      startDate: "2023-02-28",
      endDate: "2024-02-29",
    });
  });

  it("rolls the previous month across a year boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12));
    expect(periodToDateRange({ period: "lastMonth" })).toEqual({
      startDate: "2025-12-01",
      endDate: "2025-12-31",
    });
  });

  it("preserves a complete custom range and defaults incomplete or unknown ranges", () => {
    expect(
      periodToDateRange({ period: "custom", startDate: "2024-01-15", endDate: "2024-01-20" })
    ).toEqual({ startDate: "2024-01-15", endDate: "2024-01-20" });
    expect(periodToDateRange({ period: "custom" })).toMatchObject({
      startDate: expect.any(String),
      endDate: expect.any(String),
    });
    expect(
      periodToDateRange({ period: "invalid" as Parameters<typeof periodToDateRange>[0]["period"] })
    ).toMatchObject({ startDate: expect.any(String), endDate: expect.any(String) });
  });

  it("parses supported URL and Next.js search parameter shapes", () => {
    expect(parsePeriodFromSearchParams(new URLSearchParams("period=week"))).toEqual({
      period: "week",
    });
    expect(parsePeriodFromSearchParams({ period: ["lastMonth", "all"] })).toEqual({
      period: "lastMonth",
    });
    expect(
      parsePeriodFromSearchParams(
        new URLSearchParams("period=custom&startDate=2024-01-01&endDate=2024-01-31")
      )
    ).toEqual({ period: "custom", startDate: "2024-01-01", endDate: "2024-01-31" });
  });

  it("drops irrelevant dates and defaults invalid or incomplete URL periods", () => {
    expect(
      parsePeriodFromSearchParams(
        new URLSearchParams("period=week&startDate=2024-01-01&endDate=2024-01-31")
      )
    ).toEqual({ period: "week" });
    for (const query of [
      "",
      "period=invalid",
      "period=custom",
      "period=custom&startDate=2024-01-01",
    ]) {
      expect(parsePeriodFromSearchParams(new URLSearchParams(query))).toEqual({
        period: "thisMonth",
      });
    }
  });

  it("round-trips complete date selections and defaults incomplete selections", () => {
    const params = datesToPeriodParams(new Date(2023, 11, 25), new Date(2024, 0, 5));
    expect(params).toEqual({
      period: "custom",
      startDate: "2023-12-25",
      endDate: "2024-01-05",
    });
    expect(periodToDateRange(params)).toEqual({
      startDate: "2023-12-25",
      endDate: "2024-01-05",
    });
    expect(datesToPeriodParams()).toEqual({ period: "thisMonth" });
    expect(datesToPeriodParams(new Date(2024, 0, 1))).toEqual({ period: "thisMonth" });
  });
});
