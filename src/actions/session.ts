'use server';

import { auth } from "@/auth";
import { revokeSession as revokeSessionLib, touchSession as touchSessionLib } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { logger } from "@/lib/logger";

export async function revokeSession(sessionToken: string) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new Error("Unauthorized");
        }
        await revokeSessionLib(sessionToken, session.user.id);
        revalidatePath("/settings/devices");
    } catch (error) {
        logger.error({ error }, "Failed to revoke session");
        throw error;
    }
}

export async function touchSession() {
    try {
        const session = await auth();
        if (!session?.user) return;

        const cookieStore = await cookies();
        // Auth.js v5 cookie names can vary (secure prefix etc.)
        // We look for one that ends with session-token
        const sessionCookie = cookieStore.getAll().find(c => c.name.includes("session-token"));

        if (sessionCookie?.value) {
            await touchSessionLib(sessionCookie.value);
        }
    } catch (error) {
        // Silently fail for touch session to not disrupt UI
        console.error("Failed to touch session:", error);
    }
}
