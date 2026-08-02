"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QUERY } from "@/lib/constants";
import { ServiceWorkerUpdate } from "@/components/ServiceWorkerUpdate";
import { ConnectionStateProvider } from "@/modules/offline/connection-state";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: QUERY.DEFAULT_STALE_TIME_MS, // 5 minutes
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
            refetchOnMount: true,
            refetchOnReconnect: true,
            retry: (failureCount, error) => shouldRetryQuery(failureCount, error),
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <ConnectionStateProvider>{children}</ConnectionStateProvider>
        <ServiceWorkerUpdate />
        <Toaster position="top-center" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (typeof error !== "object" || error == null) return true;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : null;
  return status == null || status === 408 || status === 429 || status >= 500;
}
