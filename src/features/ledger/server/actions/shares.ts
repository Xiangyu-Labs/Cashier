"use server";

import { db } from "@/lib/db";
import { shares } from "@/lib/db/schema";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { addDays } from "date-fns";
import crypto from "crypto";
import { shareRepo } from "@/lib/repositories/share-repository";
import { ShareData } from "@/types/api";

const createShareSchema = z.object({
    expiresIn: z.enum(["1d", "7d", "30d", "never"]),
});

export async function getPublicShareAction(shareId: string): Promise<{ success: boolean; data?: ShareData; error?: string; status?: number }> {
    try {
        const share = await shareRepo.findByShareId(shareId);

        if (!share) {
            return { success: false, error: "Share not found", status: 404 };
        }

        if (!share.isActive || (share.expiresAt && new Date(share.expiresAt) < new Date())) {
            return { success: false, error: "Share expired or inactive", status: 410 };
        }

        // Increment access count (fire and forget, or await?)
        // Await to ensure it works, but catch error so it doesn't block view
        await shareRepo.incrementAccessCount(shareId).catch(err => {
            logger.error({ err, shareId }, "Failed to increment access count");
        });

        if (!share.sourceDocument) {
            return { success: false, error: "Source document not found", status: 404 };
        }

        const shareData: ShareData = {
            sourceDocument: {
                id: share.sourceDocument.id,
                title: share.sourceDocument.title,
                text: share.sourceDocument.text,
                imageUrls: share.sourceDocument.imageUrls || [],
                createdAt: share.sourceDocument.createdAt.toISOString(),
            },
            entries: share.sourceDocument.ledgerEntries.map(entry => ({
                id: entry.id,
                amount: entry.amount,
                currency: entry.currency,
                itemName: entry.itemName,
                description: entry.description,
                entryDate: entry.entryDate ? entry.entryDate.toISOString() : null,
                category: entry.category ? {
                    id: entry.category.id,
                    name: entry.category.name,
                    icon: entry.category.icon
                } : null
            })),
            ledgerId: share.sourceDocument.ledgerId,
        };

        return { success: true, data: shareData };

    } catch (error) {
        logger.error({ error, shareId }, "Failed to get public share");
        return { success: false, error: "Internal Server Error", status: 500 };
    }
}

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
