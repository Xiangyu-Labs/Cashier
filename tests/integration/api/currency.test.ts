import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/currency/rates/route";
import { getTestDb } from "../../setup";
import { currencyRates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock fetch for Frankfurter
global.fetch = vi.fn();

describe("GET /api/currency/rates", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should fetch rates from Frankfurter and save to DB", async () => {
        const dummyDate = "2024-02-01";
        const dummyResponse = {
            base: "EUR",
            date: dummyDate,
            rates: { USD: 1.08, CNY: 7.19 }
        };

        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => dummyResponse,
        } as any);

        const url = new URL("http://localhost/api/currency/rates");
        url.searchParams.set("date", dummyDate);
        const request = new NextRequest(url.toString());
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.date).toBe(dummyDate);
        expect(data.rates.USD).toBe(1.08);

        // Verify it was saved to the test DB
        const db = getTestDb();
        const saved = await db.query.currencyRates.findFirst({
            where: eq(currencyRates.date, dummyDate)
        });
        expect(saved).toBeDefined();
        expect(saved?.rates).toEqual(dummyResponse.rates);
    });

    it("should return error if Frankfurter API fails", async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            statusText: "Forbidden",
            status: 403
        } as any);

        const request = new NextRequest("http://localhost/api/currency/rates");
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toContain("Failed to fetch exchange rates");
    });
});
