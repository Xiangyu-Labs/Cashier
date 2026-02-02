
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEnhancedStats } from '@/features/stats/server/actions';
import { db } from '@/lib/db';
import * as dateUtils from '@/lib/date-utils';
import { convertAmount, calculateGrowth } from '@/features/stats/server/utils';

// Mock Redis to prevent connection attempts
vi.mock("ioredis", () => {
    const Redis = vi.fn();
    Redis.prototype.publish = vi.fn();
    Redis.prototype.subscribe = vi.fn();
    Redis.prototype.on = vi.fn();
    Redis.prototype.disconnect = vi.fn();
    return { default: Redis, Redis };
});

// Mock connection.ts to prevent using the real IORedis class if it was already loaded
vi.mock("@/lib/flow/connection", () => ({
    getRedisConnection: vi.fn(() => ({
        on: vi.fn(),
        publish: vi.fn(),
        subscribe: vi.fn(),
        disconnect: vi.fn(),
        quit: vi.fn(),
        flushall: vi.fn(),
        duplicate: vi.fn(() => ({
            on: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
        })),
    })),
}));

// Mock dependencies
vi.mock('@/lib/db', () => ({
    db: {
        query: {
            ledgers: {
                findFirst: vi.fn()
            },
            ledgerEntries: {
                findMany: vi.fn()
            },
            currencyRates: {
                findMany: vi.fn()
            }
        }
    }
}));

describe('Stats Utils', () => {
    describe('convertAmount', () => {
        const rates = {
            USD: 1.1, // 1 EUR = 1.1 USD
            CNY: 7.8  // 1 EUR = 7.8 CNY
        };

        it('should return original amount if currencies match', () => {
            const result = convertAmount({
                amount: 100,
                fromCurrency: 'CNY',
                toCurrency: 'CNY',
                rates
            });
            expect(result).toBe(100);
        });

        it('should convert correctly using base currency logic', () => {
            // Convert 110 USD to CNY
            // 110 USD -> 100 EUR -> 780 CNY
            const result = convertAmount({
                amount: 110,
                fromCurrency: 'USD',
                toCurrency: 'CNY',
                rates
            });
            expect(result).toBeCloseTo(780);
        });

        it('should fallback to 1:1 if rates are missing', () => {
            const result = convertAmount({
                amount: 100,
                fromCurrency: 'USD',
                toCurrency: 'CNY',
                rates: null
            });
            expect(result).toBe(100);
        });
    });

    describe('calculateGrowth', () => {
        it('should calculate positive growth', () => {
            const result = calculateGrowth(150, 100);
            expect(result.percent).toBe(50);
            expect(result.amount).toBe(50);
        });

        it('should calculate negative growth (decline)', () => {
            const result = calculateGrowth(80, 100);
            expect(result.percent).toBe(-20);
            expect(result.amount).toBe(-20);
        });

        it('should handle zero previous value', () => {
            const result = calculateGrowth(100, 0);
            expect(result.percent).toBe(100);
        });
    });
});

describe('getEnhancedStats', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should aggregate stats correctly with simplified mocks', async () => {
        // Setup Mocks
        (db.query.ledgers.findFirst as any).mockResolvedValue({
            metadata: { settings: { mainCurrency: 'CNY' } }
        });

        // Mock Entries for Current Month
        const mockCurrentEntries = [
            { id: '1', amount: 100, currency: 'CNY', entryDate: '2023-10-01', categoryId: 'cat1', category: { name: 'Food', icon: 'food' } },
            { id: '2', amount: 10, currency: 'USD', entryDate: '2023-10-02', categoryId: 'cat2', category: { name: 'Transport', icon: 'car' } } // 10 USD -> ~70 CNY
        ];

        // Mock Entries for Previous Month
        const mockPrevEntries = [
            { id: '3', amount: 50, currency: 'CNY', entryDate: '2023-09-01', categoryId: 'cat1', category: { name: 'Food', icon: 'food' } }
        ];

        (db.query.ledgerEntries.findMany as any)
            .mockResolvedValueOnce(mockCurrentEntries) // First call: current
            .mockResolvedValueOnce(mockPrevEntries);   // Second call: prev

        // Mock Rates
        (db.query.currencyRates.findMany as any).mockResolvedValue([
            { date: '2023-10-02', rates: { USD: 1.1, CNY: 8.0 } }
        ]);

        const stats = await getEnhancedStats({
            ledgerId: 'test-ledger',
            queryRange: { from: '2023-10-01', to: '2023-10-31' },
            compareRange: { from: '2023-09-01', to: '2023-09-30' }
        });

        expect(stats.summary.currency).toBe('CNY');
        // Total: 100 + 72.72 = 172.72
        expect(stats.summary.total).toBeCloseTo(172.72, 1);

        // Trend
        // Current 172.72, Prev 50. Growth ~245%
        expect(stats.summary.trend.amount).toBeCloseTo(122.72, 1);

        // Categories
        expect(stats.categories).toHaveLength(2);
        const food = stats.categories.find(c => c.name === 'Food');
        expect(food?.totalConverted).toBe(100);
        expect(food?.trend.percent).toBeCloseTo(100); // 50 -> 100 is 100% growth
    });
});
