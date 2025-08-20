import { QueryClient } from '@tanstack/react-query';

// Create a function that returns a new QueryClient for server-side use
export function getQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes - prevents refetching immediately after hydration
        gcTime: 1000 * 60 * 10, // 10 minutes
      },
    },
  });
}