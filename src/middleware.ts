import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth({
    ...authConfig,
    session: {
        strategy: "jwt",
    },
});

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
        // Public APIs
        if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/s/")) {
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

    // Allow authenticated request
    return NextResponse.next();
});

export default proxy;

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
