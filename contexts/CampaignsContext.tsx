"use client"

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { createClient } from "@/utils/supabase/client";

type Campaign = {
  id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_type_id: string;
  created_at: string;
};

type CampaignsContextType = {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  isLoading: boolean;
  error: string | null;
  refreshCampaigns: () => Promise<void>;
  userId: string | undefined;
};

const CampaignsContext = createContext<CampaignsContextType | undefined>(undefined);

export const useCampaigns = () => {
  const context = useContext(CampaignsContext);
  if (!context) {
    throw new Error('useCampaigns must be used within a CampaignsProvider');
  }
  return context;
};

interface CampaignsProviderProps {
  children: ReactNode;
  userId?: string;
}

export const CampaignsProvider: React.FC<CampaignsProviderProps> = ({ children, userId }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchCampaigns = async () => {
    try {
      setIsLoading(true);
      
      if (!userId) {
        console.error('No user ID provided');
        setError('Authentication required');
        return;
      }
      
      const { data, error: rpcError } = await supabase
        .rpc('get_user_campaigns', {
          user_id: userId
        });

      if (rpcError) {
        console.error('RPC error:', rpcError);
        throw rpcError;
      }

      setCampaigns(data || []);
      setError(null);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setError('Failed to fetch campaigns');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [userId]);

  const refreshCampaigns = async () => {
    await fetchCampaigns();
  };

  return (
    <CampaignsContext.Provider value={{ campaigns, setCampaigns, isLoading, error, refreshCampaigns, userId }}>
      {children}
    </CampaignsContext.Provider>
  );
}; 