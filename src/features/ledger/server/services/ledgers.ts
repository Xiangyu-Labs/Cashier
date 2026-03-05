import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { Ledger } from "@/types/api";
import { serializeLedger } from "@/lib/serialization/utils";

/**
 * Data Access Layer for Ledgers
 * Direct database access functions to be used by Server Components and Server Actions.
 */

export async function getLedgers(userId: string): Promise<Ledger[]> {
    const rows = await db.query.ledgers.findMany({
        where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
        orderBy: [desc(ledgers.createdAt)],
    });

    return rows.map(serializeLedger);
}

export async function getLedger(ledgerId: string): Promise<Ledger | undefined> {
    const row = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });

    if (!row) return undefined;
    return serializeLedger(row);
}


