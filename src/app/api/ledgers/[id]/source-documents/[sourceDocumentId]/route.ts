import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, processingTasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type RouteParams = { params: Promise<{ id: string; sourceDocumentId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, sourceDocumentId } = await params;

        // Verify source document exists and belongs to ledger
        const doc = await db.query.sourceDocuments.findFirst({
            where: and(
                eq(sourceDocuments.id, sourceDocumentId),
                eq(sourceDocuments.ledgerId, ledgerId)
            )
        });

        if (!doc) {
            return NextResponse.json({ error: "Source document not found" }, { status: 404 });
        }

        // Delete associated ledger entries first
        await db
            .delete(ledgerEntries)
            .where(eq(ledgerEntries.sourceDocumentId, sourceDocumentId));

        // Delete associated tasks first (avoid zombie processing)
        await db
            .delete(processingTasks)
            .where(and(
                eq(processingTasks.entityId, sourceDocumentId),
                eq(processingTasks.entityType, "source_document")
            ));

        // Delete the source document
        await db
            .delete(sourceDocuments)
            .where(eq(sourceDocuments.id, sourceDocumentId));

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Failed to delete source document:", error);
        return NextResponse.json(
            { error: "Failed to delete source document" },
            { status: 500 }
        );
    }
}
