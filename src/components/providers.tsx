"use client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QUERY } from "@/lib/constants";
import { ServiceWorkerUpdate } from "@/components/ServiceWorkerUpdate";
import { clearUserImageCacheDataSafely } from "@/lib/client-cache";

export function Providers({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (getErrorStatus(error) === 401 && typeof window !== "undefined") {
              window.dispatchEvent(new Event("cashier:auth-session-expired"));
            }
          },
        }),
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

  useEffect(() => {
    const clearCurrentUserCache = () =>
      void clearUserImageCacheDataSafely(
        userId,
        userId == null ? {} : { userId },
        "Failed to clear image cache after session expiry"
      );

    const onSessionExpired = clearCurrentUserCache;
    window.addEventListener("cashier:auth-session-expired", onSessionExpired);
    return () => {
      window.removeEventListener("cashier:auth-session-expired", onSessionExpired);
    };
  }, [userId]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        <ServiceWorkerUpdate />
        <Toaster position="top-center" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error == null) return null;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  return null;
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
