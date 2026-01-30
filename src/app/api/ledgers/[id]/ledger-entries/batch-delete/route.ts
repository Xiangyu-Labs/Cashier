import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLedgerAccess } from "@/lib/auth/helpers";

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

        // Verify user owns this ledger
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return error;

        const body = await request.json();
        const { ledgerEntryIds } = batchDeleteSchema.parse(body);

        if (!ledgerEntryIds || ledgerEntryIds.length === 0) {
            return NextResponse.json({ success: true, deletedCount: 0 });
        }

        const { ledgerEntryRepo } = await import("@/lib/repositories");
        await ledgerEntryRepo.batchDelete(ledgerEntryIds, ledgerId);

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
