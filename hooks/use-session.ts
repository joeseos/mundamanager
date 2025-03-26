'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export function useSession() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    
    // Get the current session
    const getSession = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    };
    
    getSession();
    
    // Set up listener for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  return session;
} 