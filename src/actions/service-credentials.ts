"use server";

import { db } from "@/lib/db";
import { serviceCredentials } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
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
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) return { success: false, error: "Unauthorized" };

    const validated = createCredentialSchema.parse(data);
    const key = `sk_${crypto.randomBytes(16).toString("hex")}`;

    const [credential] = await db.insert(serviceCredentials).values({
        ledgerId,
        name: validated.name,
        key: key,
    }).returning();

    revalidatePath(`/ledger/${ledgerId}/settings`); // Assuming settings page

    return { success: true, data: credential };
}

export async function deleteServiceCredentialAction(ledgerId: string, credentialId: string) {
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) return { success: false, error: "Unauthorized" };

    await db.delete(serviceCredentials).where(eq(serviceCredentials.id, credentialId));

    revalidatePath(`/ledger/${ledgerId}/settings`);

    return { success: true };
}
