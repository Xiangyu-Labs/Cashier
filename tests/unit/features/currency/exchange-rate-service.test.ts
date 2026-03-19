import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExchangeRateService } from "@/modules/currency/services";
import { db } from "@/lib/db";
import { currencyRates } from "@/persistence/schema/currency";

describe("ExchangeRateService", () => {
  beforeEach(async () => {
    // Clear cache and database
    await db.delete(currencyRates);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should collapse concurrent requests for the same date", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        base: "EUR",
        date: "2024-01-15",
        rates: { USD: 1.1, CNY: 7.8 },
      }),
    } as Response);

    // Launch 5 concurrent requests for the same date
    const date = new Date("2024-01-15");
    const promises = Array(5)
      .fill(null)
      .map(() => ExchangeRateService.getRates(date));

    await Promise.all(promises);

    // Should only make one API call due to request collapsing
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should handle race condition when cache is empty", async () => {
    let callCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      callCount++;
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 50));
      return {
        ok: true,
        json: async () => ({
          base: "EUR",
          date: "2024-01-20",
          rates: { USD: 1.2 },
        }),
      } as Response;
    });

    const date = new Date("2024-01-20");

    // Rapid-fire concurrent requests
    const promises = Array(10)
      .fill(null)
      .map(() => ExchangeRateService.getRates(date));

    const results = await Promise.all(promises);

    // All should return the same result
    expect(new Set(results.map((r) => r.rates.USD)).size).toBe(1);
    // But only one API call should be made
    expect(callCount).toBe(1);
  });
});
