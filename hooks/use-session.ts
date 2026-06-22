'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { extractCustomClaims } from '@/utils/auth';
import type { UserProfileClaims, CampaignRoleClaim } from '@/types/user-permissions';

interface ClaimsState {
  userId: string | null;
  email: string | null;
  profile: UserProfileClaims | null;
  campaignRoles: CampaignRoleClaim[];
  loading: boolean;
}

export function useClaims(): ClaimsState {
  const [state, setState] = useState<ClaimsState>({
    userId: null,
    email: null,
    profile: null,
    campaignRoles: [],
    loading: true,
  });

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let mounted = true;

    async function loadClaims() {
      const { data, error } = await supabase.auth.getClaims();
      if (!mounted) return;

      if (error || !data) {
        setState({ userId: null, email: null, profile: null, campaignRoles: [], loading: false });
        return;
      }

      const claims = extractCustomClaims(data.claims);
      setState({
        userId: data.claims.sub ?? null,
        email: (data.claims.email as string) ?? null,
        profile: claims.profile,
        campaignRoles: claims.campaignRoles,
        loading: false,
      });
    }

    loadClaims();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        if (!session) {
          setState({ userId: null, email: null, profile: null, campaignRoles: [], loading: false });
          return;
        }

        const { data, error } = await supabase.auth.getClaims();
        if (!mounted) return;

        if (error || !data) {
          setState({ userId: null, email: null, profile: null, campaignRoles: [], loading: false });
          return;
        }

        const claims = extractCustomClaims(data.claims);
        setState({
          userId: data.claims.sub ?? null,
          email: (data.claims.email as string) ?? null,
          profile: claims.profile,
          campaignRoles: claims.campaignRoles,
          loading: false,
        });
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
} 