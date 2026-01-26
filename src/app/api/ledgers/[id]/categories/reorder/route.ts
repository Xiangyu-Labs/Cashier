import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

const reorderSchema = z.object({
    categoryIds: z.array(z.string().uuid()),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { categoryIds } = reorderSchema.parse(body);

        if (categoryIds.length === 0) {
            return NextResponse.json({ success: true });
        }

        // Verify all categories belong to the ledger
        const existingCategories = await db.query.categories.findMany({
            where: (t, { and, eq, inArray }) =>
                and(eq(t.ledgerId, id), inArray(t.id, categoryIds)),
        });

        if (existingCategories.length !== categoryIds.length) {
            return NextResponse.json(
                { error: "Invalid categories or categories not found in this ledger" },
                { status: 400 }
            );
        }

        // Update sortOrder in a transaction
        await db.transaction(async (tx) => {
            for (let i = 0; i < categoryIds.length; i++) {
                await tx
                    .update(categories)
                    .set({ sortOrder: i })
                    .where(eq(categories.id, categoryIds[i]));
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation failed", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Failed to reorder categories:", error);
        return NextResponse.json(
            { error: "Failed to reorder categories" },
            { status: 500 }
        );
    }
}
