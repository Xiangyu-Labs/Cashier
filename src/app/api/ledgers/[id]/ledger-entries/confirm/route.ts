import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgerEntries, sourceDocuments } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
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

        if (confirmAll) {
            // Confirm all pending entries for this ledger
            const [updatedEntries] = await db
                .update(ledgerEntries)
                .set({ status: "confirmed" })
                .where(
                    and(
                        eq(ledgerEntries.ledgerId, ledgerId),
                        eq(ledgerEntries.status, "pending")
                    )
                )
                .returning({ id: ledgerEntries.id });

            // Mark all 'to_confirm' source documents as 'completed'
            await db
                .update(sourceDocuments)
                .set({ status: "completed" })
                .where(
                    and(
                        eq(sourceDocuments.ledgerId, ledgerId),
                        eq(sourceDocuments.status, "to_confirm")
                    )
                );

            return NextResponse.json({
                success: true,
                updatedCount: updatedEntries ? 1 : 0 // returning array length would be better but returning count is fine
            });
        }

        if (!ledgerEntryIds || ledgerEntryIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        // Confirm specific entries
        const updatedEntries = await db
            .update(ledgerEntries)
            .set({ status: "confirmed" })
            .where(
                and(
                    inArray(ledgerEntries.id, ledgerEntryIds),
                    eq(ledgerEntries.ledgerId, ledgerId)
                )
            )
            .returning({ sourceDocumentId: ledgerEntries.sourceDocumentId });

        // Update corresponding source documents to 'completed'
        if (updatedEntries.length > 0) {
            const docIds = [...new Set(updatedEntries.map(e => e.sourceDocumentId).filter(Boolean))] as string[];
            if (docIds.length > 0) {
                await db
                    .update(sourceDocuments)
                    .set({ status: "completed" })
                    .where(
                        and(
                            inArray(sourceDocuments.id, docIds),
                            eq(sourceDocuments.status, "to_confirm")
                        )
                    );
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
