"use client"

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';

type Gang = {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  image_url: string;
  credits: number;
  reputation: number;
  meat: number | null;
  exploration_points: number | null;
  rating: number | null;
  created_at: string;
  last_updated: string;
};

type GangsContextType = {
  gangs: Gang[];
  setGangs: React.Dispatch<React.SetStateAction<Gang[]>>;
  isLoading: boolean;
  error: string | null;
  refreshGangs: () => Promise<void>;
};

const GangsContext = createContext<GangsContextType | undefined>(undefined);

export const useGangs = () => {
  const context = useContext(GangsContext);
  if (!context) {
    throw new Error('useGangs must be used within a GangsProvider');
  }
  return context;
};

interface GangsProviderProps {
  children: ReactNode;
  initialGangs?: Gang[];
}

export const GangsProvider: React.FC<GangsProviderProps> = ({ children, initialGangs = [] }) => {
  const router = useRouter();
  const [gangs, setGangs] = useState<Gang[]>(initialGangs);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  console.log('GangsProvider initialized with', initialGangs.length, 'gangs');

  // Update gangs when initialGangs change (e.g., when server refetches)
  useEffect(() => {
    if (initialGangs.length > 0 && JSON.stringify(gangs) !== JSON.stringify(initialGangs)) {
      console.log('Initial gangs updated, refreshing state with', initialGangs.length, 'gangs');
      setGangs(initialGangs);
    }
  }, [initialGangs]);

  const fetchGangs = async (forceRefresh = false) => {
    console.log('Fetching gangs from client... (force refresh:', forceRefresh, ')');
    
    // Only skip fetch if we have initial gangs, this is first load, and we're not forcing refresh
    if (initialGangs.length > 0 && gangs === initialGangs && !forceRefresh) {
      console.log('Using initial gangs data, skipping fetch');
      return;
    }

    setIsLoading(true);
    
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.error('User not authenticated');
        setError('User not authenticated');
        setIsLoading(false);
        return;
      }
      
      // Use the get_user_gangs RPC endpoint
      const { data: gangsData, error: gangsError } = await supabase
        .rpc('get_user_gangs', {
          user_id: user.id
        });

      if (gangsError) throw gangsError;

      console.log('Fetched gangs data:', gangsData.length, 'gangs');

      setGangs(gangsData);
      setError(null);
    } catch (error) {
      console.error('Error fetching gangs:', error);
      setError('Failed to fetch gangs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch on first load if we don't have initial gangs
    if (initialGangs.length === 0) {
      console.log('No initial gangs, triggering fetch');
      fetchGangs();
    } else {
      console.log('Using initial gangs:', initialGangs.length);
    }
  }, []);

  const refreshGangs = async () => {
    console.log('Refreshing gangs data...');
    
    // First tell Next.js to refresh the current route data from the server
    router.refresh();
    
    // Then immediately fetch new data, forcing a refresh regardless of initialGangs
    await fetchGangs(true);
    
    console.log('Gang refresh complete');
  };

  return (
    <GangsContext.Provider value={{ gangs, setGangs, isLoading, error, refreshGangs }}>
      {children}
    </GangsContext.Provider>
  );
};
