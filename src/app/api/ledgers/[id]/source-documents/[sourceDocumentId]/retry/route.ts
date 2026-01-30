import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string; sourceDocumentId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, sourceDocumentId } = await params;

        // Parse optional body for edit-retry
        const body = await request.json().catch(() => ({}));
        const { text: newText, images: newImages } = body;

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

        // 1. Delete existing ledger entries
        await db
            .delete(ledgerEntries)
            .where(eq(ledgerEntries.sourceDocumentId, sourceDocumentId));

        // Prepare update fields
        const updateFields: Record<string, unknown> = {
            status: "queued",
            anomalyCodes: [],
        };

        // If new text/images provided, update them
        if (newText !== undefined) {
            updateFields.text = newText || null;
        }
        if (newImages !== undefined && Array.isArray(newImages)) {
            // newImages is array of { data: string, mimeType: string }
            // Store as imageUrls (just the data field which is a data URI)
            updateFields.imageUrls = newImages.map((img: { data: string; mimeType: string }) => img.data);
        }

        // 2. Update source document
        await db
            .update(sourceDocuments)
            .set(updateFields)
            .where(eq(sourceDocuments.id, sourceDocumentId));

        // Fetch updated doc for task submission
        const updatedDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDocumentId)
        });

        const { ledgers: ledgerTable } = await import("@/lib/db/schema");

        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgerTable.id, ledgerId),
        });

        if (ledger) {
            const { submitFlowTask } = await import("@/lib/flow/producer");
            const { TASK_TYPE_PARSE_SOURCE_DOCUMENT } = await import("@/lib/tasks/parse-source-document");

            await submitFlowTask({
                type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
                title: updatedDoc?.text ? `重试解析: ${updatedDoc.text.slice(0, 20)}...` : "重试解析图片账单",
                ledgerId,
                data: {
                    sourceDocumentId,
                    text: updatedDoc?.text || undefined,
                    imageUrls: updatedDoc?.imageUrls as string[] || [],
                    aiLanguage: ledger.aiLanguage,
                    preferredCurrencies: ledger.currencies || undefined,
                    categories: await db.query.entryCategories.findMany({
                        where: (c, { eq, or, isNull }) => or(eq(c.ledgerId, ledgerId), isNull(c.ledgerId))
                    }),
                    settings: {
                        mergeSimilarItems: ledger.mergeSimilarItems,
                        autoRecognizeDate: ledger.autoRecognizeDate,
                        aiCustomPrompt: ledger.aiCustomPrompt,
                    },
                },
            });
        }

        return NextResponse.json({
            success: true,
            message: "Source document requeued for processing",
        });
    } catch (error) {
        logger.error({ error }, "Failed to retry source document");
        return NextResponse.json(
            { error: "Failed to retry source document" },
            { status: 500 }
        );
    }
}
