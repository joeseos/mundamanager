'use client'

import React from 'react'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

/** How long a query with meta.persist is kept in the browser. Give it this gcTime too, so it stays in the saved cache. */
export const PERSISTED_QUERY_MAX_AGE = 24 * 60 * 60 * 1000

export function QueryClientProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Without a default staleTime, every mounted query refetches on
            // window focus/remount, multiplying API and Supabase load.
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )
  const [persister] = React.useState(() =>
    createAsyncStoragePersister({ storage: typeof window === 'undefined' ? undefined : window.localStorage })
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSISTED_QUERY_MAX_AGE,
        // Only queries that opt in are saved in the browser
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.meta?.persist === true && query.state.status === 'success',
        },
      }}
    >
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </PersistQueryClientProvider>
  )
}
