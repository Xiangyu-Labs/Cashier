import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);
const intlMiddleware = createMiddleware(routing);

export default auth((req) => {
    const { pathname } = req.nextUrl;
    const referer = req.headers.get("referer");
    const acceptLanguage = req.headers.get("accept-language");

    // 1. Skip static files
    if (pathname.startsWith("/_next") || pathname.includes(".")) {
        return NextResponse.next();
    }

    // 2. Handle API Routes
    if (pathname.startsWith("/api/")) {
        const isPublicApi =
            pathname.startsWith("/api/auth") ||
            pathname.startsWith("/api/s/") ||
            pathname.startsWith("/api/v1/");

        if (!isPublicApi && !req.auth) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.next();
    }

    // 3. Define Public Pages
    const isPublicPath = (path: string) => {
        const publicPrefixes = ["/login", "/s/"];
        const pathSegments = path.split('/').filter(Boolean);
        const firstSegment = pathSegments[0];
        let checkPath = path;
        if (routing.locales.includes(firstSegment as any)) {
            checkPath = '/' + pathSegments.slice(1).join('/');
        }
        return publicPrefixes.some(p => checkPath === p || checkPath.startsWith(p));
    };

    const isPublicPage = isPublicPath(pathname);

    // 4. Handle Auth Redirects BEFORE Intl if not public
    if (!isPublicPage && !req.auth) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(url);
    }

    // 5. Run Intl Middleware
    return intlMiddleware(req);
});

// };

export const config = {
    // Matcher ignoring static files
    matcher: ["/((?!_next|.*\\..*).*)"],
};
