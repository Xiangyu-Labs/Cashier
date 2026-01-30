'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { handleEvent } from './invalidation-hub';
import { LedgerEvent } from './types';

export function useLedgerEvents(ledgerId: string) {
    const queryClient = useQueryClient();
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        if (!ledgerId) {
            console.log('[SSE] No ledgerId provided, skipping connection');
            return;
        }

        console.log('[SSE] Creating EventSource connection for ledger:', ledgerId);

        // Create SSE connection
        // Note: EventSource is a browser API
        const es = new EventSource(`/api/ledgers/${ledgerId}/events`);
        eventSourceRef.current = es;

        es.onopen = () => {
            console.log('[SSE] Connection opened');
        };


        es.onmessage = (event) => {
            console.log('[SSE] Received message:', event.data);
            try {
                const data = JSON.parse(event.data) as LedgerEvent;
                console.log('[SSE] Parsed event:', data);
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
    }, [ledgerId, queryClient]);
}
