import { Queue } from 'bullmq';
import { getRedisConnection } from './connection';

// Main Queue: CPU-intensive / business logic
let mainQueue: Queue | null = null;
export function getMainQueue(): Queue {
    if (!mainQueue) {
        mainQueue = new Queue('main', {
            connection: getRedisConnection(),
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 500 },
            },
        });
    }
    return mainQueue;
}

// API Queue: IO-intensive / rate-limited external calls
let apiQueue: Queue | null = null;
export function getApiQueue(): Queue {
    if (!apiQueue) {
        apiQueue = new Queue('api', {
            connection: getRedisConnection(),
            defaultJobOptions: {
                attempts: 5,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 500 },
            },
        });
    }
    return apiQueue;
}
