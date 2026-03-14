"use server";

import { withAuth } from "@/lib/auth-actions";

export const setDefaultLedgerAction = withAuth(async (userId: string, ledgerId: string): Promise<void> => {
    const { setUserDefaultLedger } = await import("@/features/auth/server/services/user-setup");
    await setUserDefaultLedger(userId, ledgerId);
});

export const getDefaultLedgerIdAction = withAuth(async (userId: string): Promise<string | null> => {
    const { getUserDefaultLedgerId } = await import("@/features/auth/server/services/user-setup");
    return getUserDefaultLedgerId(userId);
});
