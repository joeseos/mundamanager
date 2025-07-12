'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export function useSession() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    const supabase = createClient();

    // Get the current session
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
    };

    getSession();

    // Set up listener for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return session;
}
