'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { handleEvent } from '@/lib/events/invalidation-hub';
import { LedgerEvent } from '@/lib/events/types';

export function useLedgerEvents(ledgerId: string, enabled: boolean = true) {
    const queryClient = useQueryClient();
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        if (!ledgerId || !enabled) {
            return;
        }



        // Create SSE connection
        // Note: EventSource is a browser API
        const es = new EventSource(`/api/ledgers/${ledgerId}/events`);
        eventSourceRef.current = es;

        es.onopen = () => {

        };


        es.onmessage = (event) => {

            try {
                const data = JSON.parse(event.data) as LedgerEvent;

                handleEvent(queryClient, data);
            } catch (err) {
                console.error('Failed to parse SSE event:', err);
            }
        };

        es.onerror = (err) => {
            console.warn('SSE connection error, browser will retry automatically:', err);
            // EventSource automatically retries, so usually no need to manually reconnect
            // unless we want exponential backoff matching different logic
        };

        return () => {
            if (es.readyState !== EventSource.CLOSED) {
                es.close();
            }
            eventSourceRef.current = null;
        };
    }, [ledgerId, queryClient, enabled]);
}
