import { NextRequest, NextResponse } from "next/server";
import { shareRepo } from "@/lib/repositories";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/lib/auth/helpers";

type RouteParams = { params: Promise<{ id: string; sourceDocumentId: string; shareId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, shareId } = await params;

        // Verify user owns this ledger
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return error;

        await shareRepo.update(shareId, { isActive: false }, ledgerId);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error(error, "Failed to delete share");
        return NextResponse.json(
            { error: "Failed to delete share" },
            { status: 500 }
        );
    }
}
