import { LedgerEvent } from './types';
import { EventEmitter } from 'events';

class LedgerEventBus extends EventEmitter {
    private static instance: LedgerEventBus;

    private constructor() {
        super();
        this.setMaxListeners(100); // Allow many connections
    }

    public static getInstance(): LedgerEventBus {
        if (!LedgerEventBus.instance) {
            LedgerEventBus.instance = new LedgerEventBus();
        }
        return LedgerEventBus.instance;
    }

    /**
     * Subscribe to events for a specific ledger
     */
    public subscribe(ledgerId: string, callback: (event: LedgerEvent) => void): () => void {
        const handler = (event: LedgerEvent) => {
            // Filter events: only pass events for this ledger or system pings
            if (event.type === 'system:ping' || ('ledgerId' in event && event.ledgerId === ledgerId)) {
                callback(event);
            }
        };

        this.on('event', handler);

        // Return unsubscribe function
        return () => {
            this.off('event', handler);
        };
    }

    /**
     * Publish an event
     */
    public publish(event: LedgerEvent): void {
        this.emit('event', event);
    }
}

export const eventBus = LedgerEventBus.getInstance();
