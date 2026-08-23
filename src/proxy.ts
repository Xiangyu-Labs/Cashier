import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);
const intlMiddleware = createMiddleware(routing);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // API routes must be classified before dotted static-looking paths.
  if (pathname.startsWith("/api/")) {
    const isPublicApi =
      pathname === "/api/auth" ||
      pathname.startsWith("/api/auth/") ||
      pathname.startsWith("/api/v1/") ||
      pathname.startsWith("/api/i18n/");

    if (!isPublicApi && !req.auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // 3. For all other routes (pages), run Intl Middleware
  // Auth protection for pages is handled by (protected) layout
  return intlMiddleware(req);
});

export const config = {
  // Matcher ignoring static files
  matcher: ["/api/:path*", "/((?!_next|.*\\..*).*)"],
};
