import { db } from "@/lib/db";
import { serviceCredentials } from "./schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// Helper function to generate a secure random key
function generateKey(): string {
    // Simple "sk_" prefix + uuid for this mvp. 
    return `sk_${uuidv4().replace(/-/g, "")}`;
}

export async function createServiceCredential(ledgerId: string, name: string) {
    const key = generateKey();
    const [newCredential] = await db
        .insert(serviceCredentials)
        .values({
            ledgerId,
            name,
            key,
        })
        .returning();
    return newCredential;
}

export async function listServiceCredentials(ledgerId: string) {
    return await db.query.serviceCredentials.findMany({
        where: eq(serviceCredentials.ledgerId, ledgerId),
        orderBy: (serviceCredentials, { desc }) => [desc(serviceCredentials.createdAt)],
    });
}

export async function deleteServiceCredential(ledgerId: string, id: string) {
    await db.delete(serviceCredentials).where(and(eq(serviceCredentials.id, id), eq(serviceCredentials.ledgerId, ledgerId)));
}

export async function validateServiceCredential(key: string) {
    const existingKey = await db.query.serviceCredentials.findFirst({
        where: eq(serviceCredentials.key, key),
    });

    if (existingKey) {
        // Update last used asynchronously
        await db.update(serviceCredentials).set({ lastUsedAt: new Date() }).where(eq(serviceCredentials.id, existingKey.id));
        return existingKey;
    }

    return null;
}
