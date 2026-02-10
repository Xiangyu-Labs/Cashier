import { describe, it, expect, beforeEach } from 'vitest';
import { taskVersionManager } from '@/lib/task-version';

describe('TaskVersionManager', () => {
  beforeEach(() => {
    // Clear all versions before each test
    // Note: TaskVersionManager doesn't have a public clear method,
    // so we rely on test isolation through unique keys
  });

  describe('acquire', () => {
    it('should return version 1 for first acquisition', () => {
      const key = 'test-key-1';
      const version = taskVersionManager.acquire(key);
      expect(version).toBe(1);
    });

    it('should increment version on subsequent acquisitions', () => {
      const key = 'test-key-2';

      const v1 = taskVersionManager.acquire(key);
      expect(v1).toBe(1);

      const v2 = taskVersionManager.acquire(key);
      expect(v2).toBe(2);

      const v3 = taskVersionManager.acquire(key);
      expect(v3).toBe(3);
    });

    it('should isolate versions by key', () => {
      const key1 = 'test-key-3';
      const key2 = 'test-key-4';

      const v1 = taskVersionManager.acquire(key1);
      const v2 = taskVersionManager.acquire(key2);

      expect(v1).toBe(1);
      expect(v2).toBe(1);

      const v3 = taskVersionManager.acquire(key1);
      expect(v3).toBe(2);

      const v4 = taskVersionManager.acquire(key2);
      expect(v4).toBe(2);
    });
  });

  describe('isValid', () => {
    it('should return true for the latest version', () => {
      const key = 'test-key-5';
      const version = taskVersionManager.acquire(key);

      expect(taskVersionManager.isValid(key, version)).toBe(true);
    });

    it('should return false for superseded versions', () => {
      const key = 'test-key-6';

      const v1 = taskVersionManager.acquire(key);
      const v2 = taskVersionManager.acquire(key);

      // v1 is superseded by v2
      expect(taskVersionManager.isValid(key, v1)).toBe(false);
      expect(taskVersionManager.isValid(key, v2)).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      const key = 'non-existent-key';

      expect(taskVersionManager.isValid(key, 1)).toBe(false);
    });

    it('should handle multiple supersessions correctly', () => {
      const key = 'test-key-7';

      const v1 = taskVersionManager.acquire(key);
      const v2 = taskVersionManager.acquire(key);
      const v3 = taskVersionManager.acquire(key);
      const v4 = taskVersionManager.acquire(key);

      // Only v4 should be valid
      expect(taskVersionManager.isValid(key, v1)).toBe(false);
      expect(taskVersionManager.isValid(key, v2)).toBe(false);
      expect(taskVersionManager.isValid(key, v3)).toBe(false);
      expect(taskVersionManager.isValid(key, v4)).toBe(true);
    });
  });

  describe('release', () => {
    it('should clear version when releasing valid version', () => {
      const key = 'test-key-8';
      const version = taskVersionManager.acquire(key);

      taskVersionManager.release(key, version);

      // After release, the version should no longer be valid
      expect(taskVersionManager.isValid(key, version)).toBe(false);
    });

    it('should not clear version when releasing invalid version', () => {
      const key = 'test-key-9';

      const v1 = taskVersionManager.acquire(key);
      const v2 = taskVersionManager.acquire(key);

      // Try to release v1 (which is superseded)
      taskVersionManager.release(key, v1);

      // v2 should still be valid
      expect(taskVersionManager.isValid(key, v2)).toBe(true);
    });

    it('should handle release of non-existent key gracefully', () => {
      const key = 'non-existent-key';

      // Should not throw
      expect(() => {
        taskVersionManager.release(key, 1);
      }).not.toThrow();
    });
  });

  describe('Concurrency control scenarios', () => {
    it('should prevent stale task from completing', () => {
      const key = 'recalculate:ledger123';

      // Task 1 starts
      const task1Version = taskVersionManager.acquire(key);

      // Task 2 starts (supersedes task 1)
      const task2Version = taskVersionManager.acquire(key);

      // Task 1 tries to complete - should detect it's stale
      const task1IsValid = taskVersionManager.isValid(key, task1Version);
      expect(task1IsValid).toBe(false);

      // Task 2 should still be valid
      const task2IsValid = taskVersionManager.isValid(key, task2Version);
      expect(task2IsValid).toBe(true);
    });

    it('should allow latest task to complete', () => {
      const key = 'recalculate:ledger456';

      // Multiple tasks start in sequence
      taskVersionManager.acquire(key); // v1
      taskVersionManager.acquire(key); // v2
      const latestVersion = taskVersionManager.acquire(key); // v3

      // Only the latest should be valid
      expect(taskVersionManager.isValid(key, latestVersion)).toBe(true);

      // Latest task completes and releases
      taskVersionManager.release(key, latestVersion);

      // After release, no version should be valid
      expect(taskVersionManager.isValid(key, latestVersion)).toBe(false);
    });

    it('should handle rapid successive acquisitions', () => {
      const key = 'rapid-test';
      const versions: number[] = [];

      // Simulate rapid task submissions
      for (let i = 0; i < 10; i++) {
        versions.push(taskVersionManager.acquire(key));
      }

      // Versions should be monotonically increasing
      for (let i = 0; i < versions.length; i++) {
        expect(versions[i]).toBe(i + 1);
      }

      // Only the last version should be valid
      for (let i = 0; i < versions.length - 1; i++) {
        expect(taskVersionManager.isValid(key, versions[i])).toBe(false);
      }
      expect(taskVersionManager.isValid(key, versions[versions.length - 1])).toBe(true);
    });

    it('should isolate different resources', () => {
      const ledger1 = 'recalculate:ledger1';
      const ledger2 = 'recalculate:ledger2';

      const v1 = taskVersionManager.acquire(ledger1);
      const v2 = taskVersionManager.acquire(ledger2);

      // Both should be valid (different resources)
      expect(taskVersionManager.isValid(ledger1, v1)).toBe(true);
      expect(taskVersionManager.isValid(ledger2, v2)).toBe(true);

      // Supersede ledger1
      const v3 = taskVersionManager.acquire(ledger1);

      // ledger1's v1 should be invalid, but ledger2's v2 should still be valid
      expect(taskVersionManager.isValid(ledger1, v1)).toBe(false);
      expect(taskVersionManager.isValid(ledger1, v3)).toBe(true);
      expect(taskVersionManager.isValid(ledger2, v2)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string key', () => {
      const key = '';
      const version = taskVersionManager.acquire(key);
      expect(version).toBe(1);
      expect(taskVersionManager.isValid(key, version)).toBe(true);
    });

    it('should handle very long keys', () => {
      const key = 'a'.repeat(1000);
      const version = taskVersionManager.acquire(key);
      expect(version).toBe(1);
      expect(taskVersionManager.isValid(key, version)).toBe(true);
    });

    it('should handle special characters in keys', () => {
      const key = 'key:with:colons/and/slashes@and@symbols';
      const version = taskVersionManager.acquire(key);
      expect(version).toBe(1);
      expect(taskVersionManager.isValid(key, version)).toBe(true);
    });
  });
});
