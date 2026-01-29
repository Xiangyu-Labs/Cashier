process.env.NO_DB = "true";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExchangeRateService } from "@/lib/currency/exchange-rate-service";
import { db } from "@/lib/db";


// Mock the DB
vi.mock("@/lib/db", () => ({
    db: {
        query: {
            currencyRates: {
                findFirst: vi.fn(),
            },
        },
        insert: vi.fn(() => ({
            values: vi.fn(() => ({
                onConflictDoNothing: vi.fn(),
            })),
        })),
    },
}));

// Mock fetch
global.fetch = vi.fn();

describe("ExchangeRateService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getRates()", () => {
        it("should return cached rates if available", async () => {
            const mockResult = {
                date: "2024-02-01",
                base: "EUR",
                rates: { USD: 1.1, CNY: 7.8 },
            };

            vi.mocked(db.query.currencyRates.findFirst).mockResolvedValue(mockResult as unknown as never);

            const result = await ExchangeRateService.getRates("2024-02-01");

            expect(result).toEqual(mockResult);
            expect(fetch).not.toHaveBeenCalled();
        });

        it("should fetch and cache rates if not in DB", async () => {
            vi.mocked(db.query.currencyRates.findFirst).mockResolvedValue(undefined);

            const apiResponse = {
                date: "2024-02-01",
                base: "EUR",
                rates: { USD: 1.1, CNY: 7.8 },
            };

            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                json: async () => apiResponse,
            } as unknown as Response);

            const result = await ExchangeRateService.getRates("2024-02-01");

            expect(result).toEqual(apiResponse);
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining("2024-02-01"));
            expect(db.insert).toHaveBeenCalled();
        });

        it("should consolidate concurrent requests for the same date (Request Collapsing)", async () => {
            vi.mocked(db.query.currencyRates.findFirst).mockResolvedValue(undefined);

            let resolveFetch: (value: unknown) => void;
            const fetchPromise = new Promise((resolve) => {
                resolveFetch = resolve;
            });

            vi.mocked(fetch).mockImplementation(() => fetchPromise as Promise<Response>);

            // Trigger multiple concurrent calls
            const call1 = ExchangeRateService.getRates("2024-02-02");
            const call2 = ExchangeRateService.getRates("2024-02-02");

            // Resolve the API call
            resolveFetch!({
                ok: true,
                json: async () => ({
                    date: "2024-02-02",
                    base: "EUR",
                    rates: { USD: 1.1 },
                }),
            });

            const [res1, res2] = await Promise.all([call1, call2]);

            expect(res1).toEqual(res2);
            expect(fetch).toHaveBeenCalledTimes(1); // Crucial: Only one network call
        });
    });

    describe("convert()", () => {
        it("should convert correctly using cross-rates", async () => {
            const mockRates = {
                date: "2024-02-01",
                base: "EUR",
                rates: { USD: 1.1, CNY: 7.7 },
            };

            vi.mocked(db.query.currencyRates.findFirst).mockResolvedValue(mockRates as unknown as never);

            // 100 USD -> CNY
            // 100 * (7.7 / 1.1) = 700
            const result = await ExchangeRateService.convert(100, "USD", "CNY", "2024-02-01");

            expect(result).toBeCloseTo(700);
        });

        it("should handle conversion from/to base currency", async () => {
            const mockRates = {
                date: "2024-02-01",
                base: "EUR",
                rates: { USD: 1.1 },
            };

            vi.mocked(db.query.currencyRates.findFirst).mockResolvedValue(mockRates as unknown as never);

            // 100 EUR -> USD
            // 100 * (1.1 / 1.0) = 110
            const result = await ExchangeRateService.convert(100, "EUR", "USD", "2024-02-01");
            expect(result).toBeCloseTo(110);

            // 110 USD -> EUR
            // 110 * (1.0 / 1.1) = 100
            const result2 = await ExchangeRateService.convert(110, "USD", "EUR", "2024-02-01");
            expect(result2).toBeCloseTo(100);
        });
    });
});
