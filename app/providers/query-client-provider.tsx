'use client'

import React from 'react'
import { QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

/** How long a query with meta.persist is kept in the browser. Give it this gcTime too, so it stays in the saved cache. */
export const PERSISTED_QUERY_MAX_AGE = 24 * 60 * 60 * 1000

/** The localStorage key of the saved queries, also read by the forum's pre-paint script. */
export const PERSISTED_QUERY_STORAGE_KEY = 'REACT_QUERY_OFFLINE_CACHE'

// Undefined on the server, and where the browser blocks site data (reading localStorage throws)
function browserStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      persist?: boolean
      /**
       * Toasted when a fetch fails, after its retries. It lives on the query, so
       * every useQuery of one key should pass the same message.
       */
      errorMessage?: string
    }
  }
}

export function QueryClientProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (_error, query) => {
            if (query.meta?.errorMessage) toast.error(query.meta.errorMessage)
          },
        }),
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
  const [persister] = React.useState(() => createAsyncStoragePersister({ storage: browserStorage(), key: PERSISTED_QUERY_STORAGE_KEY }))

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
