import { Queue } from 'bullmq';
import { getRedisConnection } from './connection';

// Main Queue: CPU-intensive / business logic
export const mainQueue = new Queue('main', {
    connection: getRedisConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
    },
});

// API Queue: IO-intensive / rate-limited external calls
export const apiQueue = new Queue('api', {
    connection: getRedisConnection(),
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
    },
});
