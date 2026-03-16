"use server";

import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth-actions";
import { eq, and, isNull, desc } from "drizzle-orm";

export const getLedgerAction = withAuth(async (userId: string, id: string): Promise<import("@/types/api").Ledger | null> => {
    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== userId) {
        return null;
    }

    return {
        id: existing.id,
        userId: existing.userId,
        metadata: existing.metadata,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
        deletedAt: existing.deletedAt ? existing.deletedAt.toISOString() : null,
    };
});

export const getLedgersAction = withAuth(async (userId: string): Promise<import("@/types/api").Ledger[]> => {
    const rows = await db.query.ledgers.findMany({
        where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
        orderBy: [desc(ledgers.createdAt)],
    });

    return rows.map(row => ({
        id: row.id,
        userId: row.userId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    }));
});
