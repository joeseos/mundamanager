"use client"

import { useEffect, useRef } from 'react';
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

  // Default only once per mount for create/edit forms. Do NOT re-fire when an
  // existing catalog row with edition_id null clears value — is_current is only
  // a UI default, never an assignment onto stored rows.
  const hasDefaulted = useRef(false);
  useEffect(() => {
    if (hasDefaulted.current || editions.length === 0) return;
    hasDefaulted.current = true;
    if (!defaultToCurrent || value) return;
    const current = editions.find(edition => edition.is_current);
    if (current) onChange(current.id);
  }, [defaultToCurrent, value, editions, onChange]);

  // Filter contexts keep a blank "all editions" choice. Create/edit forms omit
  // it once a value is set; if value is empty (e.g. a legacy null edition_id
  // row), keep the blank option so that null is visible and preservable.
  const showBlankOption = !defaultToCurrent || !value;

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
        {showBlankOption && <option value="">Select edition</option>}
        {editions.map((edition) => (
          <option key={edition.id} value={edition.id}>
            {edition.name}
          </option>
        ))}
      </select>
    </div>
  );
}
