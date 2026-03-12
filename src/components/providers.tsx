"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CACHE_VERSION } from "@/lib/cache-version";

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
    'ledgerEntries',
    'batchConvert',
    'convert',
    'summary',
    'enhanced-stats',
  ].includes(queryType as string);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh for 5 minutes
            gcTime: 24 * 60 * 60 * 1000, // 24 hours - cache retention
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Use SSR hydrated data, don't refetch on mount
            refetchOnReconnect: true,
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

  return (
    <SessionProvider>
      {persister ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            buster: String(CACHE_VERSION),
            dehydrateOptions: {
              shouldDehydrateQuery: shouldPersistQuery,
            },
          }}
          onSuccess={() => {
            // After restore from localStorage, mark old queries as stale to trigger background refetch
            // But don't invalidate queries that were just hydrated from SSR (they are fresh)
            const now = Date.now();
            queryClient.getQueryCache().getAll().forEach((query) => {
              if (!shouldPersistQuery(query)) return;
              const dataUpdatedAt = query.state.dataUpdatedAt;
              // Only invalidate if data is older than 1 minute (indicates localStorage restore, not SSR)
              if (dataUpdatedAt && now - dataUpdatedAt > 60 * 1000) {
                query.invalidate();
              }
            });
          }}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster position="top-center" richColors closeButton />
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
            <Toaster position="top-center" richColors closeButton />
          </ThemeProvider>
        </QueryClientProvider>
      )}
    </SessionProvider>
  );
}


