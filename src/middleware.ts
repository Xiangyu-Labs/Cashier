import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth({
    ...authConfig,
    session: {
        strategy: "jwt",
    },
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const proxy = auth((request) => {
    const { pathname } = request.nextUrl;

    // 1. Skip static files and Next.js internals
    if (
        pathname.startsWith("/_next") ||
        pathname.includes(".")
    ) {
        return NextResponse.next();
    }

    // 2. API routes handling
    if (pathname.startsWith("/api/")) {
        // Public APIs or Token-based APIs
        if (
            pathname.startsWith("/api/auth") ||
            pathname.startsWith("/api/s/") ||
            pathname.startsWith("/api/v1/")
        ) {
            return NextResponse.next();
        }
        // Protected APIs
        if (!request.auth) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.next();
    }

    // 3. Public Pages handling
    const publicPages = ["/login", "/s/"];
    if (publicPages.some(p => pathname === p || pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // 4. Protected Pages handling
    if (!request.auth) {
        // Redirect to login if not authenticated
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // 5. UUID Validation for Ledger routes
    // Handles /ledger/[id], /ledger/[id]/settings, /ledger/[id]/categories
    const ledgerMatch = pathname.match(/^\/ledger\/([^\/]+)(\/.*)?$/);
    if (ledgerMatch) {
        const id = ledgerMatch[1];
        if (!UUID_REGEX.test(id)) {
            // Redirect to 404 for invalid UUIDs in ledger routes
            return NextResponse.rewrite(new URL("/not-found", request.url));
        }
    }

    // Allow authenticated request
    return NextResponse.next();
});

export default proxy;

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
