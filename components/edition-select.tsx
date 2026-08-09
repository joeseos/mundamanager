"use client"

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Edition } from '@/types/edition';

interface EditionSelectProps {
  value: string;
  onChange: (editionId: string) => void;
  defaultToCurrent?: boolean;
  label?: string;
}

/**
 * Shared editions query — also used by callers that need to resolve a slug from
 * an edition id.
 *
 * `enabled` is for callers that only need editions on some code paths. Hooks
 * can't be called conditionally, so without it a component that needs editions
 * rarely would still fetch on every mount (e.g. the injury target picker, which
 * needs them only for gang-type targets).
 */
export function useEditions({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<Edition[]>({
    queryKey: ['editions'],
    queryFn: async () => {
      const response = await fetch('/api/editions');
      if (!response.ok) throw new Error('Failed to fetch editions');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/**
 * Resolve an edition id to its slug. Callers gate behaviour on the slug via the
 * predicates in @/types/edition, never on the id itself.
 *
 * A plain function rather than a hook so it also works inside change handlers,
 * which resolve the incoming id rather than the one currently in state.
 */
export const editionSlugOf = (editions: Edition[], editionId?: string | null): string | null =>
  editionId ? editions.find(edition => edition.id === editionId)?.slug ?? null : null;

export function EditionSelect({ value, onChange, defaultToCurrent = false, label = 'Edition' }: EditionSelectProps) {
  const { data: editions = [] } = useEditions();

  // Create/edit forms (defaultToCurrent) must always have an edition: fill the
  // current one whenever value is empty. Filter contexts omit defaultToCurrent
  // so an explicit blank "all editions" selection can stick.
  useEffect(() => {
    if (!defaultToCurrent || value || editions.length === 0) return;
    const current = editions.find(edition => edition.is_current);
    if (current) onChange(current.id);
  }, [defaultToCurrent, value, editions, onChange]);

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border rounded-md"
      >
        {/* Create/edit forms that default to the current edition always need one
            selected; omit the blank option so "All Editions" isn't available. */}
        {!defaultToCurrent && <option value="">Select edition</option>}
        {editions.map((edition) => (
          <option key={edition.id} value={edition.id}>
            {edition.name}
          </option>
        ))}
      </select>
    </div>
  );
}
