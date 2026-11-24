'use client';

import { useQuery } from '@tanstack/react-query';
import {
  PORTRAIT_CATALOGUES,
  type Portrait,
  type PortraitCatalogueKey,
} from '@/utils/portrait-catalogue';

export type PortraitLoadStatus = 'loading' | 'ready' | 'error';

async function fetchPortraits(catalogue: PortraitCatalogueKey): Promise<Portrait[]> {
  const response = await fetch(`/api/portraits/${catalogue}`);
  if (!response.ok) throw new Error('Failed to fetch portraits');
  return response.json();
}

export function usePortraitCatalogue(catalogue: PortraitCatalogueKey): {
  portraits: Portrait[];
  status: PortraitLoadStatus;
  retry: () => void;
} {
  const config = PORTRAIT_CATALOGUES[catalogue];
  const query = useQuery({
    queryKey: [config.queryKey],
    queryFn: () => fetchPortraits(catalogue),
    staleTime: 5 * 60 * 1000,
  });

  const status: PortraitLoadStatus = query.isSuccess
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
