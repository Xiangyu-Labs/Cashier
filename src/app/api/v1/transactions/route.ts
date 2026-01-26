import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { inputMessages, apiKeys } from "@/lib/db/schema";
import { z } from "zod";
import { determineSourceType, MessageInput } from "@/lib/message-processor/types";
import { processMessageQueue } from "@/lib/queue";
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
    } catch (e) {
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
        const sourceType = determineSourceType(result.data as MessageInput);
        const content = getMessageContent(sourceType, result.data);

        // Save input message with 'queued' status
        const [savedMessage] = await db
            .insert(inputMessages)
            .values({
                ledgerId: apiKey.ledgerId,
                contentType: sourceType === "mixed" ? "text" : sourceType,
                content,
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
        processMessageQueue().catch((err) => {
            console.error("Background processing failed to start:", err);
        });

        return NextResponse.json({
            messageId: savedMessage.id,
            status: "queued",
            message: "Message queued for processing",
        }, { status: 201 });
    } catch (error) {
        console.error("Failed to process transaction via API:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

function getMessageContent(sourceType: string, validated: z.infer<typeof transactionSchema>): string {
    if (sourceType === "image" && validated.images && validated.images.length > 0) {
        if (validated.images.length === 1) {
            return validated.images[0].data;
        }
        return JSON.stringify(validated.images.map((img) => img.data));
    }

    if (sourceType === "text" && validated.text) {
        return validated.text;
    }

    return JSON.stringify(validated);
}
