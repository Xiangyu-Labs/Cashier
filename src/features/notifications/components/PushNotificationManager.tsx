"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
    subscribeToPushAction,
    unsubscribeFromPushAction,
    getVapidPublicKeyAction
} from "@/features/notifications/server/actions";

function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function PushNotificationManager() {
    const t = useTranslations('Settings');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if ("serviceWorker" in navigator && "PushManager" in window) {
            setIsSupported(true);
            checkSubscription();
        } else {
            setIsLoading(false);
        }
    }, []);

    async function checkSubscription() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        } catch (error) {
            console.error("Error checking subscription:", error);
        } finally {
            setIsLoading(false);
        }
    }

    async function subscribe() {
        setIsLoading(true);
        try {
            const outputVapidKey = await getVapidPublicKeyAction();
            if (!outputVapidKey) {
                toast.error("VAPID key missing on server");
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            const convertedVapidKey = urlBase64ToUint8Array(outputVapidKey);

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey,
            });

            const result = await subscribeToPushAction({
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.toJSON().keys?.p256dh || "",
                    auth: subscription.toJSON().keys?.auth || "",
                },
            });

            if (result.success) {
                setIsSubscribed(true);
                toast.success(t("notificationsEnabled"));
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error("Subscription failed:", error);
            if (error.message?.includes('Permission denied')) {
                toast.error(t("notificationPermissionDenied"));
            } else {
                toast.error(t("notificationSubscribeFailed"));
            }
        } finally {
            setIsLoading(false);
        }
    }

    async function unsubscribe() {
        setIsLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                // Unsubscribe from backend
                await unsubscribeFromPushAction(subscription.endpoint);
                // Unsubscribe from browser
                await subscription.unsubscribe();
                setIsSubscribed(false);
                toast.success(t("notificationsDisabled"));
            }
        } catch (error) {
            console.error("Unsubscription failed:", error);
            toast.error(t("notificationUnsubscribeFailed"));
        } finally {
            setIsLoading(false);
        }
    }

    if (!isSupported) {
        if (isLoading) return null;
        return (
            <div className="flex items-center justify-between opacity-50">
                <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg text-primary mt-1 hidden sm:block">
                        <Bell className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-medium">{t('pushNotifications')}</h3>
                        <p className="text-sm text-[var(--muted)] max-w-md">
                            {t('pushNotificationsDesc')} ({t('notificationNotSupported')})
                        </p>
                    </div>
                </div>
                <Switch disabled checked={false} />
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-start gap-4">
                <div className="bg-primary/10 p-2 rounded-lg text-primary mt-1 hidden sm:block">
                    <Bell className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-base font-medium">{t('pushNotifications')}</h3>
                    <p className="text-sm text-[var(--muted)] max-w-md">
                        {t('pushNotificationsDesc')}
                    </p>
                </div>
            </div>
            <Switch
                checked={isSubscribed}
                onCheckedChange={(checked) => {
                    if (checked) subscribe();
                    else unsubscribe();
                }}
                disabled={isLoading}
            />
        </div>
    );
}
