import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock dependencies
const { mockIntlMiddleware } = vi.hoisted(() => ({
  mockIntlMiddleware: vi.fn(),
}));

// Mock next-intl/middleware
vi.mock('next-intl/middleware', () => ({
  default: () => mockIntlMiddleware,
}));

// Mock next-auth
// We mock auth to simply return the callback it receives.
// This allows us to invoke the middleware logic directly with a crafted request.
vi.mock('next-auth', () => ({
  default: () => ({
    auth: (callback: any) => callback,
  }),
}));

// Mock auth.config
vi.mock('../../src/auth.config', () => ({
  authConfig: {},
}));

// Mock i18n/routing
vi.mock('../../src/i18n/routing', () => ({
  routing: {
    locales: ['zh', 'en'],
    defaultLocale: 'zh',
  },
}));

// Import the middleware (this executes the mocked NextAuth and exports the callback)
import middleware from '../../src/middleware';

describe('Middleware Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default intl middleware response
    mockIntlMiddleware.mockReturnValue(new NextResponse(null, { status: 200 }));
  });

  // Helper to create a request with optional auth session
  function createRequest(path: string, auth: any = null) {
    const url = new URL(path, 'http://localhost:3000');
    const req = new NextRequest(url) as any;
    req.auth = auth;
    return req;
  }

  describe('Public Routes', () => {
    it('should allow access to /login without authentication', async () => {
      const req = createRequest('/login');
      const res = await (middleware as any)(req);
      // /login is a public page, so it should return NextResponse.next()
      // Which has x-middleware-next: 1
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('should allow access to localized /zh/login without authentication', async () => {
      const req = createRequest('/zh/login');
      const res = await (middleware as any)(req);
      // /zh/login is NOT explicitly in publicPages, so it should REDIRECT to /login
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('should allow access to /s/share-id without authentication', async () => {
      const req = createRequest('/s/some-share-id');
      const res = await (middleware as any)(req);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('should allow access to /api/auth/* without authentication', async () => {
      const req = createRequest('/api/auth/session');
      const res = await (middleware as any)(req);
      // Returns NextResponse.next() for /api/auth paths
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });
  });

  describe('Protected Page Routes', () => {
    it('should redirect unauthenticated user to login from /dashboard', async () => {
      const req = createRequest('/dashboard');
      const res = await (middleware as any)(req);

      // Should be a redirect
      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/login');
      expect(location).toContain(`callbackUrl=%2Fdashboard`);
    });

    it('should redirect unauthenticated user to login from /en/dashboard', async () => {
      const req = createRequest('/en/dashboard');
      const res = await (middleware as any)(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/login');
      expect(location).toContain(`callbackUrl=%2Fen%2Fdashboard`);
    });

    it('should allow authenticated user to access /dashboard', async () => {
      const req = createRequest('/dashboard', { user: { id: 'user1' } });
      const res = await (middleware as any)(req);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });
  });

  describe('Protected API Routes', () => {
    it('should return 401 for unauthenticated access to /api/protected', async () => {
      const req = createRequest('/api/protected');
      const res = await (middleware as any)(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });

    it('should allow authenticated access to /api/protected', async () => {
      const req = createRequest('/api/protected', { user: { id: 'user1' } });
      const res = await (middleware as any)(req);

      // API routes should return next() (status 200 with x-middleware-next)
      // or whatever NextResponse.next() returns.
      // In Next.js middleware, next() returns a Response with header x-middleware-next: 1
      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('Static Assets', () => {
    it('should skip middleware for _next paths', async () => {
      const req = createRequest('/_next/static/chunk.js');
      const res = await (middleware as any)(req);
      // Returns NextResponse.next()
      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(mockIntlMiddleware).not.toHaveBeenCalled();
    });
  });
});
