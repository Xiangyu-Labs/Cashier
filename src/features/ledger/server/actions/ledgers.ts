"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories } from "@/lib/db/schema";
import { defaultLedger } from "@/config/default-ledger";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const createLedgerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    aiLanguage: z.string().optional(),
});

const updateLedgerSchema = z.object({
    name: z.string().optional(),
    aiLanguage: z.string().optional(),
    currencies: z.array(z.string()).optional(),
    mainCurrency: z.string().optional(),
    autoRecognizeDate: z.boolean().optional(),
    collapseProcessingDefault: z.boolean().optional(),
    mergeSimilarItems: z.boolean().optional(),
    collapseBillsDefault: z.boolean().optional(),
    aiCustomPrompt: z.string().optional(),
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
                aiLanguage: validated.aiLanguage || defaultLedger.settings.aiLanguage,
                currencies: defaultLedger.settings.currencies,
                autoRecognizeDate: defaultLedger.settings.autoRecognizeDate,
                collapseProcessingDefault: defaultLedger.settings.collapseProcessingDefault,
                mergeSimilarItems: defaultLedger.settings.mergeSimilarItems,
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

        revalidatePath("/dashboard");
        revalidatePath("/ledgers"); // Assuming there might be a ledgers page

        return { success: true, data: newLedger };
    } catch (error) {
        logger.error({ error }, "Failed to create ledger via action");
        if (error instanceof z.ZodError) {
            return { success: false, error: "Validation failed", details: error.issues };
        }
        return { success: false, error: "Failed to create ledger" };
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
            where: eq(ledgers.id, id),
        });

        if (!existing || existing.userId !== session.user.id) {
            return { success: false, error: "Unauthorized or Ledger not found" };
        }

        const validated = updateLedgerSchema.parse(data);

        const [updatedLedger] = await db
            .update(ledgers)
            .set(validated)
            .where(eq(ledgers.id, id))
            .returning();

        revalidatePath(`/ledger/${id}`);
        revalidatePath("/dashboard");

        return { success: true, data: updatedLedger };
    } catch (error) {
        logger.error({ error, ledgerId: id }, "Failed to update ledger via action");
        if (error instanceof z.ZodError) {
            return { success: false, error: "Validation failed", details: error.issues };
        }
        return { success: false, error: "Failed to update ledger" };
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
            where: eq(ledgers.id, id),
        });

        if (!existing || existing.userId !== session.user.id) {
            return { success: false, error: "Unauthorized or Ledger not found" };
        }

        await db.delete(ledgers).where(eq(ledgers.id, id));

        revalidatePath("/dashboard");

        return { success: true };
    } catch (error) {
        logger.error({ error, ledgerId: id }, "Failed to delete ledger via action");
        return { success: false, error: "Failed to delete ledger" };
    }
}

export async function getLedgerAction(id: string) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const existing = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, id),
    });

    if (!existing || existing.userId !== session.user.id) {
        throw new Error("Unauthorized or Ledger not found");
    }

    return {
        id: existing.id,
        name: existing.name,
        aiLanguage: existing.aiLanguage || "en",
        currencies: existing.currencies || [],
        mainCurrency: existing.mainCurrency || "USD",
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
        autoRecognizeDate: existing.autoRecognizeDate || false,
        collapseProcessingDefault: existing.collapseProcessingDefault || false,
        mergeSimilarItems: existing.mergeSimilarItems || false,
        collapseBillsDefault: existing.collapseBillsDefault || false,
        aiCustomPrompt: existing.aiCustomPrompt || "",
    };
}
