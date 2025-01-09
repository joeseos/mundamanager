"use client"

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { createClient } from "@/utils/supabase/client";

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

export const GangsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [gangs, setGangs] = useState<Gang[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGangs = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error('User not authenticated');
      setError('User not authenticated');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // Use the get_user_gangs RPC endpoint with correct parameter name
      const { data: gangsData, error: gangsError } = await supabase
        .rpc('get_user_gangs', {
          user_id: user.id
        });

      if (gangsError) throw gangsError;

      console.log('Gangs from RPC:', gangsData);

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
    fetchGangs();
  }, []);

  const refreshGangs = async () => {
    await fetchGangs();
  };

  return (
    <GangsContext.Provider value={{ gangs, setGangs, isLoading, error, refreshGangs }}>
      {children}
    </GangsContext.Provider>
  );
};
