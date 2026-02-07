"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { SessionProvider } from "next-auth/react";
import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";

// Create persister only on client side
const createPersister = () => {
  if (typeof window === "undefined") return null;

  return createSyncStoragePersister({
    storage: window.localStorage,
    key: "cashier-query-cache",
  });
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [persister, setPersister] = useState<ReturnType<typeof createSyncStoragePersister> | null>(null);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
            gcTime: 24 * 60 * 60 * 1000, // 24 hours - cache retention
            refetchOnWindowFocus: false,
            retry: (failureCount, _error) => {
              return failureCount < 3;
            },
          },
        },
      })
  );

  // Initialize persister on client side only
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Client-side only initialization to avoid SSR hydration mismatch
    setPersister(createPersister());
  }, []);

  const content = (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );

  // Use PersistQueryClientProvider only when persister is ready
  const queryProvider = persister ? (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: persister,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours max cache age
        buster: "v1", // Change this to invalidate all caches on deploy
      }}
    >
      {content}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={queryClient}>
      {content}
    </QueryClientProvider>
  );

  return (
    <SessionProvider>
      {queryProvider}
    </SessionProvider>
  );
}


