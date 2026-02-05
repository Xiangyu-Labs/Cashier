"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories } from "@/lib/db/schema";
import { defaultLedger } from "@/config/default-ledger";
import { auth } from "@/auth";
// Server-side cache revalidation removed - client-side TanStack Query handles cache invalidation
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

const createLedgerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    aiLanguage: z.string().optional(),
});

const updateLedgerSchema = z.object({
    name: z.string().optional(),
    settings: z.object({
        aiLanguage: z.string().optional(),
        currencies: z.array(z.string()).optional(),
        mainCurrency: z.string().optional(),
        collapseProcessingDefault: z.boolean().optional(),
        collapseBillsDefault: z.boolean().optional(),
        aiCustomPrompt: z.string().optional(),
    }).optional(),
});

export async function createLedgerAction(data: z.infer<typeof createLedgerSchema>) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" };
        }

        const validated = createLedgerSchema.parse(data);

        // Create ledger
        const [newLedger] = await db
            .insert(ledgers)
            .values({
                userId: session.user.id,
                name: validated.name,
                metadata: {
                    settings: {
                        aiLanguage: validated.aiLanguage || defaultLedger.settings.aiLanguage,
                        currencies: defaultLedger.settings.currencies,
                        mainCurrency: defaultLedger.settings.mainCurrency,
                        collapseProcessingDefault: defaultLedger.settings.collapseProcessingDefault,
                        collapseBillsDefault: defaultLedger.settings.collapseBillsDefault,
                        aiCustomPrompt: defaultLedger.settings.aiCustomPrompt,
                    }
                }
            })
            .returning();

        // Seed categories for the new ledger
        if (defaultLedger.categories.length > 0) {
            await db.insert(entryCategories).values(
                defaultLedger.categories.map((cat) => ({
                    ...cat,
                    ledgerId: newLedger.id,
                }))
            );
        }


        return { success: true, data: newLedger, error: null };
    } catch (error) {
        logger.error({ error }, "Failed to create ledger via action");
        if (error instanceof z.ZodError) {
            return { success: false, error: "Validation failed", details: error.issues, data: null };
        }
        return { success: false, error: "Failed to create ledger", data: null };
    }
}

export async function updateLedgerAction(id: string, data: z.infer<typeof updateLedgerSchema>) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" };
        }

        // Verify ownership
        const existing = await db.query.ledgers.findFirst({
            where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
        });

        if (!existing || existing.userId !== session.user.id) {
            return { success: false, error: "Unauthorized or Ledger not found" };
        }

        const validated = updateLedgerSchema.parse(data);

        // Helper to merge deep objects is tricky with Drizzle's set, so we fetch and merge in app logic
        // or use sql hacks. But for metadata, we can fetch, merge, update.
        // However, here we can just assume we want to update specific fields in settings.
        // We need to get current metadata first.

        const currentMetadata = existing.metadata || {};
        const currentSettings = currentMetadata.settings || {};

        const newSettings = {
            ...currentSettings,
            ...(validated.settings || {}),
        };

        const [updatedLedger] = await db
            .update(ledgers)
            .set({
                name: validated.name || existing.name,
                metadata: {
                    ...currentMetadata,
                    settings: newSettings,
                }
            })
            .where(eq(ledgers.id, id))
            .returning();


        return { success: true, data: updatedLedger, error: null };
    } catch (error) {
        logger.error({ error, ledgerId: id }, "Failed to update ledger via action");
        if (error instanceof z.ZodError) {
            return { success: false, error: "Validation failed", details: error.issues, data: null };
        }
        return { success: false, error: "Failed to update ledger", data: null };
    }
}

export async function deleteLedgerAction(id: string) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" };
        }

        // Verify ownership
        const existing = await db.query.ledgers.findFirst({
            where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
        });

        if (!existing || existing.userId !== session.user.id) {
            return { success: false, error: "Unauthorized or Ledger not found" };
        }

        await db.update(ledgers)
            .set({ deletedAt: new Date() })
            .where(eq(ledgers.id, id));


        return { success: true, error: null };
    } catch (error) {
        logger.error({ error, ledgerId: id }, "Failed to delete ledger via action");
        return { success: false, error: "Failed to delete ledger" };
    }
}

export async function getLedgerAction(id: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: "Unauthorized", data: null };
    }

    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== session.user.id) {
        return { success: false, error: "Unauthorized or Ledger not found", data: null };
    }

    return {
        success: true,
        error: null,
        data: {
            id: existing.id,
            userId: existing.userId,
            name: existing.name,
            metadata: existing.metadata,
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
            deletedAt: existing.deletedAt ? existing.deletedAt.toISOString() : null,
        },
    };
}

export async function getLedgersAction() {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: "Unauthorized", data: null };
    }

    const rows = await db.query.ledgers.findMany({
        where: and(eq(ledgers.userId, session.user.id), isNull(ledgers.deletedAt)),
        orderBy: [desc(ledgers.createdAt)],
    });

    return {
        success: true,
        error: null,
        data: rows.map(row => ({
            id: row.id,
            userId: row.userId,
            name: row.name,
            metadata: row.metadata,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        })),
    };
}

