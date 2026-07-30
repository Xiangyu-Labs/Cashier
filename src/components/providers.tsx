"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QUERY } from "@/lib/constants";
import { MotionConfig } from "framer-motion";
import { ServiceWorkerUpdate } from "@/components/ServiceWorkerUpdate";
import { ConnectionStateProvider } from "@/modules/offline/connection-state";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: QUERY.DEFAULT_STALE_TIME_MS, // 5 minutes
            gcTime: 24 * 60 * 60 * 1000, // 24 hours - cache retention
            refetchOnWindowFocus: false,
            refetchOnMount: true,
            refetchOnReconnect: true,
            retry: (failureCount, _error) => {
              return failureCount < 3;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ConnectionStateProvider>{children}</ConnectionStateProvider>
          <ServiceWorkerUpdate />
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
