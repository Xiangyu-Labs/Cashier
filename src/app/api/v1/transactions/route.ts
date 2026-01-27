import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { receipts, apiKeys } from "@/lib/db/schema";
import { z } from "zod";

import { processReceiptQueue } from "@/lib/queue";
import { eq } from "drizzle-orm";

const transactionSchema = z.object({
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
    const apiKey = await validateApiKey(key);

    if (!apiKey) {
        return NextResponse.json({ error: "Invalid API Key" }, { status: 401 });
    }

    // 2. Parse Body
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = transactionSchema.safeParse(body);
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

        // Save receipt with 'queued' status
        const [savedReceipt] = await db
            .insert(receipts)
            .values({
                ledgerId: apiKey.ledgerId,
                text: text || null,
                imageUrls: imageUrls,
                status: "queued",
            })
            .returning();

        // Update last used at
        // We await this to ensure it completes, catching error silently to not block response
        try {
            await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id));
        } catch (e) {
            console.error("Failed to update api key usage", e);
        }

        // Trigger background processing (Fire and Forget)
        processReceiptQueue().catch((err) => {
            console.error("Background processing failed to start:", err);
        });

        return NextResponse.json({
            receiptId: savedReceipt.id,
            status: "queued",
            message: "Receipt queued for processing",
        }, { status: 201 });
    } catch (error) {
        console.error("Failed to process transaction via API:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
