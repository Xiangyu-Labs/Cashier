"use server";

import { db } from "@/lib/db";
import { serviceCredentials } from "@/features/ledger/server/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import crypto from "crypto";

const createCredentialSchema = z.object({
    name: z.string().min(1),
});

import { forLedger } from "@/lib/db/scoped-query";

export async function getServiceCredentialsAction(ledgerId: string) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(serviceCredentials, ledgerId);
    const credentials = await db.query.serviceCredentials.findMany({
        where: q.whereActive,
        orderBy: [desc(serviceCredentials.createdAt)],
    });

    return credentials.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    }));
}

export async function createServiceCredentialAction(ledgerId: string, data: z.infer<typeof createCredentialSchema>) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const validated = createCredentialSchema.parse(data);

    // Generate a secure random key
    const key = `sk_live_${crypto.randomBytes(24).toString('hex')}`;

    const [credential] = await db.insert(serviceCredentials).values({
        ledgerId,
        name: validated.name,
        key: key,
    }).returning();

    return {
        ...credential,
        createdAt: credential.createdAt.toISOString(),
        lastUsedAt: credential.lastUsedAt ? credential.lastUsedAt.toISOString() : null,
        deletedAt: credential.deletedAt ? credential.deletedAt.toISOString() : null,
    };
}

export async function deleteServiceCredentialAction(ledgerId: string, credentialId: string): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(serviceCredentials, ledgerId);

    // Verify ownership and delete
    const result = await db.update(serviceCredentials)
        .set(q.softDelete)
        .where(q.whereId(credentialId))
        .returning();

    if (result.length === 0) throw new Error("Credential not found");
}

export async function validateServiceCredential(key: string) {
    const existingKey = await db.query.serviceCredentials.findFirst({
        where: and(eq(serviceCredentials.key, key), isNull(serviceCredentials.deletedAt)),
    });

    if (existingKey) {
        // Update last used asynchronously
        await db.update(serviceCredentials).set({ lastUsedAt: new Date() }).where(eq(serviceCredentials.id, existingKey.id));
        return existingKey;
    }

    return null;
}

