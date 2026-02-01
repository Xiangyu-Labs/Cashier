import { NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/lib/service-credentials";
import { db } from "@/lib/db";
import { serviceCredentials } from "@/lib/db/schema";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { LedgerScope } from "@/features/ledger/server/service";

import { eq } from "drizzle-orm";

const ledgerEntryInputSchema = z.object({
    text: z.string().optional(),
    images: z.array(z.object({
        data: z.string(), // base64
        mimeType: z.string()
    })).optional()
});

export async function POST(request: NextRequest) {
    // 1. Authorize
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const key = authHeader.split(" ")[1];
    const credential = await validateServiceCredential(key);

    if (!credential) {
        return NextResponse.json({ error: "Invalid Service Credential" }, { status: 401 });
    }

    // 2. Parse Body
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = ledgerEntryInputSchema.safeParse(body);
    if (!result.success) {
        return NextResponse.json({ error: "Validation failed", details: result.error.issues }, { status: 400 });
    }

    const { text, images } = result.data;

    if (!text && (!images || images.length === 0)) {
        return NextResponse.json({ error: "Content (text or images) is required" }, { status: 400 });
    }

    // 3. Construct Message Content
    try {
        // Create LedgerScope from validated credential
        const scope = LedgerScope.fromCredential(credential);

        const imageUrls: string[] = [];
        if (images && images.length > 0) {
            images.forEach(img => {
                let data = img.data;
                if (!data.startsWith("data:") && !data.startsWith("http")) {
                    data = `data:image/jpeg;base64,${data}`;
                }
                imageUrls.push(data);
            });
        }

        // Save source document with 'queued' status using scoped repository
        const savedDoc = await scope.documents.create({
            text: text || null,
            imageUrls: imageUrls,
            status: "queued",
        } as any);

        // Update last used at
        try {
            await db.update(serviceCredentials).set({ lastUsedAt: new Date() }).where(eq(serviceCredentials.id, credential.id));
        } catch (error) {
            logger.error({ error, credentialId: credential.id }, "Failed to update service credential usage");
        }

        // Trigger processing using the processing task system
        const { submitFlowTask } = await import("@/lib/flow/producer");
        const { TASK_TYPE_PARSE_SOURCE_DOCUMENT } = await import("@/features/source-document/server/tasks/parse-source-document");
        const { ledgers: ledgerTable } = await import("@/lib/db/schema");

        // Fetch ledger data (still need direct db access for ledgers table as it's not in scope yet)
        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgerTable.id, credential.ledgerId),
        });

        if (ledger) {
            // Fetch categories using scoped repository
            // Include both ledger-specific and global (null ledgerId) categories
            const allCategories = await db.query.entryCategories.findMany({
                where: (c, { eq, or, isNull }) => or(eq(c.ledgerId, credential.ledgerId), isNull(c.ledgerId))
            });

            await submitFlowTask({
                type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
                title: text ? `API 解析: ${text.slice(0, 20)}...` : "API 解析图片账单",
                ledgerId: credential.ledgerId,
                data: {
                    sourceDocumentId: savedDoc.id,
                    text: text || undefined,
                    imageUrls: imageUrls,
                    aiLanguage: ledger.aiLanguage,
                    preferredCurrencies: ledger.currencies || undefined,
                    categories: allCategories,
                    settings: {
                        mergeSimilarItems: ledger.mergeSimilarItems,
                        autoRecognizeDate: ledger.autoRecognizeDate,
                        aiCustomPrompt: ledger.aiCustomPrompt,
                    },
                },
            });
        }

        return NextResponse.json({
            sourceDocumentId: savedDoc.id,
            status: "queued",
            message: "Source document queued for processing",
        }, { status: 201 });
    } catch (error) {
        logger.error({ error }, "Failed to process ledger entry via API");
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
