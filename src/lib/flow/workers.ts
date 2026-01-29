import { Worker, FlowProducer, WorkerOptions } from 'bullmq';
import { getRedisConnection } from './connection';
import { processJob } from './processor';

const connection = getRedisConnection();

// Configuration from environment
const mainConcurrency = parseInt(process.env.FLOW_MAIN_QUEUE_CONCURRENCY || '2', 10);
const apiConcurrency = parseInt(process.env.FLOW_API_QUEUE_CONCURRENCY || '2', 10);
const apiRateMax = parseInt(process.env.FLOW_API_QUEUE_RATE_MAX || '10', 10);
const apiRateDuration = parseInt(process.env.FLOW_API_QUEUE_RATE_DURATION || '60000', 10);

const workerOptions: WorkerOptions = {
    connection,
    concurrency: mainConcurrency,
};

// Main Worker: CPU-intensive tasks
export const mainWorker = new Worker('main', processJob, workerOptions);

// API Worker: Rate-limited external API calls
export const apiWorker = new Worker('api', processJob, {
    connection,
    concurrency: apiConcurrency,
    limiter: {
        max: apiRateMax,
        duration: apiRateDuration,
    },
});

// Flow Producer for creating parent-child task trees
export const flowProducer = new FlowProducer({ connection });
