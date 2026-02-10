import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, getRemainingAttempts } from '@/features/auth/server/services/rate-limit';
import { memoryStore } from '@/lib/memory-store';

describe('Auth Rate Limiting', () => {
  beforeEach(async () => {
    // Clear all rate limit keys before each test
    await memoryStore.flushall();
  });

  describe('checkRateLimit', () => {
    it('should allow first 5 attempts within 60 seconds', async () => {
      const identifier = 'test@example.com';

      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit(identifier);
        expect(result).toBe(true);
      }
    });

    it('should block 6th attempt', async () => {
      const identifier = 'test@example.com';

      // Use up 5 attempts
      for (let i = 0; i < 5; i++) {
        await checkRateLimit(identifier);
      }

      // 6th attempt should be blocked
      const result = await checkRateLimit(identifier);
      expect(result).toBe(false);
    });

    it('should work with IP addresses', async () => {
      const ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit(ip);
        expect(result).toBe(true);
      }

      const result = await checkRateLimit(ip);
      expect(result).toBe(false);
    });

    it('should isolate rate limits between different identifiers', async () => {
      const id1 = 'user1@example.com';
      const id2 = 'user2@example.com';

      // Use up id1's attempts
      for (let i = 0; i < 5; i++) {
        await checkRateLimit(id1);
      }

      // id1 should be blocked
      expect(await checkRateLimit(id1)).toBe(false);

      // id2 should still have full attempts
      expect(await checkRateLimit(id2)).toBe(true);
    });

    it('should fail open on error', async () => {
      const originalIncr = memoryStore.incr;
      memoryStore.incr = vi.fn().mockRejectedValue(new Error('Store error'));

      const result = await checkRateLimit('test@example.com');
      expect(result).toBe(true); // Fail open

      memoryStore.incr = originalIncr;
    });
  });

  describe('getRemainingAttempts', () => {
    it('should return max attempts when no attempts made', async () => {
      const identifier = 'test@example.com';

      const remaining = await getRemainingAttempts(identifier);
      expect(remaining).toBe(5); // Default MAX_ATTEMPTS
    });

    it('should return correct remaining attempts', async () => {
      const identifier = 'test@example.com';

      await checkRateLimit(identifier);
      expect(await getRemainingAttempts(identifier)).toBe(4);

      await checkRateLimit(identifier);
      expect(await getRemainingAttempts(identifier)).toBe(3);

      await checkRateLimit(identifier);
      expect(await getRemainingAttempts(identifier)).toBe(2);
    });

    it('should return 0 when all attempts used', async () => {
      const identifier = 'test@example.com';

      for (let i = 0; i < 5; i++) {
        await checkRateLimit(identifier);
      }

      const remaining = await getRemainingAttempts(identifier);
      expect(remaining).toBe(0);
    });

    it('should not return negative values', async () => {
      const identifier = 'test@example.com';

      // Use up all attempts and try more
      for (let i = 0; i < 10; i++) {
        await checkRateLimit(identifier);
      }

      const remaining = await getRemainingAttempts(identifier);
      expect(remaining).toBe(0);
      expect(remaining).toBeGreaterThanOrEqual(0);
    });

    it('should fail open on error', async () => {
      const originalGet = memoryStore.get;
      memoryStore.get = vi.fn().mockRejectedValue(new Error('Store error'));

      const remaining = await getRemainingAttempts('test@example.com');
      expect(remaining).toBe(5); // Default MAX_ATTEMPTS

      memoryStore.get = originalGet;
    });
  });
});
