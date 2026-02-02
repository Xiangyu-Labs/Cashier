import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/features/notifications/server/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    logger.warn("VAPID keys are missing. Web Push notifications will not work.");
} else {
    webpush.setVapidDetails(
        "mailto:example@yourdomain.com", // Replace with real email or env var
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

export interface NotificationPayload {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    data?: Record<string, unknown>;
}

/**
 * Send a notification to all subscribed devices of a user
 */
export async function sendNotificationToUser(userId: string, payload: NotificationPayload) {
    try {
        const subscriptions = await db.query.pushSubscriptions.findMany({
            where: eq(pushSubscriptions.userId, userId),
        });

        if (subscriptions.length === 0) {
            return { sent: 0, failed: 0 };
        }

        const notificationData = JSON.stringify(payload);

        const results = await Promise.allSettled(
            subscriptions.map(async (sub) => {
                try {
                    await webpush.sendNotification(
                        {
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth,
                            },
                        },
                        notificationData
                    );
                    return { success: true, id: sub.id };
                } catch (error: unknown) {
                    const err = error as { statusCode?: number };
                    // 410 Gone or 404 Not Found means subscription is dead
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
                        return { success: false, id: sub.id, reason: "expired" };
                    }
                    throw error;
                }
            })
        );

        const sent = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
        const failed = results.length - sent;

        logger.info({ userId, sent, failed }, "Sent push notifications");
        return { sent, failed };

    } catch (error) {
        logger.error({ error, userId }, "Failed to send user notifications");
        return { sent: 0, failed: 0 };
    }
}
