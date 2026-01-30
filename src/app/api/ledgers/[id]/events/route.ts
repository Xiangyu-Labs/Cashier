import { NextRequest } from 'next/server';
import { eventBus } from '@/lib/events/event-bus';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // Use Promise for route params in Next.js 15+
) {
    const { id: ledgerId } = await context.params;

    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();

            // Send initial connection message
            const send = (data: string) => {
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            };

            // Subscribe to event bus
            const unsubscribe = eventBus.subscribe(ledgerId, (event) => {
                send(JSON.stringify(event));
            });

            // Heartbeat to keep connection alive
            const heartbeatInterval = setInterval(() => {
                send(JSON.stringify({ type: 'system:ping', timestamp: Date.now() }));
            }, 30000);

            // Cleanup on connection close
            request.signal.addEventListener('abort', () => {
                unsubscribe();
                clearInterval(heartbeatInterval);
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable buffering for Nginx/Vercel
        },
    });
}
