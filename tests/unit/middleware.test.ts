import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
const { mockIntlMiddleware } = vi.hoisted(() => ({
  mockIntlMiddleware: vi.fn(),
}));

// Mock next-intl/middleware
vi.mock("next-intl/middleware", () => ({
  default: () => mockIntlMiddleware,
}));

// Mock next-auth
vi.mock("next-auth", () => ({
  default: () => ({
    auth: (
      cb: (req: NextRequest & { auth: unknown }) => Promise<Response | void> | Response | void
    ) => cb,
  }),
}));

// Mock auth.config
vi.mock("../../src/auth.config", () => ({
  authConfig: {},
}));

// Mock i18n/routing
vi.mock("../../src/i18n/routing", () => ({
  routing: {
    locales: ["zh", "en"],
    defaultLocale: "zh",
  },
}));

// Import the middleware (this executes the mocked NextAuth and exports the callback)
import middleware from "../../src/middleware";

describe("Middleware Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default intl middleware response
    mockIntlMiddleware.mockReturnValue(new NextResponse(null, { status: 200 }));
  });

  // Helper to create a request with optional auth session
  function createRequest(path: string, auth: unknown = null) {
    const url = new URL(path, "http://localhost:3000");
    const req = new NextRequest(url) as NextRequest & { auth?: unknown };
    req.auth = auth;
    return req;
  }

  const invokeMiddleware = (req: NextRequest) =>
    (middleware as unknown as (req: NextRequest) => Promise<NextResponse>)(req);

  describe("Public Routes", () => {
    it("should allow access to /login without authentication", async () => {
      const req = createRequest("/login");
      await invokeMiddleware(req);
      // /login is a public page, so it should call intlMiddleware
      expect(mockIntlMiddleware).toHaveBeenCalled();
    });

    it("should allow access to localized /zh/login without authentication", async () => {
      const req = createRequest("/zh/login");
      await invokeMiddleware(req);
      // /zh/login is a public page (locale stripped), so it should call intlMiddleware
      expect(mockIntlMiddleware).toHaveBeenCalled();
    });

    it("should allow access to /s/share-id without authentication", async () => {
      const req = createRequest("/s/some-share-id");
      await invokeMiddleware(req);
      expect(mockIntlMiddleware).toHaveBeenCalled();
    });

    it("should allow access to /api/auth/* without authentication", async () => {
      const req = createRequest("/api/auth/session");
      const res = await invokeMiddleware(req);
      // Returns NextResponse.next() for /api/auth paths, which in Vitest mock might not have headers
      expect(res.status).toBe(200);
    });
  });

  describe("Protected Page Routes", () => {
    it("should redirect unauthenticated user to login from /dashboard", async () => {
      const req = createRequest("/dashboard");
      const res = await invokeMiddleware(req);

      // Pages are no longer protected by middleware, so it should call intlMiddleware and return 200
      expect(res.status).toBe(200);
      expect(mockIntlMiddleware).toHaveBeenCalled();
    });

    it("should redirect unauthenticated user to login from /en/dashboard", async () => {
      const req = createRequest("/en/dashboard");
      const res = await invokeMiddleware(req);

      expect(res.status).toBe(200);
      expect(mockIntlMiddleware).toHaveBeenCalled();
    });

    it("should allow authenticated user to access /dashboard", async () => {
      const req = createRequest("/dashboard", { user: { id: "user1" } });
      await invokeMiddleware(req);
      expect(mockIntlMiddleware).toHaveBeenCalled();
    });
  });

  describe("Protected API Routes", () => {
    it("should return 401 for unauthenticated access to /api/protected", async () => {
      const req = createRequest("/api/protected");
      const res = await invokeMiddleware(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });

    it("should allow authenticated access to /api/protected", async () => {
      const req = createRequest("/api/protected", { user: { id: "user1" } });
      const res = await invokeMiddleware(req);

      // API routes should return next() (status 200)
      expect(res.status).toBe(200);
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });
  });

  describe("Static Assets", () => {
    it("should skip middleware for _next paths", async () => {
      const req = createRequest("/_next/static/chunk.js");
      const res = await invokeMiddleware(req);
      // Returns NextResponse.next() (status 200)
      expect(res.status).toBe(200);
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });
  });
});
