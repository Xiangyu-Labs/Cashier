import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExchangeRateService } from "@/application/adapters/postgres/exchange-rate";
import { db } from "@/lib/db";
import { currencyRates } from "@/persistence/schema/currency";
import { eq } from "drizzle-orm";

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
    let resolveFetch!: (response: Response) => void;
    const fetchGate = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      callCount++;
      return fetchGate;
    });

    const date = new Date("2024-01-20");

    // Rapid-fire concurrent requests
    const promises = Array(10)
      .fill(null)
      .map(() => ExchangeRateService.getRates(date));

    const allResults = Promise.all(promises);
    await vi.waitFor(() => expect(callCount).toBe(1));
    resolveFetch({
      ok: true,
      json: async () => ({
        base: "EUR",
        date: "2024-01-20",
        rates: { USD: 1.2 },
      }),
    } as Response);
    const results = await allResults;

    // All should return the same result
    expect(new Set(results.map((r) => r.rates.USD)).size).toBe(1);
    // But only one API call should be made
    expect(callCount).toBe(1);
  });

  it("emits rates-stored event once for newly inserted date", async () => {
    const onStored = vi.fn();
    const unsubscribe = ExchangeRateService.registerRatesStoredHandler(onStored);

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        base: "EUR",
        date: "2024-01-21",
        rates: { USD: 1.15, CNY: 7.7 },
      }),
    } as Response);

    await ExchangeRateService.getRates("2024-01-21");
    await ExchangeRateService.getRates("2024-01-21");

    expect(onStored).toHaveBeenCalledTimes(1);
    expect(onStored).toHaveBeenCalledWith({
      base: "EUR",
      date: "2024-01-21",
      rates: { USD: 1.15, CNY: 7.7 },
    });

    unsubscribe();
  });

  it("rejects an invalid provider payload without writing to the database", async () => {
    const onStored = vi.fn();
    const unsubscribe = ExchangeRateService.registerRatesStoredHandler(onStored);

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        base: "EUR",
        date: "not-a-date",
        rates: { USD: 1.1 },
      }),
    } as Response);

    await expect(ExchangeRateService.getRates("2024-01-22")).rejects.toThrow(
      "Invalid exchange-rate provider response"
    );

    const persisted = await db.query.currencyRates.findFirst({
      where: eq(currencyRates.date, "2024-01-22"),
    });
    expect(persisted).toBeUndefined();
    expect(onStored).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("rejects unsupported or non-positive provider rates without writing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        base: "EUR",
        date: "2024-01-23",
        rates: { USD: -1.1, CNY: 7.8 },
      }),
    } as Response);

    await expect(ExchangeRateService.getRates("2024-01-23")).rejects.toThrow(
      "Invalid exchange-rate provider response"
    );

    const persisted = await db.query.currencyRates.findFirst({
      where: eq(currencyRates.date, "2024-01-23"),
    });
    expect(persisted).toBeUndefined();
  });
});
