import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithRetry,
  formatExchangeRateDate,
} from "@/application/adapters/postgres/exchange-rate";

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

    const result = await fetchWithRetry("https://example.com/rates");

    expect(result).toBe(response);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries a network failure and then succeeds", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(response);

    const result = await fetchWithRetry("https://example.com/rates", 3, 1);

    expect(result).toBe(response);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws the final error when retries are exhausted", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("still unavailable"));

    await expect(fetchWithRetry("https://example.com/rates", 3, 1)).rejects.toThrow(
      "still unavailable"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([408, 429, 500, 502, 503])(
    "retries HTTP %i and succeeds on a later attempt",
    async (status) => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      const result = await fetchWithRetry("https://example.com/rates", 3, 1);

      expect(result.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    }
  );

  it("throws when a retryable status persists across all attempts", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(fetchWithRetry("https://example.com/rates", 3, 1)).rejects.toThrow("HTTP 503");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([400, 404, 422])("returns HTTP %i immediately without retrying", async (status) => {
    const response = new Response(null, { status });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const result = await fetchWithRetry("https://example.com/rates", 3, 1);

    expect(result).toBe(response);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
