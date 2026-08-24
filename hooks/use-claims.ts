'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { extractProfileClaims } from '@/utils/auth';
import type { UserProfileClaims } from '@/types/user-permissions';

interface ClaimsState {
  userId: string | null;
  email: string | null;
  profile: UserProfileClaims | null;
  loading: boolean;
}

export function useClaims(): ClaimsState {
  const [state, setState] = useState<ClaimsState>({
    userId: null,
    email: null,
    profile: null,
    loading: true,
  });

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let mounted = true;

    async function loadClaims() {
      const { data, error } = await supabase.auth.getClaims();
      if (!mounted) return;

      if (error || !data) {
        setState({ userId: null, email: null, profile: null, loading: false });
        return;
      }

      setState({
        userId: data.claims.sub ?? null,
        email: (data.claims.email as string) ?? null,
        profile: extractProfileClaims(data.claims),
        loading: false,
      });
    }

    loadClaims();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setState({ userId: null, email: null, profile: null, loading: false });
          return;
        }

        // Claims live in the JWT, so any other event (sign-in, token refresh,
        // user update) means re-reading them.
        loadClaims();
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
}
