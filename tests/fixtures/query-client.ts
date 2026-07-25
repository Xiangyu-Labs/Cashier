import { QueryClient } from "@tanstack/react-query";

/**
 * Create a QueryClient instance suitable for testing.
 * Uses short stale/gc times to avoid test pollution.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}
