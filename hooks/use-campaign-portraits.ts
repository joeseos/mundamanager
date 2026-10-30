'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { toCampaignPortrait, type CampaignPortrait } from '@/utils/campaign-portraits';

export type CampaignPortraitLoadStatus = 'loading' | 'ready' | 'error';

async function fetchCampaignPortraits(): Promise<CampaignPortrait[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('campaign_portraits')
    .select('id, storage_path, credit, group_label, style, label')
    .order('storage_path');

  if (error) throw error;
  return (data ?? []).map(toCampaignPortrait);
}

export function useCampaignPortraits(): {
  portraits: CampaignPortrait[];
  status: CampaignPortraitLoadStatus;
  retry: () => void;
} {
  const query = useQuery({
    queryKey: ['campaign-portraits'],
    queryFn: fetchCampaignPortraits,
    staleTime: 5 * 60 * 1000,
  });

  const status: CampaignPortraitLoadStatus = query.isSuccess
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
