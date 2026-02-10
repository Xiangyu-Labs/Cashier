"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { SessionProvider } from "next-auth/react";
import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { validateCacheVersion } from "@/lib/cache-version";

// Only persist specific query types (not real-time data)
function shouldPersistQuery(query: { queryKey: readonly unknown[] }) {
  const [queryType] = query.queryKey;
  // Persist: ledger metadata, categories, source documents, currency conversions
  // Don't persist: tasks, processing status (real-time data)
  return [
    'ledger',
    'ledgers',
    'entryCategories',
    'sourceDocuments',
    'batchConvert',
    'convert',
    'summary',
    'enhancedStats',
  ].includes(queryType as string);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 60 * 1000, // 10 minutes (increased from 5 for better caching)
            gcTime: 24 * 60 * 60 * 1000, // 24 hours - cache retention
            refetchOnWindowFocus: false,
            retry: (failureCount, _error) => {
              return failureCount < 3;
            },
          },
        },
      })
  );

  const [persister] = useState(() =>
    typeof window !== 'undefined'
      ? createSyncStoragePersister({
          storage: window.localStorage,
          key: 'cashier-query-cache',
        })
      : undefined
  );

  // Validate cache version on mount
  useEffect(() => {
    validateCacheVersion();
  }, []);

  return (
    <SessionProvider>
      {persister ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            dehydrateOptions: {
              shouldDehydrateQuery: shouldPersistQuery,
            },
          }}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster position="top-center" richColors />
          </ThemeProvider>
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster position="top-center" richColors />
          </ThemeProvider>
        </QueryClientProvider>
      )}
    </SessionProvider>
  );
}


