import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
    users,
    accounts,
    sessions,
    verificationTokens,
} from "@/lib/db/schema";

// Create a separate auth instance for middleware that includes the adapter
// but excludes problematic providers (like Resend which uses streams)
const { auth } = NextAuth({
    ...authConfig,
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
    }),
    session: {
        strategy: "database",
    },
});

const intlMiddleware = createIntlMiddleware(routing);

// Public routes that don't require authentication
const publicPatterns = [
    "/login",
    "/api/auth",
    "/s/", // Share links are public
    "/api/s/", // Share API endpoints are public
];

// Check if the path matches any public pattern
function isPublicPath(pathname: string): boolean {
    return publicPatterns.some((pattern) => pathname.includes(pattern));
}

export default auth((request) => {
    const { pathname } = request.nextUrl;

    // Skip auth for static files and Next.js internals
    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/api/auth") ||
        pathname.includes(".")
    ) {
        return intlMiddleware(request);
    }

    // Skip auth for public routes
    if (isPublicPath(pathname)) {
        return intlMiddleware(request);
    }

    // For API routes (except public ones), return 401 if not authenticated
    if (pathname.startsWith("/api/")) {
        if (!request.auth) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // API routes don't need i18n
        return NextResponse.next();
    }

    // For page routes, redirect to login if not authenticated
    if (!request.auth) {
        const locale = pathname.split("/")[1];
        const validLocales = ["zh", "en"];
        const targetLocale = validLocales.includes(locale) ? locale : "zh";
        const loginUrl = new URL(`/${targetLocale}/login`, request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Authenticated - proceed with i18n middleware
    return intlMiddleware(request);
});

export const config = {
    // Match all routes except static files
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
