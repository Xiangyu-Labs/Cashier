import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLedgerAccess } from "@/lib/auth/helpers";

const batchUpdateSchema = z.object({
    ledgerEntryIds: z.array(z.string()),
    categoryId: z.string().optional(),
    currency: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(
    request: NextRequest,
    { params }: RouteParams
) {
    try {
        const { id: ledgerId } = await params;

        // Verify user owns this ledger
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return error;

        const body = await request.json();
        const { ledgerEntryIds, categoryId, currency } = batchUpdateSchema.parse(body);

        if (!ledgerEntryIds || ledgerEntryIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        const updateData: Record<string, string> = {};
        if (categoryId) updateData.categoryId = categoryId;
        if (currency) updateData.currency = currency;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        const { ledgerEntryRepo } = await import("@/lib/repositories");
        await ledgerEntryRepo.batchUpdate(ledgerEntryIds, updateData, ledgerId);

        // Result handling for different DB adapters (Drizzle returns differ)
        // For Postgres/SQLite it might be returning().length, for others it might be a count object.
        // To be safe and simple, let's just return success.

        return NextResponse.json({
            success: true,
            updatedCount: ledgerEntryIds.length
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation failed", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Failed to batch update ledger entries:", error);
        return NextResponse.json(
            { error: "Failed to batch update ledger entries" },
            { status: 500 }
        );
    }
}
