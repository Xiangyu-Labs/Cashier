import { db } from "@/lib/db";
import { serviceCredentials } from "@/lib/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { cache } from "react";
import { ServiceCredential } from "@/types/api";

export const getServiceCredentials = cache(async (ledgerId: string): Promise<ServiceCredential[]> => {
    const rows = await db.query.serviceCredentials.findMany({
        where: and(eq(serviceCredentials.ledgerId, ledgerId), isNull(serviceCredentials.deletedAt)),
        orderBy: [desc(serviceCredentials.createdAt)],
    });

    return rows.map(r => ({
        id: r.id,
        name: r.name,
        key: r.key,
        ledgerId: r.ledgerId,
        createdAt: r.createdAt.toISOString(),
        lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
        deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    }));
});
