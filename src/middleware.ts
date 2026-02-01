import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);
const intlMiddleware = createMiddleware(routing);

export default auth((req) => {
    const { pathname } = req.nextUrl;

    // 1. Skip static files and Next.js internals (handled by matcher, but double check)
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
            pathname.startsWith("/api/v1/");  // Basic V1 might be public? Original code said yes.

        if (!isPublicApi && !req.auth) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.next();
    }

    // 3. Define Public Pages
    const isPublicPath = (path: string) => {
        const publicPrefixes = ["/login", "/s/"];
        // Check exact match or startswith for root paths
        if (publicPrefixes.some(p => path === p || path.startsWith(p))) return true;

        // Check locale prefixed paths
        return routing.locales.some(locale => {
            const prefix = `/${locale}`;
            return publicPrefixes.some(p =>
                path === `${prefix}${p}` || path.startsWith(`${prefix}${p}/`)
            );
        });
    };

    const isPublicPage = isPublicPath(pathname);

    // 4. Protected Routes Logic
    if (!isPublicPage && !req.auth) {
        // Infer locale from path or default
        const localeMatch = pathname.match(new RegExp(`^/(${routing.locales.join("|")})`));
        const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;

        const loginPath = `/${locale}/login`;

        const loginUrl = new URL(loginPath, req.url);
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
