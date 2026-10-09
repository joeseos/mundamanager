'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toGangPortrait, type GangPortrait } from '@/utils/gang-portraits';

export type GangPortraitLoadStatus = 'loading' | 'ready' | 'error';

export function useGangPortraits(): {
  portraits: GangPortrait[];
  status: GangPortraitLoadStatus;
} {
  const [portraits, setPortraits] = useState<GangPortrait[]>([]);
  const [status, setStatus] = useState<GangPortraitLoadStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const loadPortraits = async () => {
      const { data, error } = await supabase
        .from('gang_portraits')
        .select('id, storage_path, credit, group_label, style, label');

      if (cancelled) return;
      if (error) {
        console.error('Error fetching gang portraits:', error);
        setStatus('error');
        return;
      }

      setPortraits((data ?? []).map(toGangPortrait));
      setStatus('ready');
    };

    loadPortraits();
    return () => {
      cancelled = true;
    };
  }, []);

  return { portraits, status };
}
