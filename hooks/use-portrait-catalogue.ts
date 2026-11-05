'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import {
  PORTRAIT_CATALOGUES,
  toCampaignPortrait,
  toPortrait,
  type Portrait,
  type PortraitCatalogueKey,
} from '@/utils/portrait-catalogue';

export type PortraitLoadStatus = 'loading' | 'ready' | 'error';

async function fetchPortraits(catalogue: PortraitCatalogueKey): Promise<Portrait[]> {
  const supabase = createClient();
  const config = PORTRAIT_CATALOGUES[catalogue];

  if (config.requiresCampaignType) {
    const { data, error } = await supabase
      .from(config.table)
      .select('id, storage_path, credit, style, campaign_type_id, campaign_types(campaign_type_name)')
      .order('storage_path');
    if (error) throw error;
    return (data ?? []).map((row) => toCampaignPortrait(row));
  }

  const { data, error } = await supabase
    .from(config.table)
    .select('id, storage_path, credit, group_label, style, label')
    .order('storage_path');
  if (error) throw error;
  return (data ?? []).map((row) => toPortrait(row));
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
