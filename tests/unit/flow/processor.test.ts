import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Job } from 'bullmq';
import { FlowDefinition } from '@/lib/flow/types';

// Mock dependencies with factories to ensure they are available
vi.mock('@/lib/flow/registry', () => ({
    getFlowTaskHandler: vi.fn(),
    registerFlowTask: vi.fn()
}));

vi.mock('@/lib/db', () => ({
    db: {
        query: {
            taskRuns: {
                findFirst: vi.fn()
            }
        }
    }
}));

vi.mock('@/lib/flow/workers', () => ({
    getFlowProducer: vi.fn()
}));

vi.mock('@/lib/flow/task-run-service', () => ({
    completeTaskRun: vi.fn(),
    failTaskRun: vi.fn()
}));

vi.mock('@/lib/ai/ai-context', () => ({
    withAIContext: vi.fn((taskId, ledgerId, fn) => fn())
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }
}));

// Import after mocks
import { processJob } from '@/lib/flow/processor';
import { getFlowTaskHandler } from '@/lib/flow/registry';
import { db } from '@/lib/db';
import { getFlowProducer } from '@/lib/flow/workers';
import { completeTaskRun, failTaskRun } from '@/lib/flow/task-run-service';
import { withAIContext } from '@/lib/ai/ai-context';

describe('Flow Processor', () => {
    const mockHandler = {
        execute: vi.fn(),
        validate: vi.fn(),
        onChildrenCompleted: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn()
    };

    const mockJob = {
        id: 'job-123',
        name: 'test-task',
        data: {
            __taskRunId: 'run-123',
            __ledgerId: 'ledger-123',
            someInput: 'value'
        },
        queueQualifiedName: 'queue-1',
        token: 'token-1',
        updateProgress: vi.fn(),
        getState: vi.fn().mockResolvedValue('active'),
        getChildrenValues: vi.fn().mockResolvedValue({}),
        updateData: vi.fn(),
        moveToWaitingChildren: vi.fn(),
        parent: undefined
    } as unknown as Job;

    const mockProducer = {
        add: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default mocks
        vi.mocked(getFlowTaskHandler).mockReturnValue(mockHandler as any);
        vi.mocked(getFlowProducer).mockReturnValue(mockProducer as any);

        // Default DB response: Valid task run
        vi.mocked(db.query.taskRuns.findFirst).mockResolvedValue({
            ledgerId: 'ledger-123',
            status: 'pending'
        } as any);
    });

    it('should throw Security Error if ledgerId does not match DB record', async () => {
        // Setup mismatch
        vi.mocked(db.query.taskRuns.findFirst).mockResolvedValue({
            ledgerId: 'DIFFERENT-LEDGER',
            status: 'pending'
        } as any);

        await expect(processJob(mockJob)).rejects.toThrow(/Security.*LedgerId mismatch/);

        expect(mockHandler.execute).not.toHaveBeenCalled();
    });

    it('should skip execution if task is already completed', async () => {
        vi.mocked(db.query.taskRuns.findFirst).mockResolvedValue({
            ledgerId: 'ledger-123',
            status: 'completed'
        } as any);

        await processJob(mockJob);

        expect(mockHandler.execute).not.toHaveBeenCalled();
    });

    it('should execute handler with correct context for valid task', async () => {
        const expectedResult = { output: 'success' };
        mockHandler.execute.mockResolvedValue(expectedResult);

        const result = await processJob(mockJob);

        expect(result).toEqual(expectedResult);
        expect(mockHandler.validate).toHaveBeenCalled();
        expect(mockHandler.execute).toHaveBeenCalledWith(
            mockJob.data,
            expect.objectContaining({
                jobId: mockJob.id,
                taskRunId: 'run-123',
                ledgerId: 'ledger-123'
            })
        );
        expect(withAIContext).toHaveBeenCalledWith('run-123', 'ledger-123', expect.any(Function));
    });

    it('should handle Fan-out (sub-tasks) correctly', async () => {
        const flowDefinition: FlowDefinition = {
            name: 'parent-task',
            title: 'Parent Task',
            queueName: 'main',
            data: {},
            children: [
                {
                    name: 'child-task',
                    title: 'Child Task',
                    queueName: 'api',
                    data: { childInput: 123 }
                }
            ]
        };

        mockHandler.execute.mockResolvedValue(flowDefinition);

        await processJob(mockJob);

        // Verify children added to queue
        expect(mockProducer.add).toHaveBeenCalledTimes(1);
        expect(mockProducer.add).toHaveBeenCalledWith(expect.objectContaining({
            name: 'child-task',
            queueName: 'api',
            data: expect.objectContaining({
                childInput: 123,
                __taskRunId: 'run-123',
                __ledgerId: 'ledger-123'
            }),
            opts: expect.objectContaining({
                parent: {
                    id: mockJob.id,
                    queue: mockJob.queueQualifiedName
                }
            })
        }));

        // Verify job suspension
        expect(mockJob.updateData).toHaveBeenCalledWith(expect.objectContaining({
            __resuming: true
        }));
        expect(mockJob.moveToWaitingChildren).toHaveBeenCalledWith(mockJob.token);
    });

    it('should handle Fan-in (Resumption) when children complete', async () => {
        // Setup resuming job
        const resumingJob = {
            ...mockJob,
            data: {
                ...mockJob.data,
                __resuming: true
            }
        } as unknown as Job;

        const childrenResults = { 'child-job-1': 'result1', 'child-job-2': 'result2' };
        (resumingJob.getChildrenValues as any).mockResolvedValue(childrenResults);

        mockHandler.onChildrenCompleted.mockResolvedValue('final-result');

        const result = await processJob(resumingJob);

        expect(result).toBe('final-result');
        expect(mockHandler.execute).not.toHaveBeenCalled();
        expect(mockHandler.onChildrenCompleted).toHaveBeenCalledWith(
            ['result1', 'result2'],
            expect.any(Object)
        );
    });

    it('should complete task run for root jobs', async () => {
        mockHandler.execute.mockResolvedValue('done');

        await processJob(mockJob);

        expect(mockHandler.onComplete).toHaveBeenCalled();
        expect(completeTaskRun).toHaveBeenCalledWith('run-123', 'done', 'ledger-123');
    });

    it('should handle errors and fail task run', async () => {
        const error = new Error('Test Error');
        mockHandler.execute.mockRejectedValue(error);

        await expect(processJob(mockJob)).rejects.toThrow('Test Error');

        expect(mockHandler.onError).toHaveBeenCalledWith(
            error,
            mockJob.data,
            expect.any(Object)
        );
        expect(failTaskRun).toHaveBeenCalledWith('run-123', 'Test Error', 'ledger-123');
    });
});
