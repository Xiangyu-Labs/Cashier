import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';

// Mock types
type FlowDefinition = import('@/lib/flow/types').FlowDefinition;

describe('Flow Processor', () => {
    const VALID_RUN_ID = '00000000-0000-0000-0000-000000000001';
    const VALID_LEDGER_ID = '00000000-0000-0000-0000-000000000002';
    const OTHER_LEDGER_ID = '00000000-0000-0000-0000-000000000003';

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
            __taskRunId: VALID_RUN_ID,
            __ledgerId: VALID_LEDGER_ID,
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

    let processJob: any;
    let registerFlowTask: any;
    let db: any;
    let workers: any;
    let taskRunService: any;
    let aiContext: any;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        // Setup Mocks before importing modules
        vi.doMock('@/lib/flow/workers', () => ({
            getFlowProducer: vi.fn(() => mockProducer)
        }));
        vi.doMock('@/lib/flow/task-run-service', () => ({
            completeTaskRun: vi.fn(),
            failTaskRun: vi.fn()
        }));
        vi.doMock('@/lib/ai/ai-context', () => ({
            withAIContext: vi.fn((taskId, ledgerId, fn) => fn())
        }));
        vi.doMock('@/lib/logger', () => ({
            logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
        }));

        // Mock DB
        vi.doMock('@/lib/db', () => ({
            db: {
                query: {
                    taskRuns: {
                        findFirst: vi.fn()
                    }
                },
                execute: vi.fn()
            }
        }));

        // Dynamic imports to ensure mocks are applied
        ({ processJob } = await import('@/lib/flow/processor'));
        ({ registerFlowTask } = await import('@/lib/flow/registry'));
        ({ db } = await import('@/lib/db'));
        workers = await import('@/lib/flow/workers');
        taskRunService = await import('@/lib/flow/task-run-service');
        aiContext = await import('@/lib/ai/ai-context');

        // Register the task handler
        registerFlowTask('test-task', mockHandler as any);

        // Default: Mock DB finding the task run
        db.query.taskRuns.findFirst.mockResolvedValue({
            id: VALID_RUN_ID,
            ledgerId: VALID_LEDGER_ID,
            status: 'pending'
        });
    });

    it('should throw Security Error if ledgerId does not match DB record', async () => {
        db.query.taskRuns.findFirst.mockResolvedValue({
            id: VALID_RUN_ID,
            ledgerId: OTHER_LEDGER_ID, // Mismatch
            status: 'pending'
        });

        await expect(processJob(mockJob)).rejects.toThrow(/Security.*LedgerId mismatch/);
        expect(mockHandler.execute).not.toHaveBeenCalled();
    });

    it('should skip execution if task is already completed', async () => {
        db.query.taskRuns.findFirst.mockResolvedValue({
            id: VALID_RUN_ID,
            ledgerId: VALID_LEDGER_ID,
            status: 'completed'
        });

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
                taskRunId: VALID_RUN_ID,
                ledgerId: VALID_LEDGER_ID
            })
        );
        expect(aiContext.withAIContext).toHaveBeenCalledWith(VALID_RUN_ID, VALID_LEDGER_ID, expect.any(Function));
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

        await expect(processJob(mockJob)).rejects.toThrow('bullmq:movedToWaitingChildren');

        expect(mockProducer.add).toHaveBeenCalledTimes(1);
        expect(mockProducer.add).toHaveBeenCalledWith(expect.objectContaining({
            name: 'child-task',
            queueName: 'api',
            data: expect.objectContaining({
                childInput: 123,
                __taskRunId: VALID_RUN_ID,
                __ledgerId: VALID_LEDGER_ID
            })
        }));

        expect(mockJob.updateData).toHaveBeenCalledWith(expect.objectContaining({
            __resuming: true
        }));
        expect(mockJob.moveToWaitingChildren).toHaveBeenCalledWith(mockJob.token);
    });

    it('should handle Fan-in (Resumption) when children complete', async () => {
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
        expect(taskRunService.completeTaskRun).toHaveBeenCalledWith(VALID_RUN_ID, 'done', VALID_LEDGER_ID);
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
        expect(taskRunService.failTaskRun).toHaveBeenCalledWith(VALID_RUN_ID, 'Test Error', VALID_LEDGER_ID);
    });
});
