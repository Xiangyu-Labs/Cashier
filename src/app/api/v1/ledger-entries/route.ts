import { NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { db } from "@/lib/db";
import { serviceCredentials } from "@/features/ledger/server/schema";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { eq, and, isNull } from "drizzle-orm";

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

        // Save source document with 'queued' status directly
        const { sourceDocuments } = await import("@/lib/db/schema");
        const today = new Date().toISOString().split('T')[0];
        const [savedDoc] = await db.insert(sourceDocuments).values({
            ledgerId: credential.ledgerId,
            text: text || null,
            imageUrls: imageUrls,
            status: "queued",
            entryDate: today,
        }).returning();

        // Update last used at
        try {
            await db.update(serviceCredentials).set({ lastUsedAt: new Date() }).where(eq(serviceCredentials.id, credential.id));
        } catch (error) {
            logger.error({ error, credentialId: credential.id }, "Failed to update service credential usage");
        }

        // Trigger processing using the processing task system
        const { flowEngine } = await import("@/lib/flow");
        const { TASK_TYPE_PARSE_SOURCE_DOCUMENT } = await import("@/features/source-document/server/tasks/parse-source-document");
        const { ledgers: ledgerTable } = await import("@/lib/db/schema");

        // Fetch ledger data
        const ledger = await db.query.ledgers.findFirst({
            where: and(eq(ledgerTable.id, credential.ledgerId), isNull(ledgerTable.deletedAt)),
        });

        if (ledger) {
            // Fetch categories
            const allCategories = await db.query.entryCategories.findMany({
                where: (c, { eq, or, isNull, and }) => and(
                    or(eq(c.ledgerId, credential.ledgerId), isNull(c.ledgerId)),
                    isNull(c.deletedAt)
                )
            });

            await flowEngine.submit(
                TASK_TYPE_PARSE_SOURCE_DOCUMENT,
                {
                    ledgerId: credential.ledgerId,
                    sourceDocumentId: savedDoc.id,
                    text: text || undefined,
                    imageUrls: imageUrls,
                    aiLanguage: ledger.metadata?.settings?.aiLanguage,
                    preferredCurrencies: ledger.metadata?.settings?.currencies || undefined,
                    categories: allCategories,
                    settings: {
                        aiCustomPrompt: ledger.metadata?.settings?.aiCustomPrompt,
                    },
                },
                {
                    title: text ? `API 解析: ${text.slice(0, 20)}...` : "API 解析图片账单",
                    scopeId: credential.ledgerId,
                    entityType: 'source_document',
                    entityId: savedDoc.id,
                }
            );
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
