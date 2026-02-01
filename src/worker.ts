import 'dotenv/config';
import { logger } from './lib/logger';
import { initializeWorkers, shutdownWorkers } from './lib/flow/workers';

// Import task handlers to register them
import '@/features/source-document/server/tasks/parse-source-document';

async function start() {
    logger.info('Starting standalone worker process...');

    try {
        await initializeWorkers();
        logger.info('Worker process started successfully');
    } catch (error) {
        logger.error({ error }, 'Failed to start worker process');
        process.exit(1);
    }
}

// Handle graceful shutdown
const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

signals.forEach((signal) => {
    process.on(signal, async () => {
        logger.info(`${signal} received, shutting down...`);
        try {
            await shutdownWorkers();
            logger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error({ error }, 'Error during shutdown');
            process.exit(1);
        }
    });
});

// Start the worker
start();
