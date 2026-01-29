import { FlowTaskHandler } from './types';

const handlers = new Map<string, FlowTaskHandler<unknown, unknown>>();

export function registerFlowTask<TInput, TOutput>(
    name: string,
    handler: FlowTaskHandler<TInput, TOutput>
): void {
    handlers.set(name, handler as FlowTaskHandler<unknown, unknown>);
}

export function getFlowTaskHandler(name: string): FlowTaskHandler<unknown, unknown> | undefined {
    return handlers.get(name);
}
