'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';

// Singleton state to avoid multiple auth requests
let cachedUser: User | null = null;
let isInitialized = false;
let isLoading = true;
let listeners: Set<() => void> = new Set();
let initPromise: Promise<void> | null = null;

function notifyListeners() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function initializeAuth() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (isInitialized) return;

    const supabase = createClient();

    try {
      const { data } = await supabase.auth.getUser();
      cachedUser = data.user;
    } catch {
      cachedUser = null;
    }

    isInitialized = true;
    isLoading = false;
    notifyListeners();

    // Set up auth state change listener (only once)
    supabase.auth.onAuthStateChange((_event, session) => {
      cachedUser = session?.user ?? null;
      notifyListeners();
    });
  })();

  return initPromise;
}

export function useClientAuth() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const unsubscribe = subscribe(() => forceUpdate({}));
    initializeAuth();
    return unsubscribe;
  }, []);

  // Return current state
  return {
    user: cachedUser,
    isLoading: !isInitialized
  };
}

// For cases where you need to reset (e.g., testing)
export function resetAuthCache() {
  cachedUser = null;
  isInitialized = false;
  isLoading = true;
  initPromise = null;
  listeners.clear();
}
