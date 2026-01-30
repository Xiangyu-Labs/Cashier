import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const confirmSchema = z.object({
    ledgerEntryIds: z.array(z.string()).optional(),
    confirmAll: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };


// POST /api/ledgers/[id]/ledger-entries/confirm - 确认账目
export async function POST(
    request: NextRequest,
    { params }: RouteParams
) {
    try {
        const { id: ledgerId } = await params;
        const body = await request.json();
        const { ledgerEntryIds, confirmAll } = confirmSchema.parse(body);

        // Import repositories dynamically or use static import if available at top
        const { ledgerEntryRepo, sourceDocumentRepo } = await import("@/lib/repositories");

        if (confirmAll) {
            // Confirm all pending entries for this ledger
            const updatedEntries = await ledgerEntryRepo.confirmAllPending(ledgerId);

            // Mark all 'to_confirm' source documents as 'completed'
            await sourceDocumentRepo.completeAllToConfirm(ledgerId);

            return NextResponse.json({
                success: true,
                updatedCount: updatedEntries.length
            });
        }

        if (!ledgerEntryIds || ledgerEntryIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        // Confirm specific entries
        const updatedEntries = await ledgerEntryRepo.batchUpdate(ledgerEntryIds, { status: "confirmed" }, ledgerId);

        // Update corresponding source documents to 'completed'
        if (updatedEntries.length > 0) {
            const docIds = [...new Set(updatedEntries.map(e => e.sourceDocumentId).filter(Boolean))] as string[];
            if (docIds.length > 0) {
                await sourceDocumentRepo.batchComplete(docIds, ledgerId);
            }
        }

        return NextResponse.json({ success: true, updatedCount: updatedEntries.length });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation failed", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Failed to confirm ledger entries:", error);
        return NextResponse.json(
            { error: "Failed to confirm ledger entries" },
            { status: 500 }
        );
    }
}
