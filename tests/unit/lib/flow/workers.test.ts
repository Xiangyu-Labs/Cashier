import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ before importing workers
const mockWorker = vi.fn();
vi.mock('bullmq', () => ({
    Worker: mockWorker,
    Queue: vi.fn(),
    FlowProducer: vi.fn(),
}));

// Mock connection
vi.mock('./connection', () => ({
    getRedisConnection: vi.fn(() => ({})),
}));

// Mock processor
vi.mock('./processor', () => ({
    processJob: vi.fn(),
}));

describe('BullMQ Workers Configuration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('should initialize Worker with environment variables', async () => {
        process.env.BULLMQ_LOCK_DURATION = '50000';
        process.env.BULLMQ_STALLED_INTERVAL = '15000';
        process.env.FLOW_MAIN_QUEUE_CONCURRENCY = '5';

        // Re-import to trigger initialization with new env vars
        const { initializeWorkers } = await import('@/lib/flow/workers');
        await initializeWorkers();

        expect(mockWorker).toHaveBeenCalled();

        // Find the main worker call
        const mainWorkerCall = mockWorker.mock.calls.find(call => call[0] === 'main');
        expect(mainWorkerCall).toBeDefined();

        const options = mainWorkerCall![2];
        expect(options.lockDuration).toBe(50000);
        expect(options.stalledInterval).toBe(15000);
        expect(options.concurrency).toBe(5);
    });

    it('should use default values when environment variables are missing', async () => {
        delete process.env.BULLMQ_LOCK_DURATION;
        delete process.env.BULLMQ_STALLED_INTERVAL;

        const { initializeWorkers } = await import('@/lib/flow/workers');
        await initializeWorkers();

        const mainWorkerCall = mockWorker.mock.calls.find(call => call[0] === 'main');
        const options = mainWorkerCall![2];

        // Default values from code
        expect(options.lockDuration).toBe(120000);
        expect(options.stalledInterval).toBe(30000);
    });
});
