import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
    try {
        const existingSettings = await db.select().from(settings).limit(1);

        if (existingSettings.length === 0) {
            // Initialize default settings if not exists
            const inserted = await db.insert(settings).values({
                language: "zh-CN",
                currencies: ["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"],
            }).returning();
            return NextResponse.json(inserted[0]);
        }

        return NextResponse.json(existingSettings[0]);
    } catch (error) {
        console.error("Failed to fetch settings:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { language, currencies } = body;

        const existingSettings = await db.select().from(settings).limit(1);

        let updated;
        if (existingSettings.length === 0) {
            updated = await db.insert(settings).values({
                language: language || "zh-CN",
                currencies: currencies || ["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"],
            }).returning();
        } else {
            updated = await db.update(settings)
                .set({
                    language: language !== undefined ? language : undefined,
                    currencies: currencies !== undefined ? currencies : undefined,
                    updatedAt: new Date(),
                })
                .where(eq(settings.id, existingSettings[0].id))
                .returning();
        }

        return NextResponse.json(updated[0]);
    } catch (error) {
        console.error("Failed to update settings:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
