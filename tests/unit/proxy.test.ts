import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockIntlMiddleware } = vi.hoisted(() => ({
  mockIntlMiddleware: vi.fn(),
}));

vi.mock("next-intl/middleware", () => ({
  default: () => mockIntlMiddleware,
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: (
      cb: (req: NextRequest & { auth: unknown }) => Promise<Response | void> | Response | void
    ) => cb,
  }),
}));

vi.mock("../../src/auth.config", () => ({
  authConfig: {},
}));

vi.mock("../../src/i18n/routing", () => ({
  routing: {
    locales: ["zh", "en"],
    defaultLocale: "zh",
  },
}));

import proxy from "@/proxy";

describe("Proxy Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntlMiddleware.mockReturnValue(new NextResponse(null, { status: 200 }));
  });

  function createRequest(path: string, auth: unknown = null) {
    const url = new URL(path, "http://localhost:3000");
    const req = new NextRequest(url) as NextRequest & { auth?: unknown };
    req.auth = auth;
    return req;
  }

  const invokeProxy = (req: NextRequest) =>
    (proxy as unknown as (req: NextRequest) => Promise<NextResponse>)(req);

  describe("Public Routes", () => {
    it("sends public pages through locale routing without authentication", async () => {
      for (const path of ["/login", "/zh/login", "/s/some-share-id"]) {
        mockIntlMiddleware.mockClear();
        await invokeProxy(createRequest(path));
        expect(mockIntlMiddleware).toHaveBeenCalledOnce();
      }
    });

    it("should allow access to /api/auth/* without authentication", async () => {
      const req = createRequest("/api/auth/session");
      const res = await invokeProxy(req);
      expect(res.status).toBe(200);
    });

    it("allows versioned i18n assets without authentication", async () => {
      const res = await invokeProxy(createRequest("/api/i18n/en/stats.json"));
      expect(res.status).toBe(200);
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });
  });

  describe("Protected Page Routes", () => {
    it("leaves page authorization to protected layouts while preserving locale routing", async () => {
      for (const request of [
        createRequest("/dashboard"),
        createRequest("/en/dashboard"),
        createRequest("/dashboard", { user: { id: "user1" } }),
      ]) {
        mockIntlMiddleware.mockClear();
        expect((await invokeProxy(request)).status).toBe(200);
        expect(mockIntlMiddleware).toHaveBeenCalledOnce();
      }
    });
  });

  describe("Protected API Routes", () => {
    it.each(["/api/auth-admin", "/api/authentication"])(
      "does not treat %s as an Auth.js endpoint",
      async (path) => {
        const res = await invokeProxy(createRequest(path));
        expect(res.status).toBe(401);
      }
    );

    it("should return 401 for unauthenticated access to /api/protected", async () => {
      const req = createRequest("/api/protected");
      const res = await invokeProxy(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });

    it("should allow authenticated access to /api/protected", async () => {
      const req = createRequest("/api/protected", { user: { id: "user1" } });
      const res = await invokeProxy(req);

      expect(res.status).toBe(200);
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });

    it("does not let a dot bypass API authentication", async () => {
      const res = await invokeProxy(createRequest("/api/private/file.json"));
      expect(res.status).toBe(401);
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });
  });

  describe("Static Assets", () => {
    it("should skip proxy for _next paths", async () => {
      const req = createRequest("/_next/static/chunk.js");
      const res = await invokeProxy(req);
      expect(res.status).toBe(200);
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });
  });
});
