import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";

const batchDeleteSchema = z.object({
    ledgerEntryIds: z.array(z.string()),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
    request: NextRequest,
    { params }: RouteParams
) {
    try {
        const { id: ledgerId } = await params;
        const body = await request.json();
        const { ledgerEntryIds } = batchDeleteSchema.parse(body);

        if (!ledgerEntryIds || ledgerEntryIds.length === 0) {
            return NextResponse.json({ success: true, deletedCount: 0 });
        }

        await db
            .delete(ledgerEntries)
            .where(
                and(
                    eq(ledgerEntries.ledgerId, ledgerId),
                    inArray(ledgerEntries.id, ledgerEntryIds)
                )
            );

        return NextResponse.json({
            success: true,
            deletedCount: ledgerEntryIds.length
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation failed", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Failed to batch delete ledger entries:", error);
        return NextResponse.json(
            { error: "Failed to batch delete ledger entries" },
            { status: 500 }
        );
    }
}
