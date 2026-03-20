import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, formatExchangeRateDate } from "./exchange-rate-helpers";

describe("formatExchangeRateDate", () => {
  it("returns date-only value from ISO datetime strings", () => {
    expect(formatExchangeRateDate("2026-03-20T12:34:56.789Z")).toBe("2026-03-20");
  });

  it("returns original string for date-only values", () => {
    expect(formatExchangeRateDate("2026-03-20")).toBe("2026-03-20");
  });

  it("formats Date values as yyyy-MM-dd", () => {
    expect(formatExchangeRateDate(new Date("2026-03-20T08:00:00.000Z"))).toBe("2026-03-20");
  });
});

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns response immediately on first successful attempt", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const result = await fetchWithRetry("https://example.com/rates", 3, 1);

    expect(result).toBe(response);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure and then succeeds", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(response);

    const result = await fetchWithRetry("https://example.com/rates", 2, 1);

    expect(result).toBe(response);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws the final error when retries are exhausted", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("still unavailable"));

    await expect(fetchWithRetry("https://example.com/rates", 2, 1)).rejects.toThrow(
      "still unavailable"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
