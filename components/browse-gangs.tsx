"use client"

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { Pagination } from '@/components/ui/pagination'
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar'
import { LuX } from 'react-icons/lu'
import { EditionToggle } from '@/components/home/edition-toggle'
import { GangCardContent } from '@/components/home/gang-card'
import type { EditionSlug } from '@/types/edition'
import type { PublicGang, PublicGangFilterOption } from '@/app/lib/search-public-gangs'
import { PUBLIC_GANGS_PAGE_SIZE, browseGangsHref, parseRating, type PublicGangFilters } from '@/utils/browse-gangs-filters'

interface BrowseGangsProps {
  filters: PublicGangFilters;
  /** The filtered user's name, looked up from filters.userId */
  username: string | null;
  gangTypes: PublicGangFilterOption[];
  subtypes: PublicGangFilterOption[];
  gangs: PublicGang[];
  total: number;
}

export function BrowseGangs({ filters, username, gangTypes, subtypes, gangs, total }: BrowseGangsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [user, setUser] = useState<UserSearchResult | null>(
    filters.userId && username ? { id: filters.userId, username } : null
  );
  const [gangTypeId, setGangTypeId] = useState(filters.gangTypeId ?? '');
  const [subtypeId, setSubtypeId] = useState(filters.subtypeId ?? '');
  const [minRating, setMinRating] = useState(filters.minRating?.toString() ?? '');
  const [maxRating, setMaxRating] = useState(filters.maxRating?.toString() ?? '');

  const search = (href: string) => startTransition(() => router.push(href));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    search(browseGangsHref({
      edition: filters.edition,
      userId: user?.id ?? null,
      gangTypeId: gangTypeId || null,
      subtypeId: subtypeId || null,
      minRating: parseRating(minRating),
      maxRating: parseRating(maxRating),
    }));
  };

  // Gang types and subtypes belong to an edition, so switching it clears them
  const handleEditionChange = (edition: EditionSlug) => {
    search(browseGangsHref({ ...filters, edition, gangTypeId: null, subtypeId: null }));
  };

  return (
    <div className="bg-card shadow-md rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Browse Gangs</h1>
        <EditionToggle value={filters.edition} onChange={handleEditionChange} />
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <div className="col-span-2">
          <span className="text-sm font-medium">Username</span>
          {user ? (
            <div className="flex items-center justify-between h-10 px-3 rounded-md border border-input bg-muted text-base md:text-sm">
              <span className="truncate">{user.username}</span>
              <button
                type="button"
                onClick={() => setUser(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear username"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <UserSearchBar placeholder="Any" onSelect={setUser} />
          )}
        </div>
        <div className="col-span-2">
          <label htmlFor="browse-gang-type" className="text-sm font-medium">Gang Type</label>
          <Combobox
            id="browse-gang-type"
            options={gangTypes}
            value={gangTypeId}
            onValueChange={setGangTypeId}
            placeholder="Any"
            clearable
          />
        </div>
        {subtypes.length > 0 && (
          <div className="col-span-2">
            <label htmlFor="browse-gang-subtype" className="text-sm font-medium">Subtype</label>
            <Combobox
              id="browse-gang-subtype"
              options={subtypes}
              value={subtypeId}
              onValueChange={setSubtypeId}
              placeholder="Any"
              clearable
            />
          </div>
        )}
        <div className="md:col-span-3">
          <label htmlFor="browse-min-rating" className="text-sm font-medium">Min Rating</label>
          <Input
            id="browse-min-rating"
            type="number"
            inputMode="numeric"
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <label htmlFor="browse-max-rating" className="text-sm font-medium">Max Rating</label>
          <Input
            id="browse-max-rating"
            type="number"
            inputMode="numeric"
            value={maxRating}
            onChange={(e) => setMaxRating(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={isPending} className="col-span-2 md:col-span-6">
          {isPending ? 'Searching...' : 'Search'}
        </Button>
      </form>

      {gangs.length === 0 ? (
        <p className="text-center text-muted-foreground">No gangs found.</p>
      ) : (
        <ul className="space-y-3">
          {gangs.map(gang => (
            <li key={gang.id}>
              <GangCardContent gang={gang} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        itemLabel="Gangs"
        currentPage={filters.page}
        pageSize={PUBLIC_GANGS_PAGE_SIZE}
        totalItems={total}
        onPageChange={(page) => search(browseGangsHref(filters, page))}
      />
    </div>
  );
}
