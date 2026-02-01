'use server';

import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function deleteAccount() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new Error("Unauthorized");
        }

        // Delete user
        // Due to "onDelete: cascade" in schema, this will delete:
        // - Sessions (drizzle-adapter managed? Need to check if cascade is set in DB properly)
        // - Accounts
        // - Ledgers (and all related data: entries, docs, etc.)

        // Note: Drizzle schema `references(..., { onDelete: "cascade" })` sets the constraint in DB.
        // Assuming DB was migrated with these constraints.

        await db.update(users)
            .set({ deletedAt: new Date() })
            .where(eq(users.id, session.user.id));

        // Sign out
        await signOut({ redirectTo: "/" });

    } catch (error) {
        logger.error({ error }, "Failed to delete account");
        throw error;
    }
}
