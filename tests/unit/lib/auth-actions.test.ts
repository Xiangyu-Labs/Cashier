import { describe, it, expect, vi } from 'vitest';
import { withAuth, requireAuth } from '@/lib/auth-actions';
import { UnauthorizedError } from '@/lib/errors';

// Mock next-auth
vi.mock('@/auth', () => ({
  auth: vi.fn()
}));

import { auth } from '@/auth';

describe('withAuth', () => {
  it('should throw UnauthorizedError when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const action = withAuth(async (userId) => userId);

    await expect(action()).rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError when no user id', async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} } as { user: Record<string, never> });

    const action = withAuth(async (userId) => userId);

    await expect(action()).rejects.toThrow(UnauthorizedError);
  });

  it('should pass userId to action when authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-123' }
    } as { user: { id: string } });

    const action = withAuth(async (userId, arg1: string) => {
      return { userId, arg1 };
    });

    const result = await action('test-arg');

    expect(result).toEqual({ userId: 'user-123', arg1: 'test-arg' });
  });

  it('should handle multiple arguments', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-456' }
    } as { user: { id: string } });

    const action = withAuth(async (userId, arg1: string, arg2: number, arg3: boolean) => {
      return { userId, arg1, arg2, arg3 };
    });

    const result = await action('hello', 42, true);

    expect(result).toEqual({ userId: 'user-456', arg1: 'hello', arg2: 42, arg3: true });
  });
});

describe('requireAuth', () => {
  it('should return userId when authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-789' }
    } as { user: { id: string } });

    const result = await requireAuth();

    expect(result).toBe('user-789');
  });

  it('should throw UnauthorizedError when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError when no user id', async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} } as { user: Record<string, never> });

    await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
  });
});
