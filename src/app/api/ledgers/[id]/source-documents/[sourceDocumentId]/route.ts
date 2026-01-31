import { NextRequest, NextResponse } from "next/server";
import { requireLedgerAccess } from "@/lib/auth/helpers";

type RouteParams = { params: Promise<{ id: string; sourceDocumentId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, sourceDocumentId } = await params;

        // Get ledger scope
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return error!;

        // Verify source document exists and belongs to ledger
        const doc = await scope.documents.findById(sourceDocumentId);

        if (!doc) {
            return NextResponse.json({ error: "Source document not found" }, { status: 404 });
        }

        // Delete associated ledger entries first
        await scope.entries.deleteBySourceDocument(sourceDocumentId);

        // Delete the source document
        await scope.documents.delete(sourceDocumentId);

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

        // Get ledger scope
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return error!;

        // Verify source document exists and belongs to ledger
        const doc = await scope.documents.findById(sourceDocumentId);

        if (!doc) {
            return NextResponse.json({ error: "Source document not found" }, { status: 404 });
        }

        // Update title
        await scope.documents.update(sourceDocumentId, { title });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to update source document:", error);
        return NextResponse.json(
            { error: "Failed to update source document" },
            { status: 500 }
        );
    }
}
