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

export function EditionSelect({ value, onChange, defaultToCurrent = false, label = 'Edition' }: EditionSelectProps) {
  const { data: editions = [] } = useQuery<Edition[]>({
    queryKey: ['editions'],
    queryFn: async () => {
      const response = await fetch('/api/editions');
      if (!response.ok) throw new Error('Failed to fetch editions');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

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
        <option value="">Select edition</option>
        {editions.map((edition) => (
          <option key={edition.id} value={edition.id}>
            {edition.name}
          </option>
        ))}
      </select>
    </div>
  );
}
