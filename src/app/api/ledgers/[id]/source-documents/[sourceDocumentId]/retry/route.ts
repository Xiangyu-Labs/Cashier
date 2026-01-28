import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string; sourceDocumentId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
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

        // Update source document status to queued
        await db
            .update(sourceDocuments)
            .set({
                status: "queued",
                errorCode: null,
            })
            .where(eq(sourceDocuments.id, sourceDocumentId));

        // Trigger processing using the processing task system
        const { createProcessingTask } = await import("@/lib/processing");
        const { TASK_TYPE_PARSE_SOURCE_DOCUMENT } = await import("@/lib/tasks");
        const { ledgers: ledgerTable } = await import("@/lib/db/schema");

        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgerTable.id, ledgerId),
        });

        if (ledger) {
            await createProcessingTask({
                type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
                title: doc.text ? `重试解析: ${doc.text.slice(0, 20)}...` : "重试解析图片账单",
                ledgerId,
                entityId: sourceDocumentId,
                entityType: "source_document",
                input: {
                    sourceDocumentId,
                    text: doc.text || undefined,
                    imageUrls: doc.imageUrls as string[] || [],
                    categories: await db.query.entryCategories.findMany({
                        where: (c, { eq, or, isNull }) => or(eq(c.ledgerId, ledgerId), isNull(c.ledgerId))
                    }),
                    settings: {
                        mergeSimilarItems: ledger.mergeSimilarItems,
                        autoRecognizeDate: ledger.autoRecognizeDate,
                        autoConfirm: ledger.autoConfirm,
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
