"use client";

export function safePrefetch(promise: Promise<unknown>, errorCode: string): void {
  void promise.catch(() => {
    console.warn(`[cashier:${errorCode}] Background prefetch failed`);
  });
}
