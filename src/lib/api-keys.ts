import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// Helper function to generate a secure random key
function generateKey(): string {
    // Simple "sk_" prefix + uuid for this mvp. 
    // For higher security, use crypto.randomBytes(32).toString('hex')
    return `sk_${uuidv4().replace(/-/g, "")}`;
}

export async function createApiKey(ledgerId: string, name: string) {
    const key = generateKey();
    const [newKey] = await db
        .insert(apiKeys)
        .values({
            ledgerId,
            name,
            key,
        })
        .returning();
    return newKey;
}

export async function listApiKeys(ledgerId: string) {
    return await db.query.apiKeys.findMany({
        where: eq(apiKeys.ledgerId, ledgerId),
        orderBy: (apiKeys, { desc }) => [desc(apiKeys.createdAt)],
    });
}

export async function deleteApiKey(ledgerId: string, id: string) {
    await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.ledgerId, ledgerId)));
}

export async function validateApiKey(key: string) {
    const existingKey = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.key, key),
    });

    if (existingKey) {
        // Update last used asynchronously
        await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, existingKey.id));
        return existingKey;
    }

    return null;
}
