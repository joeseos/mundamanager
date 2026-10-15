'use client'

import { useState, useEffect } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export type UserSearchResult = {
  id: string
  username: string
}

interface UserSearchBarProps {
  placeholder: string
  onSelect: (user: UserSearchResult) => void
  disabled?: boolean
  excludeIds?: string[]
}

const SEARCH_DEBOUNCE_MS = 300

async function searchUsers(query: string, signal: AbortSignal): Promise<UserSearchResult[]> {
  const response = await fetch(`/api/search-users?query=${encodeURIComponent(query)}`, { signal })

  if (!response.ok) {
    throw new Error('Failed to search users')
  }

  return response.json()
}

export default function UserSearchBar({
  placeholder,
  onSelect,
  disabled = false,
  excludeIds = [],
}: UserSearchBarProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const hasSearch = debouncedQuery.trim() !== ''

  useEffect(() => {
    const debounceTimer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(debounceTimer)
  }, [query])

  // Keyed by the search text, so a response that arrives after the text has
  // changed only fills the cache for its own query and never replaces the
  // results shown.
  const { data, isFetching, error } = useQuery({
    queryKey: ['user-search', debouncedQuery],
    queryFn: ({ signal }) => searchUsers(debouncedQuery, signal),
    enabled: hasSearch,
    // Keep showing the last results while the next ones load
    placeholderData: keepPreviousData,
    // The user can just type again, and retries would hold back the error toast
    retry: false,
  })

  useEffect(() => {
    if (!error) return
    console.error('Error searching users:', error)
    toast.error('Failed to search users')
  }, [error])

  // A disabled query still returns the placeholder, so blank text is checked here
  const excludeSet = new Set(excludeIds)
  const searchResults = hasSearch
    ? (data || []).filter((profile) => !excludeSet.has(profile.id))
    : []

  const handleSelect = (user: UserSearchResult) => {
    onSelect(user)
    setQuery('')
    setDebouncedQuery('')
  }

  return (
    <div className="relative">
      <Input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full"
        disabled={disabled}
      />
      {isFetching && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
      {searchResults.length > 0 && query && (
        <div className="absolute mt-1 w-full bg-card rounded-lg border shadow-lg z-10">
          <ul className="py-2">
            {searchResults.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(profile)}
                  className="w-full px-4 py-2 text-left hover:bg-muted"
                  disabled={disabled}
                >
                  <span className="font-medium">{profile.username}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
