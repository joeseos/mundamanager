'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { toGangPortrait, type GangPortrait } from '@/utils/gang-portraits';

export type GangPortraitLoadStatus = 'loading' | 'ready' | 'error';

async function fetchGangPortraits(): Promise<GangPortrait[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('gang_portraits')
    .select('id, storage_path, credit, group_label, style, label')
    .order('storage_path');

  if (error) throw error;
  return (data ?? []).map(toGangPortrait);
}

export function useGangPortraits(): {
  portraits: GangPortrait[];
  status: GangPortraitLoadStatus;
  retry: () => void;
} {
  const query = useQuery({
    queryKey: ['gang-portraits'],
    queryFn: fetchGangPortraits,
    staleTime: 5 * 60 * 1000,
  });

  const status: GangPortraitLoadStatus = query.isSuccess
    ? 'ready'
    : query.isError && !query.isFetching
      ? 'error'
      : 'loading';

  return {
    portraits: query.data ?? [],
    status,
    retry: () => {
      void query.refetch();
    },
  };
}
