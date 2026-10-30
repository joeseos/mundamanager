'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import {
  PORTRAIT_CATALOGUES,
  toPortrait,
  type Portrait,
  type PortraitCatalogueKey,
} from '@/utils/portrait-catalogue';

export type PortraitLoadStatus = 'loading' | 'ready' | 'error';

type CampaignTypeJoin = { campaign_type_name: string | null } | { campaign_type_name: string | null }[] | null;

function joinedCampaignTypeName(joined: CampaignTypeJoin): string | null {
  const row = Array.isArray(joined) ? joined[0] : joined;
  const name = row?.campaign_type_name?.trim();
  return name || null;
}

async function fetchPortraits(catalogue: PortraitCatalogueKey): Promise<Portrait[]> {
  const supabase = createClient();

  if (catalogue === 'campaign') {
    const { data, error } = await supabase
      .from('campaign_portraits')
      .select('id, storage_path, credit, group_label, style, label, campaign_type_id, campaign_types(campaign_type_name)')
      .order('storage_path');
    if (error) throw error;
    return (data ?? []).map((row) => {
      const liveName = joinedCampaignTypeName(row.campaign_types);
      return toPortrait({
        ...row,
        group_label: liveName ?? row.group_label,
      });
    });
  }

  const { data, error } = await supabase
    .from('gang_portraits')
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
