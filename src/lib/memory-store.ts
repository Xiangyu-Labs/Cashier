
/**
 * Simple in-memory Key-Value store with TTL support.
 * Replaces Redis for rate limiting and simple caching.
 */

interface StoreItem {
    value: string;
    expiresAt: number | null; // Unix timestamp in milliseconds
}

class MemoryStore {
    private store = new Map<string, StoreItem>();

    /**
     * Increment a key's value by 1.
     * If key doesn't exist, sets it to 1.
     * @returns The new value
     */
    async incr(key: string): Promise<number> {
        this.cleanup(key);
        const item = this.store.get(key);
        let val = 1;
        if (item) {
            val = parseInt(item.value) + 1;
        }

        // Preserve existing expiry if it exists, otherwise no expiry
        const expiresAt = item ? item.expiresAt : null;

        this.store.set(key, {
            value: val.toString(),
            expiresAt
        });

        return val;
    }

    /**
     * Atomically increment a key and set its expiration.
     * This prevents race conditions between incr and expire operations.
     * @param key - The key to increment
     * @param seconds - TTL in seconds
     * @returns The new value
     */
    async incrAndExpire(key: string, seconds: number): Promise<number> {
        this.cleanup(key);
        const item = this.store.get(key);
        let val = 1;

        if (item && item.expiresAt !== null && Date.now() < item.expiresAt) {
            // Key exists and is not expired - increment and preserve existing expiry
            val = parseInt(item.value) + 1;
            this.store.set(key, {
                value: val.toString(),
                expiresAt: item.expiresAt
            });
        } else {
            // Key doesn't exist or is expired - set to 1 with new expiry
            const expiresAt = Date.now() + (seconds * 1000);
            this.store.set(key, {
                value: val.toString(),
                expiresAt
            });
        }

        return val;
    }

    /**
     * Set a key's value with an expiration in seconds.
     */
    async setex(key: string, seconds: number, value: string): Promise<void> {
        this.store.set(key, {
            value: value,
            expiresAt: Date.now() + (seconds * 1000)
        });
    }

    /**
     * Get a value. Returns null if not found or expired.
     */
    async get(key: string): Promise<string | null> {
        this.cleanup(key);
        const item = this.store.get(key);
        return item ? item.value : null;
    }

    /**
     * Set expiration for a key in seconds.
     */
    async expire(key: string, seconds: number): Promise<void> {
        const item = this.store.get(key);
        if (item) {
            item.expiresAt = Date.now() + (seconds * 1000);
            this.store.set(key, item);
        }
    }

    /**
     * Get remaining time to live in seconds.
     * Returns -2 if key doesn't exist.
     * Returns -1 if key exists but has no expiry.
     */
    async ttl(key: string): Promise<number> {
        this.cleanup(key);
        const item = this.store.get(key);

        if (!item) return -2;
        if (item.expiresAt === null) return -1;

        const now = Date.now();
        if (now >= item.expiresAt) {
            this.store.delete(key);
            return -2;
        }

        return Math.ceil((item.expiresAt - now) / 1000);
    }

    /**
     * Remove expired keys (Lazy expiration specific to a key).
     * Note: We don't run a background loop to clean up everything to avoid keeping the process alive,
     * so memory is cleaned up on access.
     */
    private cleanup(key: string) {
        const item = this.store.get(key);
        if (item && item.expiresAt !== null && Date.now() >= item.expiresAt) {
            this.store.delete(key);
        }
    }

    /**
     * Clear all data (Testing support)
     */
    async flushall() {
        this.store.clear();
    }
}

// Create a singleton instance
export const memoryStore = new MemoryStore();
