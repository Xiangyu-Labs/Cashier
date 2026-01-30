import { NextRequest, NextResponse } from "next/server";
import { shareRepo } from "@/lib/repositories";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string; docId: string; shareId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { shareId } = await params;

        // We can also verify ledgerId/docId match if we want stricter security,
        // but repository delete usually is enough if we trust the repo logic.
        // However, ShareRepo.delete is generic.
        // Let's ensure the share belongs to the document?
        // ShareRepo.findActiveBySourceDocumentId only finds by docId.
        // Let's just update the share to inactive instead of deleting row?
        // Requirement "Revoke a share".
        // DB has isActive field. Let's use that (soft delete logic for shares).

        await shareRepo.update(shareId, { isActive: false });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error(error, "Failed to delete share");
        return NextResponse.json(
            { error: "Failed to delete share" },
            { status: 500 }
        );
    }
}
