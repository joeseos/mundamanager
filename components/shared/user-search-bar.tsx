'use client'

import { useState, useEffect } from 'react'
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

export default function UserSearchBar({
  placeholder,
  onSelect,
  disabled = false,
  excludeIds = [],
}: UserSearchBarProps) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const excludeKey = excludeIds.join(',')

  useEffect(() => {
    const searchUsers = async () => {
      if (query.trim() === '') {
        setSearchResults([])
        return
      }

      setIsLoading(true)
      try {
        const response = await fetch(`/api/search-users?query=${encodeURIComponent(query)}`)

        if (!response.ok) {
          throw new Error('Failed to search users')
        }

        const profilesData: UserSearchResult[] = await response.json()
        const excludeSet = new Set(excludeKey ? excludeKey.split(',') : [])
        setSearchResults((profilesData || []).filter((profile) => !excludeSet.has(profile.id)))
      } catch (error) {
        console.error('Error searching users:', error)
        setSearchResults([])
        toast.error('Failed to search users')
      } finally {
        setIsLoading(false)
      }
    }

    const debounceTimer = setTimeout(searchUsers, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, excludeKey])

  const handleSelect = (user: UserSearchResult) => {
    onSelect(user)
    setQuery('')
    setSearchResults([])
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
      {isLoading && (
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
