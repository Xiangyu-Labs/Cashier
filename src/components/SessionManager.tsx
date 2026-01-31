'use client';

import { useEffect } from "react";
import { touchSession } from "@/actions/session";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "@/i18n/routing";

export function SessionManager() {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (status === "authenticated") {
            // Check if the session is valid (has user.id)
            // This handles the case where JWT exists but user was deleted from DB
            if (!session?.user?.id) {
                console.log("Session exists but user data is invalid, signing out...");
                signOut({ callbackUrl: "/login" });
                return;
            }

            // Update session info (IP, User Agent) on load
            touchSession();
        } else if (status === "unauthenticated") {
            // If the user is unauthenticated on a private route, redirect to login
            // Note: Middleware usually handles this, but this serves as a backup for
            // client-side session invalidation (e.g. user deleted from DB)
            const publicPaths = ["/login", "/s/"];
            const isPublicPath = publicPaths.some(path =>
                pathname === path || pathname.startsWith(path)
            );

            if (!isPublicPath) {
                console.log("Session invalid on private path, redirecting to login...");
                router.replace("/login");
            }
        }
    }, [status, session, pathname, router]);

    return null;
}
