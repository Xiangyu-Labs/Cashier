export const DETAIL_QUERY_TIMEOUT_MS = 15_000;

export function withQueryTimeout<T>(
  request: Promise<T>,
  timeoutMs = DETAIL_QUERY_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error("DETAIL_QUERY_TIMEOUT"));
    }, timeoutMs);

    request.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
