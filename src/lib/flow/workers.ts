import { Worker, FlowProducer, WorkerOptions } from 'bullmq';
import { getRedisConnection } from './connection';
import { processJob } from './processor';
import { logger } from '@/lib/logger';

let mainWorker: Worker | null = null;
let apiWorker: Worker | null = null;
let flowProducer: FlowProducer | null = null;

// Configuration getters to ensure environment variables are loaded
const getMainConcurrency = () => parseInt(process.env.FLOW_MAIN_QUEUE_CONCURRENCY || '2', 10) || 2;
const getApiConcurrency = () => parseInt(process.env.FLOW_API_QUEUE_CONCURRENCY || '2', 10) || 2;
const getApiRateMax = () => parseInt(process.env.FLOW_API_QUEUE_RATE_MAX || '10', 10);
const getApiRateDuration = () => parseInt(process.env.FLOW_API_QUEUE_RATE_DURATION || '60000', 10);

// Stalled job detection - prevents zombie tasks after service restart
const getLockDuration = () => parseInt(process.env.BULLMQ_LOCK_DURATION || '120000', 10);     // 2 min default
const getStalledInterval = () => parseInt(process.env.BULLMQ_STALLED_INTERVAL || '30000', 10); // 30s default

export function getMainWorker(): Worker {
    if (!mainWorker) {
        const connection = getRedisConnection();
        const workerOptions: WorkerOptions = {
            connection,
            concurrency: getMainConcurrency(),
            lockDuration: getLockDuration(),
            stalledInterval: getStalledInterval(),
        };
        mainWorker = new Worker('main', processJob, workerOptions);
        logger.info('Main worker initialized');
    }
    return mainWorker;
}

export function getApiWorker(): Worker {
    if (!apiWorker) {
        const connection = getRedisConnection();
        apiWorker = new Worker('api', processJob, {
            connection,
            concurrency: getApiConcurrency(),
            lockDuration: getLockDuration(),
            stalledInterval: getStalledInterval(),
            limiter: {
                max: getApiRateMax(),
                duration: getApiRateDuration(),
            },
        });
        logger.info('API worker initialized');
    }
    return apiWorker;
}

export function getFlowProducer(): FlowProducer {
    if (!flowProducer) {
        const connection = getRedisConnection();
        flowProducer = new FlowProducer({ connection });
    }
    return flowProducer;
}

// Initialize all workers (call this once in instrumentation or worker entrypoint)
export async function initializeWorkers() {
    logger.info('Initializing workers...');
    getMainWorker();
    getApiWorker();
    // Ensure producer is also initialized if needed
    getFlowProducer();
    logger.info('All workers initialized successfully');
}

export async function shutdownWorkers() {
    logger.info('Shutting down workers...');
    const promises = [];
    if (mainWorker) promises.push(mainWorker.close());
    if (apiWorker) promises.push(apiWorker.close());
    if (flowProducer) promises.push(flowProducer.close());

    await Promise.all(promises);
    mainWorker = null;
    apiWorker = null;
    flowProducer = null;
    logger.info('Workers shut down successfully');
}
