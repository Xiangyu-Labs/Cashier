import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/settings/route";
import { getTestDb } from "../../setup";
import { settings } from "@/lib/db/schema";

describe("Settings API", () => {
    beforeEach(async () => {
        // Ensure clean state handled by global setup, but we can verify or explicit clear if needed
        // Global beforeEach truncates tables. 
        getTestDb();
    });

    describe("GET /api/settings", () => {
        it("should return default settings if none exist", async () => {
            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.language).toBe("zh-CN");
            expect(data.currencies).toEqual(["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"]);
            expect(data.id).toBeDefined();

            // Verify db insertion
            const db = getTestDb();
            const dbSettings = await db.select().from(settings).limit(1);
            expect(dbSettings).toHaveLength(1);
            expect(dbSettings[0].language).toBe("zh-CN");
        });

        it("should return existing settings", async () => {
            const db = getTestDb();
            await db.insert(settings).values({
                language: "en",
                currencies: ["USD"]
            });

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.language).toBe("en");
            expect(data.currencies).toEqual(["USD"]);
        });
    });

    describe("PATCH /api/settings", () => {
        it("should update existing settings", async () => {
            const db = getTestDb();
            await db.insert(settings).values({
                language: "zh-CN",
                currencies: ["CNY"]
            });

            const req = new NextRequest("http://localhost/api/settings", {
                method: "PATCH",
                body: JSON.stringify({
                    language: "fr",
                    currencies: ["EUR"]
                })
            });

            const response = await PATCH(req);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.language).toBe("fr");
            expect(data.currencies).toEqual(["EUR"]);

            // Verify db
            const updated = await db.select().from(settings).limit(1);
            expect(updated[0].language).toBe("fr");
            expect(updated[0].currencies).toEqual(["EUR"]);
        });

        it("should create settings if they don't exist on PATCH", async () => {
            const req = new NextRequest("http://localhost/api/settings", {
                method: "PATCH",
                body: JSON.stringify({
                    language: "jp",
                    currencies: ["JPY"]
                })
            });

            const response = await PATCH(req);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.language).toBe("jp");
            expect(data.currencies).toEqual(["JPY"]);

            // Verify db
            const db = getTestDb();
            const created = await db.select().from(settings).limit(1);
            expect(created).toHaveLength(1);
            expect(created[0].language).toBe("jp");
        });

        it("should partially update settings", async () => {
            const db = getTestDb();
            await db.insert(settings).values({
                language: "zh-CN",
                currencies: ["CNY"]
            });

            const req = new NextRequest("http://localhost/api/settings", {
                method: "PATCH",
                body: JSON.stringify({
                    language: "de"
                })
            });

            const response = await PATCH(req);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.language).toBe("de");
            expect(data.currencies).toEqual(["CNY"]); // Should remain unchanged
        });
    });
});
