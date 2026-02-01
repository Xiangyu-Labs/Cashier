"use server";

import { db } from "@/lib/db";
import { shares } from "@/lib/db/schema";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/lib/auth/helpers";
import { addDays } from "date-fns";
import crypto from "crypto";

const createShareSchema = z.object({
    expiresIn: z.enum(["1d", "7d", "30d", "never"]),
});

export async function createShareAction(ledgerId: string, sourceDocumentId: string, data: z.infer<typeof createShareSchema>) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        const validated = createShareSchema.parse(data);

        // Security check: ensure source document belongs to ledger
        const doc = await scope.documents.get(sourceDocumentId);
        if (!doc) return { success: false, error: "Document not found" };

        let expiresAt: Date | null = null;
        if (validated.expiresIn !== "never") {
            const days = parseInt(validated.expiresIn.replace("d", ""));
            expiresAt = addDays(new Date(), days);
        }

        const [share] = await db.insert(shares).values({
            ledgerId,
            sourceDocumentId,
            expiresAt,
        }).returning();

        revalidatePath(`/ledger/${ledgerId}`);

        const shareUrl = `/s/${share.id}`; // Relative URL

        return {
            success: true,
            data: {
                id: share.id,
                shareUrl,
                expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null
            }
        };
    } catch (error) {
        logger.error({ error, ledgerId, sourceDocumentId }, "Failed to create share link");
        return { success: false, error: "Failed to create share link" };
    }
}

export async function deleteShareAction(ledgerId: string, sourceDocumentId: string, shareId: string) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        // Verify share belongs to ledger/document
        const share = await db.query.shares.findFirst({
            where: and(eq(shares.id, shareId), eq(shares.ledgerId, ledgerId))
        });

        if (!share) return { success: false, error: "Share not found" };

        await db.delete(shares).where(eq(shares.id, shareId));

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };

    } catch (error) {
        logger.error({ error, ledgerId, shareId }, "Failed to delete share link");
        return { success: false, error: "Failed to delete share link" };
    }
}
