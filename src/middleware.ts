import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);
const intlMiddleware = createMiddleware(routing);

export default auth((req) => {
    const { pathname } = req.nextUrl;

    // 1. Skip static files and Next.js internals
    if (
        pathname.startsWith("/_next") ||
        pathname.includes(".")
    ) {
        return NextResponse.next();
    }

    // 2. API Routes - Skip internationalization, handle Auth
    if (pathname.startsWith("/api/")) {
        const isPublicApi =
            pathname.startsWith("/api/auth") ||
            pathname.startsWith("/api/s/") || // Share API
            pathname.startsWith("/api/v1/");

        if (!isPublicApi && !req.auth) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.next();
    }

    // 3. Define Public Pages
    const isPublicPath = (path: string) => {
        const publicPrefixes = ["/login", "/s/"];

        // Remove locale prefix for checking if the path is public
        // next-intl middleware will handle the actual prefixing/un-prefixing
        const pathSegments = path.split('/').filter(Boolean);
        const firstSegment = pathSegments[0];

        // Check if first segment is a locale
        let checkPath = path;
        if (routing.locales.includes(firstSegment as any)) {
            checkPath = '/' + pathSegments.slice(1).join('/');
        }

        if (publicPrefixes.some(p => checkPath === p || checkPath.startsWith(p))) return true;
        return false;
    };

    const isPublicPage = isPublicPath(pathname);

    // 4. Protected Routes Logic
    if (!isPublicPage && !req.auth) {
        // Redirect to /login. next-intl middleware (called via intlMiddleware) 
        // will handle adding the locale prefix if needed based on the 'as-needed' rule.
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // 5. Run Layout/Locale Middleware
    return intlMiddleware(req);
});

export const config = {
    // Matcher ignoring static files
    matcher: ["/((?!_next|.*\\..*).*)"],
};
