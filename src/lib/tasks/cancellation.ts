export class TaskCancelledError extends Error {
  constructor(message: string = "Task cancelled") {
    super(message);
    this.name = "TaskCancelledError";
  }
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TaskCancelledError();
  }
}
