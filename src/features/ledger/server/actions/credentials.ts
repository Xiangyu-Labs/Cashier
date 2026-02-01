"use server";

import { db } from "@/lib/db";
import { serviceCredentials } from "@/features/ledger/server/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import crypto from "crypto";

const createCredentialSchema = z.object({
    name: z.string().min(1),
});

export async function getServiceCredentialsAction(ledgerId: string) {
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) throw new Error("Unauthorized");

    const credentials = await db.query.serviceCredentials.findMany({
        where: eq(serviceCredentials.ledgerId, ledgerId),
        orderBy: [desc(serviceCredentials.createdAt)],
    });

    return credentials;
}

export async function createServiceCredentialAction(ledgerId: string, data: z.infer<typeof createCredentialSchema>) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        const validated = createCredentialSchema.parse(data);

        // Generate a secure random key
        const key = `sk_live_${crypto.randomBytes(24).toString('hex')}`;

        const [credential] = await db.insert(serviceCredentials).values({
            ledgerId,
            name: validated.name,
            key: key,
        }).returning();

        revalidatePath(`/ledger/${ledgerId}/settings`);

        return {
            success: true,
            data: {
                ...credential,
                createdAt: credential.createdAt.toISOString(),
                lastUsedAt: credential.lastUsedAt ? credential.lastUsedAt.toISOString() : undefined
            }
        };
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to create service credential");
        return { success: false, error: "Failed to create service credential" };
    }
}

export async function deleteServiceCredentialAction(ledgerId: string, credentialId: string) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        // Verify ownership and delete
        const result = await db.delete(serviceCredentials).where(
            and(
                eq(serviceCredentials.id, credentialId),
                eq(serviceCredentials.ledgerId, ledgerId)
            )
        ).returning();

        if (result.length === 0) return { success: false, error: "Not found" };

        revalidatePath(`/ledger/${ledgerId}/settings`);
        return { success: true };
    } catch (error) {
        logger.error({ error, ledgerId, credentialId }, "Failed to delete service credential");
        return { success: false, error: "Failed to delete service credential" };
    }
}
