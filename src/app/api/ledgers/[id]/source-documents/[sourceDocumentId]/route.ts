import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireLedgerAccess } from "@/lib/auth/helpers";

type RouteParams = { params: Promise<{ id: string; sourceDocumentId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, sourceDocumentId } = await params;

        // Verify user owns this ledger
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return error;

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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, sourceDocumentId } = await params;
        const body = await request.json();
        const { title } = body;

        // Verify user owns this ledger
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return error;

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

        // Update title
        await db
            .update(sourceDocuments)
            .set({ title })
            .where(eq(sourceDocuments.id, sourceDocumentId));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to update source document:", error);
        return NextResponse.json(
            { error: "Failed to update source document" },
            { status: 500 }
        );
    }
}
