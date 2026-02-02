"use server";

import { db } from "@/lib/db";
import { pushSubscriptions } from "@/features/notifications/server/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth"; // Assuming auth helper
import { z } from "zod";

const subscriptionSchema = z.object({
    endpoint: z.string(),
    keys: z.object({
        p256dh: z.string(),
        auth: z.string(),
    }),
});

export async function getVapidPublicKeyAction() {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}

export async function subscribeToPushAction(subscription: z.infer<typeof subscriptionSchema>) {
    subscriptionSchema.parse(subscription);
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: "Unauthorized" };
    }

    try {
        // Idempotent insert (on conflict do nothing logic handled by application check here)
        // Or simple insert, unique constraint handles duplicates
        // We really want: if exists update, else insert (upsert)

        // Check if exists
        const [existing] = await db.select().from(pushSubscriptions).where(
            and(
                eq(pushSubscriptions.userId, session.user.id),
                eq(pushSubscriptions.endpoint, subscription.endpoint)
            )
        );

        if (existing) {
            // Update keys just in case they rotated
            await db.update(pushSubscriptions).set({
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                updatedAt: new Date(),
            }).where(eq(pushSubscriptions.id, existing.id));
        } else {
            await db.insert(pushSubscriptions).values({
                userId: session.user.id,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
            });
        }

        return { success: true };
    } catch (error) {
        console.error("Subscribe failed", error);
        return { success: false, error: "Failed to subscribe" };
    }
}

export async function unsubscribeFromPushAction(endpoint: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: "Unauthorized" };
    }

    try {
        await db.delete(pushSubscriptions).where(
            and(
                eq(pushSubscriptions.userId, session.user.id),
                eq(pushSubscriptions.endpoint, endpoint)
            )
        );
        return { success: true };
    } catch (error) {
        console.error("Unsubscribe failed", error);
        return { success: false, error: "Failed to unsubscribe" };
    }
}
