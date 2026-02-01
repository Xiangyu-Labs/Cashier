'use client';

import { useEffect } from "react";
import { touchSession } from "@/features/auth/server/actions/session";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "@/i18n/routing";

export function SessionManager() {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        console.log(`[SessionManager] Status: ${status}, Pathname: ${pathname}, IsPublic: ${pathname === "/login" || pathname === "/s/" || pathname.startsWith("/login") || pathname.startsWith("/s/")}`);

        if (status === "authenticated") {
            // Check if the session is valid (has user.id)
            // This handles the case where JWT exists but user was deleted from DB
            if (!session?.user?.id) {
                console.log("Session exists but user data is invalid, signing out...");

                // Only sign out if we're not already on the login page to avoid redirect loops
                if (!pathname.includes("/login")) {
                    signOut({ callbackUrl: "/login" });
                }
                return;
            }

            // Update session info (IP, User Agent) on load
            touchSession();
        } else if (status === "unauthenticated") {
            // If the user is unauthenticated on a private route, redirect to login
            // Note: Middleware usually handles this, but this serves as a backup for
            // client-side session invalidation (e.g. user deleted from DB)
            // Simple check: if path contains "login" or starts with "/s/", it's public
            const isPublicPath = pathname.includes("/login") || pathname.includes("/s/");

            if (!isPublicPath) {
                console.log(`[SessionManager] Session invalid on private path ${pathname}, redirecting to login...`);
                router.replace("/login");
            }
        }
    }, [status, session, pathname, router]);

    return null;
}
