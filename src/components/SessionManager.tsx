'use client';

import { useEffect } from "react";
import { touchSession } from "@/actions/session";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "@/i18n/routing";

export function SessionManager() {
    const { status } = useSession();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (status === "authenticated") {
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
    }, [status, pathname, router]);

    return null;
}
