/**
 * Unified Cache Configuration
 * 
 * Centralized configuration for Next.js unstable_cache.
 * This ensures consistent caching behavior across all server-side data fetching.
 */

export const cacheConfig = {
    /** Ledger data: moderately static, revalidate every 60s */
    ledger: {
        revalidate: 60,
        tags: (ledgerId: string) => [`ledger:${ledgerId}`],
    },
    /** Categories: rarely change, revalidate every 5 minutes */
    categories: {
        revalidate: 300,
        tags: (ledgerId: string) => [`categories:${ledgerId}`],
    },
    /** User's ledger list: revalidate every 60s */
    ledgerList: {
        revalidate: 60,
        tags: (userId: string) => [`ledger-list:${userId}`],
    },
} as const;

/**
 * Helper to invalidate cache tags via revalidateTag
 */
export const cacheTags = {
    ledger: (ledgerId: string) => `ledger:${ledgerId}`,
    categories: (ledgerId: string) => `categories:${ledgerId}`,
    ledgerList: (userId: string) => `ledger-list:${userId}`,
};
