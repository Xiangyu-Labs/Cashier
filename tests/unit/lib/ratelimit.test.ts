import { describe, it, expect, beforeEach } from 'vitest';
import {
  rateLimitShareAccess,
  rateLimitApiV1,
  rateLimit,
  RateLimitConfig,
} from '@/lib/ratelimit';
import { memoryStore } from '@/lib/memory-store';

describe('MemoryRateLimiter', () => {
  beforeEach(async () => {
    // Clear all rate limit keys before each test
    await memoryStore.flushall();
  });

  describe('rateLimitShareAccess', () => {
    it('should allow first 10 requests within 10 seconds', async () => {
      const shareId = 'share123';
      const ip = '192.168.1.1';

      for (let i = 0; i < 10; i++) {
        const result = await rateLimitShareAccess(shareId, ip);
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(10 - i - 1);
        expect(result.resetTime).toBeGreaterThan(Date.now());
      }
    });

    it('should block 11th request', async () => {
      const shareId = 'share123';
      const ip = '192.168.1.1';

      // Use up 10 requests
      for (let i = 0; i < 10; i++) {
        await rateLimitShareAccess(shareId, ip);
      }

      // 11th request should be blocked
      const result = await rateLimitShareAccess(shareId, ip);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it('should isolate rate limits by shareId and IP', async () => {
      const shareId1 = 'share123';
      const shareId2 = 'share456';
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      // Use up share1 + ip1
      for (let i = 0; i < 10; i++) {
        await rateLimitShareAccess(shareId1, ip1);
      }

      // share1 + ip1 should be blocked
      expect((await rateLimitShareAccess(shareId1, ip1)).success).toBe(false);

      // share1 + ip2 should still work
      expect((await rateLimitShareAccess(shareId1, ip2)).success).toBe(true);

      // share2 + ip1 should still work
      expect((await rateLimitShareAccess(shareId2, ip1)).success).toBe(true);
    });

    it('should use correct config (10 requests per 10 seconds)', async () => {
      expect(RateLimitConfig.SHARE_ACCESS.limit).toBe(10);
      expect(RateLimitConfig.SHARE_ACCESS.windowMs).toBe(10 * 1000);
    });
  });

  describe('rateLimitApiV1', () => {
    it('should allow first 100 requests within 1 minute', async () => {
      const apiKey = 'test-api-key-123';

      for (let i = 0; i < 100; i++) {
        const result = await rateLimitApiV1(apiKey);
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(100 - i - 1);
      }
    });

    it('should block 101st request', async () => {
      const apiKey = 'test-api-key-123';

      // Use up 100 requests
      for (let i = 0; i < 100; i++) {
        await rateLimitApiV1(apiKey);
      }

      // 101st request should be blocked
      const result = await rateLimitApiV1(apiKey);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should isolate rate limits by API key', async () => {
      const apiKey1 = 'key1';
      const apiKey2 = 'key2';

      // Use up key1
      for (let i = 0; i < 100; i++) {
        await rateLimitApiV1(apiKey1);
      }

      // key1 should be blocked
      expect((await rateLimitApiV1(apiKey1)).success).toBe(false);

      // key2 should still work
      expect((await rateLimitApiV1(apiKey2)).success).toBe(true);
    });

    it('should use correct config (100 requests per minute)', async () => {
      expect(RateLimitConfig.API_V1.limit).toBe(100);
      expect(RateLimitConfig.API_V1.windowMs).toBe(60 * 1000);
    });
  });

  describe('rateLimit (generic)', () => {
    it('should enforce custom limit and window', async () => {
      const identifier = 'custom-key';
      const limit = 5;
      const windowMs = 1000;

      for (let i = 0; i < limit; i++) {
        const result = await rateLimit(identifier, limit, windowMs);
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(limit - i - 1);
      }

      // Next request should be blocked
      const result = await rateLimit(identifier, limit, windowMs);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should calculate resetTime correctly', async () => {
      const identifier = 'test-key';
      const windowMs = 5000; // 5 seconds
      const before = Date.now();

      const result = await rateLimit(identifier, 10, windowMs);

      expect(result.resetTime).toBeGreaterThan(before);
      expect(result.resetTime).toBeLessThanOrEqual(before + windowMs + 1000); // Allow 1s tolerance
    });

    it('should handle multiple identifiers independently', async () => {
      const id1 = 'user1';
      const id2 = 'user2';
      const limit = 3;
      const windowMs = 1000;

      // Use up id1
      for (let i = 0; i < limit; i++) {
        await rateLimit(id1, limit, windowMs);
      }

      // id1 should be blocked
      expect((await rateLimit(id1, limit, windowMs)).success).toBe(false);

      // id2 should still work
      expect((await rateLimit(id2, limit, windowMs)).success).toBe(true);
    });
  });

  describe('Fixed Window algorithm behavior', () => {
    it('should reset counter after window expires', async () => {
      const identifier = 'test-key';
      const limit = 2;
      const windowMs = 100; // Very short window for testing

      // Use up limit
      await rateLimit(identifier, limit, windowMs);
      await rateLimit(identifier, limit, windowMs);

      // Should be blocked
      expect((await rateLimit(identifier, limit, windowMs)).success).toBe(false);

      // Wait for window to expire (add extra buffer for TTL expiration)
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Should work again
      const result = await rateLimit(identifier, limit, windowMs);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(limit - 1);
    });

    it('should maintain remaining count correctly', async () => {
      const identifier = 'test-key';
      const limit = 5;
      const windowMs = 1000;

      const r1 = await rateLimit(identifier, limit, windowMs);
      expect(r1.remaining).toBe(4);

      const r2 = await rateLimit(identifier, limit, windowMs);
      expect(r2.remaining).toBe(3);

      const r3 = await rateLimit(identifier, limit, windowMs);
      expect(r3.remaining).toBe(2);
    });

    it('should never return negative remaining', async () => {
      const identifier = 'test-key';
      const limit = 2;
      const windowMs = 1000;

      // Exceed limit
      await rateLimit(identifier, limit, windowMs);
      await rateLimit(identifier, limit, windowMs);
      const r1 = await rateLimit(identifier, limit, windowMs);
      const r2 = await rateLimit(identifier, limit, windowMs);

      expect(r1.remaining).toBe(0);
      expect(r2.remaining).toBe(0);
      expect(r1.remaining).toBeGreaterThanOrEqual(0);
      expect(r2.remaining).toBeGreaterThanOrEqual(0);
    });
  });
});
