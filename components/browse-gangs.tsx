"use client"

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { EditionToggle } from '@/components/home/edition-toggle'
import { GangCardContent } from '@/components/home/gang-card'
import type { EditionSlug } from '@/types/edition'
import type { PublicGang, PublicGangFilterOption, PublicGangFilters } from '@/app/lib/search-public-gangs'

interface BrowseGangsProps {
  filters: PublicGangFilters;
  gangTypes: PublicGangFilterOption[];
  subtypes: PublicGangFilterOption[];
  gangs: PublicGang[];
  hasMore: boolean;
}

function browseGangsHref(filters: Omit<PublicGangFilters, 'page'>, page = 1): string {
  const params = new URLSearchParams({ edition: filters.edition });
  if (filters.gangTypeId) params.set('type', filters.gangTypeId);
  if (filters.subtypeId) params.set('subtype', filters.subtypeId);
  if (filters.minRating !== null) params.set('minRating', String(filters.minRating));
  if (filters.maxRating !== null) params.set('maxRating', String(filters.maxRating));
  if (page > 1) params.set('page', String(page));
  return `/gangs?${params}`;
}

const ratingInput = (value: string): number | null =>
  value.trim() === '' ? null : Number(value);

export function BrowseGangs({ filters, gangTypes, subtypes, gangs, hasMore }: BrowseGangsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gangTypeId, setGangTypeId] = useState(filters.gangTypeId ?? '');
  const [subtypeId, setSubtypeId] = useState(filters.subtypeId ?? '');
  const [minRating, setMinRating] = useState(filters.minRating?.toString() ?? '');
  const [maxRating, setMaxRating] = useState(filters.maxRating?.toString() ?? '');

  const search = (href: string) => startTransition(() => router.push(href));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    search(browseGangsHref({
      edition: filters.edition,
      gangTypeId: gangTypeId || null,
      subtypeId: subtypeId || null,
      minRating: ratingInput(minRating),
      maxRating: ratingInput(maxRating),
    }));
  };

  // Gang types and subtypes belong to an edition, so switching it starts over
  const handleEditionChange = (edition: EditionSlug) => {
    search(browseGangsHref({ edition, gangTypeId: null, subtypeId: null, minRating: null, maxRating: null }));
  };

  return (
    <div className="bg-card shadow-md rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Browse Gangs</h1>
        <EditionToggle value={filters.edition} onChange={handleEditionChange} />
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
        <div className="col-span-2 md:col-span-1">
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
          <div className="col-span-2 md:col-span-1">
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
        <div>
          <label htmlFor="browse-min-rating" className="text-sm font-medium">Min Rating</label>
          <Input
            id="browse-min-rating"
            type="number"
            inputMode="numeric"
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="browse-max-rating" className="text-sm font-medium">Max Rating</label>
          <Input
            id="browse-max-rating"
            type="number"
            inputMode="numeric"
            value={maxRating}
            onChange={(e) => setMaxRating(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={isPending} className="col-span-2 md:col-span-4">
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

      {(filters.page > 1 || hasMore) && (
        <div className="flex justify-between">
          {filters.page > 1 ? (
            <Button variant="outline" asChild>
              <Link href={browseGangsHref(filters, filters.page - 1)} prefetch={false}>Previous</Link>
            </Button>
          ) : <span />}
          {hasMore && (
            <Button variant="outline" asChild>
              <Link href={browseGangsHref(filters, filters.page + 1)} prefetch={false}>Next</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
