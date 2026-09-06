type TraversalHandler = (event: PopStateEvent) => void;

let activeHandler: TraversalHandler | null = null;

export function registerLedgerHistoryTraversal(handler: TraversalHandler): () => void {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function handleLedgerHistoryTraversal(event: PopStateEvent): void {
  activeHandler?.(event);
}
